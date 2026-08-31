"""2段階認証（認証アプリ）の出し入れと、ログイン時の追加確認。

    GET    /api/v1/accounts/mfa/            いまの状態
    POST   /api/v1/accounts/mfa/setup/      秘密を作る（まだ有効にしない）
    POST   /api/v1/accounts/mfa/confirm/    コードを1回通して有効にする
    POST   /api/v1/accounts/mfa/disable/    やめる（コードか予備の合言葉が要る）
    POST   /api/v1/accounts/mfa/verify/     ログインの続き（追加確認）

全員に強いない
--------------
一般向けの学習サービスなので、登録の時点で全員に求めると、そこで
止まる人のほうが多い。入れたい人が設定から入れる（要件 P2）。

毎回は聞かない
--------------
1度通したら、その端末は30日おぼえる（署名付きの Cookie）。
新しい端末・期間が過ぎた端末でだけ聞く。毎回聞くと、
**入れた人ほど毎日面倒になる**ので、切る方向に働く。

Cookie の中身は「誰の・いつまで」だけで、秘密は入れない。
署名は Django の SECRET_KEY で行うので、書き換えれば無効になる。

締め出さない
------------
認証アプリを無くした人のために、予備の合言葉を10個渡す。
これが無いと、端末を替えた人が自分のアカウントから締め出される。
2段階認証を入れる以上、付属品ではなく必須の片割れ。

数える
------
コードの入力も、既存の仕組みで数える（`throttle.consume`）。
6桁は総当たりできる短さなので、ここを開けたままにしない。
"""

from __future__ import annotations

import secrets

from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.contrib.auth.hashers import check_password, make_password
from django.core import signing
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import totp
from apps.accounts.models import RecoveryCode, TotpDevice
from apps.accounts.throttle import TooManyAttempts
from apps.accounts.throttle import consume as consume_attempt

User = get_user_model()

#: この端末をおぼえておく Cookie。中身は「誰の・いつまで」だけ
TRUST_COOKIE = "mfa_trust"

#: おぼえておく日数。
#:
#: 短すぎると、入れた人ほど毎日面倒になって切る方向に働く。
#: 長すぎると、借りた端末に残る。1か月を目安にする。
TRUST_DAYS = 30

#: 予備の合言葉の数と長さ。
#:
#: 10個あれば、無くすまでに使い切ることはまずない。
#: 長さは 10文字——短いと当てられ、長いと書き写せない。
RECOVERY_COUNT = 10
RECOVERY_LENGTH = 10

#: 予備の合言葉に使う文字。**紛らわしい字を外す。**
#: 0/O、1/I/l は、紙に書き写したときに読み違える。
RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

#: ログインの途中であることを覚えておくセッションの鍵
PENDING_KEY = "mfa_pending_user"


def _too_many(exc: TooManyAttempts) -> Response:
    return Response(
        {
            "code": "TOO_MANY_ATTEMPTS",
            "errors": {
                "detail": [
                    "回数が多すぎます。"
                    f"{max(1, exc.retry_after // 60)}分ほどおいてから、もう一度お試しください。"
                ]
            },
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
        headers={"Retry-After": str(exc.retry_after)},
    )


# ------------------------------------------------------------ 予備の合言葉


def new_recovery_codes(user) -> list[str]:
    """作り直して、平文を1回だけ返す。

    前の分は消す。残すと、渡した覚えのない合言葉が生き続ける。
    """
    RecoveryCode.objects.filter(user=user).delete()

    codes: list[str] = []
    for _ in range(RECOVERY_COUNT):
        code = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(RECOVERY_LENGTH))
        codes.append(code)
        RecoveryCode.objects.create(user=user, code_hash=make_password(code))
    return codes


def spend_recovery_code(user, code: str) -> bool:
    """合っていれば1つ使う。使ったものは二度と使えない。"""
    cleaned = "".join(character for character in code.upper() if character.isalnum())
    if not cleaned:
        return False

    for row in RecoveryCode.objects.filter(user=user, used_at__isnull=True):
        if check_password(cleaned, row.code_hash):
            row.used_at = timezone.now()
            row.save(update_fields=["used_at"])
            return True
    return False


# ------------------------------------------------------------ 端末をおぼえる


def _trust_value(user) -> str:
    return signing.dumps({"user": user.pk}, salt=TRUST_COOKIE)


def device_is_trusted(request: Request, user) -> bool:
    """この端末は、前に確認を通しているか。

    書き換えられていれば通らない（署名を確かめる）。
    期限が過ぎていても通らない。
    """
    raw = request.COOKIES.get(TRUST_COOKIE)
    if not raw:
        return False
    try:
        data = signing.loads(raw, salt=TRUST_COOKIE, max_age=TRUST_DAYS * 24 * 3600)
    except signing.BadSignature:
        return False
    return data.get("user") == user.pk


def remember_device(response: Response, user) -> None:
    """この端末をおぼえる。Cookie の作法は既存のものと揃える。"""
    response.set_cookie(
        TRUST_COOKIE,
        _trust_value(user),
        max_age=TRUST_DAYS * 24 * 3600,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Lax",
        path="/",
    )


def forget_device(response: Response) -> None:
    response.delete_cookie(TRUST_COOKIE, path="/")


def mfa_is_required(user) -> bool:
    """この人は、追加の確認が要るか。"""
    device = TotpDevice.objects.filter(user=user).first()
    return bool(device and device.is_active)


def start_pending(request: Request, user) -> Response:
    """合言葉は合っていた。まだログインさせず、コードを待つ。

    **ここでログインしない。** 先にログインさせてから聞くと、
    聞いている最中に他の画面が使えてしまう。
    """
    request.session[PENDING_KEY] = user.pk
    return Response(
        {
            "mfa_required": True,
            "detail": "認証アプリのコードを入れてください。",
        }
    )


# ------------------------------------------------------------------ 画面から


class MfaStateView(APIView):
    """GET /api/v1/accounts/mfa/ — いまの状態。"""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        device = TotpDevice.objects.filter(user=request.user).first()
        return Response(
            {
                "enabled": bool(device and device.is_active),
                # 設定の途中で離れた人に、続きから戻れることを伝える
                "pending": bool(device and not device.is_active),
                "recovery_codes_left": RecoveryCode.objects.filter(
                    user=request.user, used_at__isnull=True
                ).count(),
            }
        )


class MfaSetupView(APIView):
    """POST /api/v1/accounts/mfa/setup/ — 秘密を作る。まだ有効にしない。

    ここで返す秘密は、認証アプリへ入れてもらうためのもの。
    **1回コードを通すまで有効にしない**——アプリに入れ損ねた人が、
    次のログインで締め出されるのを防ぐ。
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        device = TotpDevice.objects.filter(user=request.user).first()
        if device and device.is_active:
            return Response(
                {"errors": {"detail": ["すでに設定されています"]}},
                status=status.HTTP_409_CONFLICT,
            )

        # 途中でやめた分は作り直す。前の秘密を使い回さない
        secret = totp.new_secret()
        TotpDevice.objects.update_or_create(
            user=request.user,
            defaults={"secret": secret, "confirmed_at": None, "last_used_counter": -1},
        )

        account = request.user.email or request.user.get_username()
        return Response(
            {
                "secret": totp.grouped(secret),
                # 携帯で開けば、そのままアプリが開いて登録できる
                "uri": totp.provisioning_uri(secret, account=account, issuer="AIPPO"),
            }
        )


class MfaConfirmView(APIView):
    """POST /api/v1/accounts/mfa/confirm/ — コードを1回通して有効にする。

    ここで予備の合言葉を渡す。**渡すのはこの1回だけ。**
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        try:
            consume_attempt("mfa", request, str(request.user.pk))
        except TooManyAttempts as exc:
            return _too_many(exc)

        device = TotpDevice.objects.filter(user=request.user).first()
        if device is None:
            return Response(
                {"errors": {"detail": ["先に設定を始めてください"]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        code = str((request.data or {}).get("code") or "")
        counter = totp.verify(device.secret, code, after=device.last_used_counter)
        if counter is None:
            return Response(
                {"errors": {"code": ["コードが違います。時計のずれもご確認ください"]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        device.confirmed_at = timezone.now()
        device.last_used_counter = counter
        device.save(update_fields=["confirmed_at", "last_used_counter"])

        response = Response({"enabled": True, "recovery_codes": new_recovery_codes(request.user)})
        # 設定した端末は、そのままおぼえる（直後にもう一度聞かない）
        remember_device(response, request.user)
        return response


class MfaDisableView(APIView):
    """POST /api/v1/accounts/mfa/disable/ — やめる。

    やめるにも確認を求める。求めないと、**画面を開けたままの端末を
    借りた人が、黙って外せる**。
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        try:
            consume_attempt("mfa", request, str(request.user.pk))
        except TooManyAttempts as exc:
            return _too_many(exc)

        device = TotpDevice.objects.filter(user=request.user).first()
        if device is None or not device.is_active:
            return Response({"enabled": False})

        code = str((request.data or {}).get("code") or "")
        passed = totp.verify(device.secret, code, after=device.last_used_counter) is not None
        if not passed:
            passed = spend_recovery_code(request.user, code)
        if not passed:
            return Response(
                {"errors": {"code": ["コードが違います"]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        device.delete()
        RecoveryCode.objects.filter(user=request.user).delete()

        response = Response({"enabled": False})
        forget_device(response)
        return response


class MfaVerifyView(APIView):
    """POST /api/v1/accounts/mfa/verify/ — ログインの続き。

    合言葉が合っていた人だけがここへ来る（`PENDING_KEY`）。
    ここを通って初めてログインになる。
    """

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        try:
            consume_attempt("mfa", request)
        except TooManyAttempts as exc:
            return _too_many(exc)

        user_id = request.session.get(PENDING_KEY)
        user = User.objects.filter(pk=user_id).first() if user_id else None
        if user is None:
            return Response(
                {"errors": {"detail": ["もう一度ログインからお試しください"]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        device = TotpDevice.objects.filter(user=user).first()
        if device is None or not device.is_active:
            # 途中で外された。素通しにはせず、入り口から
            request.session.pop(PENDING_KEY, None)
            return Response(
                {"errors": {"detail": ["もう一度ログインからお試しください"]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        code = str((request.data or {}).get("code") or "")
        counter = totp.verify(device.secret, code, after=device.last_used_counter)
        used_recovery = False
        if counter is None:
            used_recovery = spend_recovery_code(user, code)
            if not used_recovery:
                return Response(
                    {"errors": {"code": ["コードが違います"]}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            device.last_used_counter = counter
            device.save(update_fields=["last_used_counter"])

        request.session.pop(PENDING_KEY, None)
        login(request, user)

        response = Response(
            {
                "verified": True,
                # 予備の合言葉で入った人には、残りを伝える。
                # 気づかないうちに使い切ると、次に本当に困る
                "recovery_used": used_recovery,
                "recovery_codes_left": RecoveryCode.objects.filter(
                    user=user, used_at__isnull=True
                ).count(),
            }
        )
        remember_device(response, user)
        return response
