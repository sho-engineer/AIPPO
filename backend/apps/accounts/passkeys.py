"""パスキー（WebAuthn）のやりとり。

合言葉を覚えなくてよくする仕組み。端末が持つ秘密鍵で署名し、
こちらは預かった公開鍵で確かめる。**こちらに秘密は無い。**

やりとりの形
------------
どちらの向きも「こちらが挑戦文を出す → 端末が署名して返す →
こちらが確かめる」の2往復でできている。

    登録:   options/ で挑戦文 → 端末が鍵を作って署名 → verify/ で保存
    ログイン: options/ で挑戦文 → 端末が署名        → verify/ で照合

挑戦文の置き場所
----------------
セッション（サーバー側）に置く。画面へ渡して返させる作りにすると、
攻撃者が自分で作った挑戦文を送り込めてしまい、確かめる意味が無くなる。

使い捨てにする。1度確かめたら消す。残しておくと、盗んだ署名を
もう一度送る手（リプレイ）が通る。

ドメインの扱い
--------------
署名にはドメイン（`rp_id`）が混ざる。だから、偽サイトで作らせた署名は
本物のドメインでは通らない。ここを取り違えると**偽サイトの署名が通る**
ので、設定から素直に決まるようにしてある（config/settings.py）。
"""

from __future__ import annotations

import base64
import logging
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.utils import timezone
from webauthn import (
    base64url_to_bytes,
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.exceptions import (
    InvalidAuthenticationResponse,
    InvalidRegistrationResponse,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from apps.accounts.models import Passkey

logger = logging.getLogger(__name__)

#: 挑戦文をセッションへ置くときの名前。登録とログインで分ける。
#: 1つにまとめると、登録の途中でログインを始めたときに上書きし合う。
REGISTER_CHALLENGE_KEY = "passkey_register_challenge"
SIGNIN_CHALLENGE_KEY = "passkey_signin_challenge"


class PasskeyError(Exception):
    """パスキーのやりとりが成立しなかった。

    画面へ出してよい文だけを持つ。「署名が不正」「挑戦文が古い」の
    ような内訳は出さない——直せる人はいないし、攻撃者には手掛かりになる。
    """

    def __init__(self, detail: str, *, code: str = "PASSKEY_FAILED") -> None:
        super().__init__(code)
        self.detail = detail
        self.code = code


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def rp_id() -> str:
    return settings.PASSKEY_RP_ID


def expected_origins() -> list[str]:
    return list(settings.PASSKEY_ORIGINS)


def is_configured() -> bool:
    """パスキーを出してよいか。

    ドメインが決まっていなければ出さない。押すと必ず失敗するボタンは、
    無いより悪い（外部サービスでのログインと同じ考え方）。
    """
    return bool(rp_id() and expected_origins())


# ------------------------------------------------------------------ 登録

def _descriptors(user) -> list[PublicKeyCredentialDescriptor]:
    """すでに持っているパスキー。

    これを渡すと、同じ端末で2つ目を作ろうとしたときに
    ブラウザが「もう登録済みです」と教えてくれる。
    渡さないと、同じ端末のパスキーが静かに増えていく。
    """
    return [
        PublicKeyCredentialDescriptor(id=base64url_to_bytes(key.credential_id))
        for key in user.passkeys.all()
    ]


def start_registration(request, user) -> dict[str, Any]:
    """登録の挑戦文を作る。ログイン中の人だけが呼べる。"""
    if not is_configured():
        raise PasskeyError(
            "この環境ではパスキーを使えません。",
            code="PASSKEY_NOT_CONFIGURED",
        )

    options = generate_registration_options(
        rp_id=rp_id(),
        rp_name=settings.PASSKEY_RP_NAME,
        # 画面に出る名前。どのアカウントの鍵かを本人が見分けるためのもの
        user_name=user.email or user.get_username(),
        user_display_name=user.email or user.get_username(),
        # 利用者の番号。メールを入れない——端末に残り、変えても古いまま残る
        user_id=str(user.pk).encode("utf-8"),
        exclude_credentials=_descriptors(user),
        authenticator_selection=AuthenticatorSelectionCriteria(
            # 端末側に鍵を residentKey として持たせる。
            # これがあると、ログインのときにメールを打たなくてよくなる
            resident_key=ResidentKeyRequirement.PREFERRED,
            # 指紋・顔・暗証番号のどれかで本人を確かめてもらう
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )

    request.session[REGISTER_CHALLENGE_KEY] = _b64(options.challenge)
    return _as_dict(options)


def finish_registration(request, user, credential: Any, label: str = "") -> Passkey:
    """返ってきた署名を確かめ、公開鍵を保存する。"""
    challenge = _take_challenge(request, REGISTER_CHALLENGE_KEY)

    try:
        verified = verify_registration_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=rp_id(),
            expected_origin=expected_origins(),
        )
    except (InvalidRegistrationResponse, ValueError, KeyError) as exc:
        logger.warning("passkey.register.rejected reason=%s", type(exc).__name__)
        raise PasskeyError("パスキーを登録できませんでした。") from exc

    credential_id = _b64(verified.credential_id)
    if Passkey.objects.filter(credential_id=credential_id).exists():
        raise PasskeyError(
            "このパスキーはすでに登録されています。",
            code="PASSKEY_ALREADY_REGISTERED",
        )

    return Passkey.objects.create(
        user=user,
        credential_id=credential_id,
        public_key=verified.credential_public_key,
        sign_count=verified.sign_count,
        transports=_transports(credential),
        label=(label or "").strip()[:60],
    )


# ------------------------------------------------------------------ ログイン

def start_signin(request) -> dict[str, Any]:
    """ログインの挑戦文を作る。まだ誰か分からない状態で呼ばれる。

    `allow_credentials` を渡さない。渡すには先に「誰か」を知る必要があり、
    そのためにメールを打たせることになる。端末側に鍵を持たせてあるので、
    ブラウザが持っているものから選ばせれば、何も打たずに入れる。

    ついでに、メールアドレスが登録済みかどうかを外から測れなくなる。
    """
    if not is_configured():
        raise PasskeyError(
            "この環境ではパスキーを使えません。",
            code="PASSKEY_NOT_CONFIGURED",
        )

    options = generate_authentication_options(
        rp_id=rp_id(),
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    request.session[SIGNIN_CHALLENGE_KEY] = _b64(options.challenge)
    return _as_dict(options)


@dataclass(frozen=True)
class SignInResult:
    user: Any
    passkey: Passkey


def finish_signin(request, credential: Any) -> SignInResult:
    """署名を確かめ、誰かを決める。"""
    challenge = _take_challenge(request, SIGNIN_CHALLENGE_KEY)

    raw_id = _credential_id_of(credential)
    passkey = Passkey.objects.filter(credential_id=raw_id).select_related("user").first()
    if passkey is None:
        # 「そのパスキーは知らない」と言わない。登録の有無を外から測られる
        logger.info("passkey.signin.unknown_credential")
        raise PasskeyError("このパスキーではログインできませんでした。")

    try:
        verified = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=rp_id(),
            expected_origin=expected_origins(),
            credential_public_key=bytes(passkey.public_key),
            credential_current_sign_count=passkey.sign_count,
        )
    except (InvalidAuthenticationResponse, ValueError, KeyError) as exc:
        logger.warning("passkey.signin.rejected reason=%s", type(exc).__name__)
        raise PasskeyError("このパスキーではログインできませんでした。") from exc

    """署名の通し番号を進める。

    認証器が署名のたびに増やす数。前より小さければ複製の疑いがあるが、
    0 を返し続ける認証器も多い（Apple の端末など）。
    そこで「0 でなく、かつ増えている」ときだけ控える。
    """
    if verified.new_sign_count > passkey.sign_count:
        passkey.sign_count = verified.new_sign_count

    passkey.last_used_at = timezone.now()
    passkey.save(update_fields=["sign_count", "last_used_at"])

    return SignInResult(user=passkey.user, passkey=passkey)


# ------------------------------------------------------------------ 小道具

def _as_dict(options) -> dict[str, Any]:
    """ブラウザへ渡す形にする。

    `options_to_json` は WebAuthn の決まりどおりに base64url へ直してくれる。
    自分で組み立てると、必ずどこかで詰め方を間違える。
    """
    import json

    return json.loads(options_to_json(options))


def _take_challenge(request, key: str) -> bytes:
    """挑戦文を取り出し、その場で捨てる。

    使い捨てにしないと、盗んだ署名をもう一度送る手が通る。
    """
    raw = request.session.pop(key, None)
    if not raw:
        raise PasskeyError(
            "時間が経ちすぎました。もう一度お試しください。",
            code="PASSKEY_CHALLENGE_EXPIRED",
        )
    return base64url_to_bytes(raw)


def _credential_id_of(credential: Any) -> str:
    if isinstance(credential, dict):
        found = credential.get("id") or credential.get("rawId") or ""
    else:
        found = getattr(credential, "id", "") or ""
    if not isinstance(found, str) or not found:
        raise PasskeyError("このパスキーではログインできませんでした。")
    # 送られてきた形（base64url）のまま突き合わせる。
    # 一度バイト列へ戻して詰め直すと、詰め方の違いで一致しなくなる
    return found.rstrip("=")


def _transports(credential: Any) -> list[str]:
    """繋がり方（internal / usb / hybrid など）。無ければ空。"""
    if not isinstance(credential, dict):
        return []
    response = credential.get("response") or {}
    found = response.get("transports") or []
    return [str(item) for item in found if isinstance(item, str)][:8]
