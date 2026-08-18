"""パスキーの入口。

やりとりの本体は apps/accounts/passkeys.py。ここはその出入口だけを持つ。

  POST passkey/register/options/  ログイン中の人が、この端末の鍵を作る
  POST passkey/register/verify/   作った鍵を保存する
  GET  passkey/                   登録済みの一覧
  DELETE passkey/<id>/            1つ消す

  POST passkey/signin/options/    まだ誰か分からない状態で挑戦文をもらう
  POST passkey/signin/verify/     署名を確かめてログインする

  POST passkey/signup/options/    メールだけ先に預けて、鍵を作る
  POST passkey/signup/verify/     鍵を保存し、そのままログインする

登録（signup）だけ形が違う理由
------------------------------
パスキーは「誰の鍵か」を先に決めないと作れない。だが、まだ
アカウントが無い人にはその「誰か」がいない。

そこで、メールアドレスと同意だけを先に受け取ってアカウントを作り、
その人として鍵を作らせる。合言葉は設定しない
（`set_unusable_password`）。覚えるものを無くすのが目的なので、
ここで合言葉を作らせたら意味がない。

入れなくなったときの逃げ道は、メールでのパスワード再設定。
そこではじめて合言葉を持つことになる。
"""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model, login
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import emails, passkeys
from apps.accounts.migration import claim_guest_data
from apps.accounts.models import Passkey, UserProfile
from apps.accounts.serializers import TERMS_VERSION, describe_user
from apps.accounts.throttle import TooManyAttempts
from apps.accounts.throttle import consume as consume_attempt

logger = logging.getLogger(__name__)
User = get_user_model()


def _failed(exc: passkeys.PasskeyError, code: int = status.HTTP_400_BAD_REQUEST) -> Response:
    return Response(
        {"code": exc.code, "errors": {"detail": [exc.detail]}}, status=code
    )


def _too_many(exc: TooManyAttempts) -> Response:
    return Response(
        {
            "code": "TOO_MANY_ATTEMPTS",
            "errors": {"detail": [exc.detail]},
            "retry_after": exc.retry_after,
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


def describe_passkey(passkey: Passkey) -> dict[str, object]:
    return {
        "id": passkey.pk,
        "label": passkey.label,
        "created_at": passkey.created_at.isoformat(),
        "last_used_at": (
            passkey.last_used_at.isoformat() if passkey.last_used_at else None
        ),
    }


class PasskeySupportView(APIView):
    """パスキーを出してよいか。

    画面はこれを見てボタンを出すか決める。設定が無い環境で
    押させると必ず失敗するので、そこでは最初から出さない。
    """

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        return Response({"available": passkeys.is_configured()})


# ------------------------------------------------------- 既存アカウントへ追加

class PasskeyRegisterOptionsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        try:
            return Response(passkeys.start_registration(request, request.user))
        except passkeys.PasskeyError as exc:
            return _failed(exc)


class PasskeyRegisterVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        credential = request.data.get("credential")
        if not isinstance(credential, dict):
            return Response(
                {
                    "code": "INVALID_INPUT",
                    "errors": {"credential": ["パスキーの情報が足りません。"]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            passkey = passkeys.finish_registration(
                request, request.user, credential, label=request.data.get("label", "")
            )
        except passkeys.PasskeyError as exc:
            return _failed(exc)

        return Response(
            {"passkey": describe_passkey(passkey)}, status=status.HTTP_201_CREATED
        )


class PasskeyListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        return Response(
            {"passkeys": [describe_passkey(key) for key in request.user.passkeys.all()]}
        )


class PasskeyDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request: Request, passkey_id: int) -> Response:
        passkey = request.user.passkeys.filter(pk=passkey_id).first()
        if passkey is None:
            return Response(
                {
                    "code": "PASSKEY_NOT_FOUND",
                    "errors": {"detail": ["そのパスキーは見つかりませんでした。"]},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        """最後の1本を、合言葉が無いまま消させない。

        消した瞬間に、その人はどこからも入れなくなる。
        メールでの再設定で戻れはするが、それを知らずに消す人がいる。
        先に合言葉を決めてもらうか、別の端末で鍵を作ってもらう。
        """
        others = request.user.passkeys.exclude(pk=passkey.pk).count()
        if others == 0 and not request.user.has_usable_password():
            return Response(
                {
                    "code": "PASSKEY_LAST_ONE",
                    "errors": {
                        "detail": [
                            "これが最後のパスキーです。消すとログインできなく"
                            "なるので、先にパスワードを決めるか、"
                            "別の端末でパスキーを作ってください。"
                        ]
                    },
                },
                status=status.HTTP_409_CONFLICT,
            )

        passkey.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------------------------ ログイン

class PasskeySignInOptionsView(APIView):
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        try:
            return Response(passkeys.start_signin(request))
        except passkeys.PasskeyError as exc:
            return _failed(exc)


class PasskeySignInVerifyView(APIView):
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        try:
            # 形の違う要求を投げ続ける手を、中身を見る前に止める
            consume_attempt("signin", request)
        except TooManyAttempts as exc:
            return _too_many(exc)

        credential = request.data.get("credential")
        if not isinstance(credential, dict):
            return Response(
                {
                    "code": "INVALID_INPUT",
                    "errors": {"credential": ["パスキーの情報が足りません。"]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = passkeys.finish_signin(request, credential)
        except passkeys.PasskeyError as exc:
            return _failed(exc, code=status.HTTP_401_UNAUTHORIZED)

        login(request, result.user)

        learner_key = getattr(request, "learner_key", None)
        if learner_key is not None:
            try:
                claim_guest_data(result.user, learner_key)
            except Exception as exc:  # noqa: BLE001
                # 結びつけに失敗してもログインは通す
                logger.error("passkey.signin.link_failed error=%s", type(exc).__name__)

        return Response({"user": describe_user(result.user)})


# ------------------------------------------------------------------ 新規登録

class PasskeySignUpOptionsView(APIView):
    """メールと同意を預かり、その人として鍵を作らせる。

    ここでアカウントができる。鍵はまだ無いので、この時点では
    **どこからも入れないアカウント**になる。
    次の verify で鍵が付いて、はじめて入れるようになる。

    verify まで進まなかった人のアカウントは残る。同じメールで
    もう一度登録しようとしたときに詰まないよう、
    「鍵も合言葉も無い」アカウントは作り直しを許している。
    """

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        try:
            consume_attempt("signup", request)
        except TooManyAttempts as exc:
            return _too_many(exc)

        if not passkeys.is_configured():
            return _failed(
                passkeys.PasskeyError(
                    "この環境ではパスキーを使えません。",
                    code="PASSKEY_NOT_CONFIGURED",
                )
            )

        from apps.accounts.serializers import PasskeySignUpSerializer

        serializer = PasskeySignUpSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"code": "INVALID_INPUT", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = serializer.validated_data
        email = data["email"]

        with transaction.atomic():
            user = User.objects.filter(username=email).first()
            if user is not None:
                """途中でやめた人のアカウントを引き取る。

                鍵も合言葉も無いなら、まだ誰も入れていない。
                消して作り直すと、その間に本人が verify を終えたときに
                消してしまうので、同じものを使い回す。
                """
                if user.passkeys.exists() or user.has_usable_password():
                    return Response(
                        {
                            "code": "EMAIL_TAKEN",
                            "errors": {
                                "email": ["このメールアドレスはすでに使われています。"]
                            },
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                user = User(username=email, email=email)
                user.set_unusable_password()
                user.save()

            UserProfile.objects.update_or_create(
                user=user,
                defaults={
                    "display_name": data.get("display_name", ""),
                    "terms_version": TERMS_VERSION,
                    "terms_agreed_at": timezone.now(),
                },
            )

        try:
            options = passkeys.start_registration(request, user)
        except passkeys.PasskeyError as exc:
            return _failed(exc)

        # どのアカウントの続きかを、こちら側で覚えておく。
        # 画面から送らせると、他人のアカウントに鍵を付けられてしまう
        request.session["passkey_signup_user"] = user.pk
        return Response(options)


class PasskeySignUpVerifyView(APIView):
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        user_id = request.session.pop("passkey_signup_user", None)
        if not user_id:
            return _failed(
                passkeys.PasskeyError(
                    "時間が経ちすぎました。もう一度お試しください。",
                    code="PASSKEY_CHALLENGE_EXPIRED",
                )
            )

        user = User.objects.filter(pk=user_id).first()
        if user is None:
            return _failed(
                passkeys.PasskeyError("登録を続けられませんでした。")
            )

        credential = request.data.get("credential")
        if not isinstance(credential, dict):
            return Response(
                {
                    "code": "INVALID_INPUT",
                    "errors": {"credential": ["パスキーの情報が足りません。"]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            passkeys.finish_registration(
                request, user, credential, label=request.data.get("label", "")
            )
        except passkeys.PasskeyError as exc:
            return _failed(exc)

        login(request, user)

        learner_key = getattr(request, "learner_key", None)
        migration: dict[str, object] = {
            "linked": False,
            "sessions": 0,
            "already_linked": False,
        }
        if learner_key is not None:
            try:
                migration = claim_guest_data(user, learner_key).as_dict()
            except Exception as exc:  # noqa: BLE001
                logger.error("passkey.signup.link_failed error=%s", type(exc).__name__)

        emails.send_verification(user)
        emails.send_welcome(user)

        return Response(
            {"user": describe_user(user), "migration": migration},
            status=status.HTTP_201_CREATED,
        )
