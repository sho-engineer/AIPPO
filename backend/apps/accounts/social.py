"""Google と LINE でログインする。

やりとりの形
------------
OAuth 2.0 の認可コードフロー（PKCE つき）。合言葉は画面へ渡さない。

    画面 → /social/<先>/start/     … 行き先を受け取って飛ぶ
    向こうで本人確認
    向こう → /social/<先>/callback/ … コードを受け取る
    サーバー ⇄ 向こう               … コードを token へ交換（TLS 直結）
    サーバー → 画面へ戻す           … 以降はいつものセッション Cookie

**画面はトークンを一度も見ません。** 受け取るのはいつもの Cookie だけ。
localStorage へ置かないのは、置いた瞬間に差し込まれた script から
読めるようになるため（`config/settings.py` の方針と同じ）。

state と PKCE
-------------
`state` はセッションに置き、戻ってきたときに突き合わせる。無いと、
攻撃者が用意したコードを本人のブラウザに踏ませて、攻撃者のアカウントへ
ログインさせられる（ログイン CSRF）。

PKCE は、コードを横取りされても交換できないようにするためのもの。
こちらは client_secret を持つので必須ではないが、付けない理由も無い。

設定が無い先
------------
ボタンを出さない。押すと落ちるボタンのほうが、無いより悪い。
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)

#: 向こうとのやりとりに待つ秒数。長くすると、その間ワーカーが埋まる。
TIMEOUT = 10


class SocialAuthError(Exception):
    """連携に失敗した。画面へ出してよい文だけを持つ。"""

    def __init__(self, detail: str, *, reason: str = "failed") -> None:
        super().__init__(reason)
        self.detail = detail
        #: 記録に残す用の短い名前。利用者には見せない。
        self.reason = reason


@dataclass(frozen=True)
class Provider:
    name: str
    label: str
    authorize_url: str
    token_url: str
    scope: str
    client_id: str
    client_secret: str
    #: 利用者の情報を取りに行く先。LINE は id_token から取るので空。
    userinfo_url: str = ""

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret)


def _provider(name: str, label: str, **kwargs) -> Provider:
    return Provider(
        name=name,
        label=label,
        client_id=getattr(settings, f"{name.upper()}_CLIENT_ID", ""),
        client_secret=getattr(settings, f"{name.upper()}_CLIENT_SECRET", ""),
        **kwargs,
    )


def all_providers() -> dict[str, Provider]:
    return {
        "google": _provider(
            "google",
            "Google",
            authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
            token_url="https://oauth2.googleapis.com/token",
            userinfo_url="https://openidconnect.googleapis.com/v1/userinfo",
            scope="openid email profile",
        ),
        "line": _provider(
            "line",
            "LINE",
            authorize_url="https://access.line.me/oauth2/v2.1/authorize",
            token_url="https://api.line.me/oauth2/v2.1/token",
            # email は申請が通っている場合だけ返る。通っていなくても
            # ログインはできる（そのときはメールの無いアカウントになる）
            scope="profile openid email",
        ),
    }


def configured_providers() -> dict[str, Provider]:
    return {name: p for name, p in all_providers().items() if p.configured}


def get_provider(name: str) -> Provider:
    provider = configured_providers().get(name)
    if provider is None:
        raise SocialAuthError(
            "この方法でのログインは、いまご利用いただけません。",
            reason="not_configured",
        )
    return provider


def redirect_uri(request, provider: Provider) -> str:
    """向こうへ伝える戻り先。

    向こう側の管理画面にも同じものを登録する必要があるので、
    組み立て方を1か所に閉じる。ずれると「redirect_uri_mismatch」で
    止まるが、その文言からは何がずれたか分からない。
    """
    base = (getattr(settings, "BACKEND_URL", "") or "").rstrip("/")
    path = f"/api/v1/accounts/social/{provider.name}/callback/"
    return f"{base}{path}" if base else request.build_absolute_uri(path)


# ------------------------------------------------------------------ 行き

def _pkce() -> tuple[str, str]:
    """検証子と、その要約。要約だけを先に渡す。"""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def start(request, name: str) -> str:
    """飛び先を組み立て、照合用の値をセッションへ置く。"""
    provider = get_provider(name)
    verifier, challenge = _pkce()
    state = secrets.token_urlsafe(32)

    request.session["social_state"] = state
    request.session["social_verifier"] = verifier
    request.session["social_provider"] = provider.name

    params = {
        "response_type": "code",
        "client_id": provider.client_id,
        "redirect_uri": redirect_uri(request, provider),
        "scope": provider.scope,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    return f"{provider.authorize_url}?{urlencode(params)}"


# ------------------------------------------------------------------ 帰り

@dataclass(frozen=True)
class Identity:
    """向こうが教えてくれた、その人。"""

    provider: str
    subject: str
    email: str
    email_verified: bool
    display_name: str


def _decode_id_token(id_token: str) -> dict:
    """id_token の中身を読む（署名は確かめない）。

    確かめなくてよい理由。この id_token は、こちらから向こうの token
    エンドポイントへ TLS で直接つないで、client_secret で名乗ったうえで
    受け取ったもの。**ブラウザを一度も経由していない**ので、
    途中で誰かが差し替える余地が無い。

    ブラウザ経由で受け取ったものを読むときは、必ず署名を確かめること。
    そちらは差し替えられる。
    """
    try:
        payload = id_token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))
    except Exception:  # noqa: BLE001
        return {}


def _exchange(provider: Provider, code: str, verifier: str, request) -> dict:
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri(request, provider),
        "client_id": provider.client_id,
        "client_secret": provider.client_secret,
        "code_verifier": verifier,
    }
    try:
        response = httpx.post(provider.token_url, data=data, timeout=TIMEOUT)
    except httpx.HTTPError:
        # 向こうが落ちている・遅い。こちらの落ち度ではないので、そう伝える
        logger.error("social.token.unreachable provider=%s", provider.name)
        raise SocialAuthError(
            "接続できませんでした。少し待ってからお試しください。",
            reason="unreachable",
        ) from None

    if response.status_code != 200:
        # 本文にはコードや secret が入りうるので、状態だけ残す
        logger.error(
            "social.token.rejected provider=%s status=%s",
            provider.name,
            response.status_code,
        )
        raise SocialAuthError(
            "確認できませんでした。もう一度お試しください。", reason="rejected"
        )
    return response.json()


def _google_identity(provider: Provider, tokens: dict) -> Identity:
    claims = _decode_id_token(tokens.get("id_token", ""))
    subject = claims.get("sub", "")

    if not subject:
        raise SocialAuthError("確認できませんでした。", reason="no_subject")

    return Identity(
        provider=provider.name,
        subject=subject,
        email=(claims.get("email") or "").strip().lower(),
        # Google は確かめたかどうかを必ず言う。言っていなければ信じない
        email_verified=bool(claims.get("email_verified")),
        display_name=(claims.get("name") or "").strip()[:60],
    )


def _line_identity(provider: Provider, tokens: dict) -> Identity:
    claims = _decode_id_token(tokens.get("id_token", ""))
    subject = claims.get("sub", "")

    if not subject:
        raise SocialAuthError("確認できませんでした。", reason="no_subject")

    """
    LINE のメールは、申請が通っている場合だけ返る。

    無いまま進む。メールが無いとパスワード再設定は使えないが、
    この人は LINE で入るので要らない。ここで断ると、
    申請が通るまで誰も LINE で入れなくなる。
    """
    email = (claims.get("email") or "").strip().lower()

    return Identity(
        provider=provider.name,
        subject=subject,
        email=email,
        # LINE が返すメールは本人確認済みのもの。ただし返ってきたときだけ
        email_verified=bool(email),
        display_name=(claims.get("name") or "").strip()[:60],
    )


def finish(request, name: str, code: str, state: str) -> Identity:
    """戻ってきたコードを、その人の身元へ変える。"""
    provider = get_provider(name)

    expected = request.session.pop("social_state", None)
    verifier = request.session.pop("social_verifier", None)
    started_with = request.session.pop("social_provider", None)

    """
    照合する。

    合っていなければ、この戻りは本人が始めたものではない。
    通すと、攻撃者のアカウントへログインさせられる。
    """
    if not expected or not secrets.compare_digest(expected, state or ""):
        logger.warning("social.state.mismatch provider=%s", name)
        raise SocialAuthError(
            "確認できませんでした。もう一度お試しください。", reason="state_mismatch"
        )
    if started_with != provider.name:
        logger.warning("social.provider.mismatch")
        raise SocialAuthError(
            "確認できませんでした。もう一度お試しください。", reason="provider_mismatch"
        )

    tokens = _exchange(provider, code, verifier or "", request)

    if provider.name == "google":
        return _google_identity(provider, tokens)
    return _line_identity(provider, tokens)
