"""アカウントの入口。

置き方の決まり
--------------
- 認証は Django のセッション。合言葉を localStorage へ置かない
  （置くと、画面に差し込まれた script から読み取れる）
- Cookie は HttpOnly / Secure / SameSite。本番設定は config/settings.py
- 登録の直後にログイン状態にする。もう一度ログインさせない
- 引き継ぎに失敗しても**登録は成功させる**。
  「登録できませんでした」と言われた人は、もう一度登録しようとして
  「そのメールアドレスは使われています」に当たり、そこで詰む
"""

from __future__ import annotations

import logging
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.tokens import default_token_generator
from django.db import transaction
from django.http import HttpResponseRedirect
from django.shortcuts import redirect
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import emails
from apps.accounts.migration import (
    MIGRATION_COMPLETED,
    MIGRATION_FAILED,
    MIGRATION_STARTED,
    claim_guest_data,
    record_migration_event,
)
from apps.accounts.models import UserProfile, learner_keys_for
from apps.accounts.scope import device_key
from apps.accounts.serializers import (
    TERMS_VERSION,
    EmailVerifySerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileUpdateSerializer,
    SignInSerializer,
    SignUpSerializer,
    describe_user,
)
from apps.accounts.throttle import TooManyAttempts, cooldown_seconds
from apps.accounts.throttle import clear as clear_attempts
from apps.accounts.throttle import consume as consume_attempt
from apps.lessons.models import LearningEvent, LearningEventType, LearningSession
from apps.lessons.services.quota import client_ip
from apps.ops import audit

logger = logging.getLogger(__name__)
User = get_user_model()


def _invalid(errors: dict, code: str = "INVALID_INPUT") -> Response:
    return Response({"code": code, "errors": errors}, status=status.HTTP_400_BAD_REQUEST)


def _too_many(exc: TooManyAttempts) -> Response:
    """連打を断る。

    何分待てばよいかを言う。「しばらく」だけだと、待つべきか
    壊れているのかが分からず、結局押し直される。

    その相手が登録済みかどうかは、この応答からは分からない。
    数えているのは「来た回数」で、実在するかは見ていない。
    """
    minutes = max(1, round(exc.retry_after / 60))
    response = Response(
        {
            "code": "TOO_MANY_ATTEMPTS",
            "errors": {
                "detail": [
                    f"回数が多すぎます。{minutes}分ほどおいてから、"
                    "もう一度お試しください。"
                ]
            },
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )
    response["Retry-After"] = str(exc.retry_after)
    return response



def _record_account_event(request: Request, event_type: str) -> None:
    """アカウントまわりの出来事を、操作ログに1行残す。

    レッスンの外で起きるので、セッションは作らない——架空の
    セッションを作ると、学習の数え上げ（何本進めたか）に中身の無い
    1本が混ざる。誰のことかは端末の鍵で持つ。

    **本文もメールアドレスも残さない。** 見たいのは「どこで詰まるか」
    であって、誰が詰まったかではない。

    記録に失敗しても、呼び出し元の処理は続ける。ログのために
    登録や再設定を落とさない。
    """
    try:
        LearningEvent.objects.create(
            session=None,
            learner_key=device_key(request),
            event_type=event_type,
        )
    except Exception:  # noqa: BLE001 - 記録のために本筋を落とさない
        logger.warning("accounts.event.record_failed type=%s", event_type)


class CsrfTokenView(APIView):
    """CSRF の合言葉を Cookie として配る。

    Django は `get_token()` を呼ぶまで Cookie を置かない。画面は
    最初の POST の前にここを1回叩き、Cookie の値を X-CSRFToken として送り返す。
    合言葉そのものは応答本文には入れない。Cookie だけで足りる。
    """

    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request: Request) -> Response:
        return Response({"ok": True})


class SignUpView(APIView):
    """新規登録。

    登録が終わったら、その端末に残っていた学習の記録を引き継ぐ。
    """

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        # 中身を見る前に数える。形の違う要求を投げ続ける手を止める
        try:
            consume_attempt("signup", request)
        except TooManyAttempts as exc:
            return _too_many(exc)

        serializer = SignUpSerializer(data=request.data)
        if not serializer.is_valid():
            return _invalid(serializer.errors)

        data = serializer.validated_data
        learner_key = getattr(request, "learner_key", None)

        if learner_key is not None:
            record_migration_event(learner_key, LearningEventType.SIGNUP_STARTED)

        with transaction.atomic():
            user = User.objects.create_user(
                username=data["email"],
                email=data["email"],
                password=data["password"],
            )
            UserProfile.objects.create(
                user=user,
                display_name=data.get("display_name", ""),
                terms_version=TERMS_VERSION,
                terms_agreed_at=timezone.now(),
            )

        # 登録した本人としてログインさせる。もう一度入力させない
        login(request, user)

        migration = self._claim(user, learner_key)
        emails.send_verification(user)
        emails.send_welcome(user)
        if learner_key is not None:
            record_migration_event(learner_key, LearningEventType.SIGNUP_COMPLETED)

        return Response(
            {
                "user": describe_user(user),
                "migration": migration,
            },
            status=status.HTTP_201_CREATED,
        )

    def _claim(self, user, learner_key) -> dict[str, object]:
        """引き継ぐ。失敗しても登録は成功のままにする。"""
        if learner_key is None:
            return {"linked": False, "sessions": 0, "already_linked": False}

        record_migration_event(learner_key, MIGRATION_STARTED)
        try:
            result = claim_guest_data(user, learner_key)
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "accounts.migration.failed user=%s error=%s", user.pk, type(exc).__name__
            )
            record_migration_event(learner_key, MIGRATION_FAILED)
            return {
                "linked": False,
                "sessions": 0,
                "already_linked": False,
                "retryable": True,
            }

        record_migration_event(learner_key, MIGRATION_COMPLETED)
        return result.as_dict()


class SignInView(APIView):
    """ログイン。

    いまの端末の learner_key も、その人のものとして結びつける。
    別端末でログインしたときに、その端末で始めた分が迷子にならない。
    """

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = SignInSerializer(data=request.data)
        if not serializer.is_valid():
            return _invalid(serializer.errors)

        email = serializer.validated_data["email"].strip().lower()

        """
        数えるのは接続元と、狙われている宛先の2つ。

        接続元だけだと、複数の場所から1つのアカウントを狙う形を止められない。
        宛先だけだと、1か所から多数のアカウントを順に試す形を止められない。
        """
        try:
            consume_attempt("signin", request, email)
        except TooManyAttempts as exc:
            logger.info("accounts.signin.throttled")
            return _too_many(exc)

        user = authenticate(
            request, username=email, password=serializer.validated_data["password"]
        )
        if user is None:
            """
            どちらが違うかは言わない。

            「そのメールアドレスは登録されていません」と返すと、
            どのメールが登録済みかを外から調べられる。
            """
            logger.info("accounts.signin.failed")
            return Response(
                {
                    "code": "INVALID_CREDENTIALS",
                    "errors": {
                        "detail": [
                            "メールアドレスかパスワードが違います。もう一度お試しください。"
                        ]
                    },
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        login(request, user)
        # 入れた人の数えは消す。打ち間違いを数回した人が、
        # 次に開いたときまだ上限の近くにいるのを避ける
        clear_attempts("signin", request, email)

        learner_key = getattr(request, "learner_key", None)
        if learner_key is not None:
            try:
                claim_guest_data(user, learner_key)
            except Exception as exc:  # noqa: BLE001
                # 結びつけに失敗してもログインは通す
                logger.error("accounts.signin.link_failed error=%s", type(exc).__name__)
            record_migration_event(learner_key, LearningEventType.LOGIN_COMPLETED)

        return Response({"user": describe_user(user)})


class SignOutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        logout(request)
        return Response({"signed_out": True})


class MeView(APIView):
    """いまのログイン状態。画面は開くたびにここを見る。"""

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        user = request.user
        if not user.is_authenticated:
            return Response({"authenticated": False})

        keys = learner_keys_for(user)
        sessions = LearningSession.objects.filter(learner_key__in=keys)

        return Response(
            {
                "authenticated": True,
                "user": describe_user(user),
                "progress": {
                    "completed": sessions.filter(completed_at__isnull=False).count(),
                    "in_progress": sessions.filter(completed_at__isnull=True).count(),
                    "devices": len(keys),
                },
            }
        )


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request: Request) -> Response:
        serializer = ProfileUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return _invalid(serializer.errors)

        profile, _ = UserProfile.objects.get_or_create(user=request.user)

        """送られてきた項目だけを直す。

        表示名と知らせの設定は別の画面から届く。片方だけ送られたときに
        もう片方を既定値で上書きすると、触っていない設定が黙って戻る。
        """
        changed = ["updated_at"]
        data = serializer.validated_data
        if "display_name" in data:
            profile.display_name = data["display_name"]
            changed.append("display_name")
        if "remind_study" in data:
            profile.remind_study = data["remind_study"]
            changed.append("remind_study")

        profile.save(update_fields=changed)

        return Response({"user": describe_user(request.user)})


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = PasswordChangeSerializer(data=request.data)
        if not serializer.is_valid():
            return _invalid(serializer.errors)

        user = request.user
        if not user.check_password(serializer.validated_data["current_password"]):
            return _invalid(
                {"current_password": ["いまのパスワードが違います。"]},
                code="INVALID_CREDENTIALS",
            )

        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        # パスワードを変えるとセッションが切れるので、入れ直す
        login(request, user)

        return Response({"changed": True})


class PasswordResetRequestView(APIView):
    """再設定の案内を送る。

    登録が無いメールでも同じ応答を返す。返し分けると、
    どのメールが登録済みかを外から調べられる。
    """

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = PasswordResetRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _invalid(serializer.errors)

        email = serializer.validated_data["email"].strip().lower()

        """
        送る前に数える。数えるのは「来た回数」で、実在するかは見ない。

        見てから数えると、断り方（429 か 200 か）で
        登録済みかどうかが外から分かってしまう。
        """
        try:
            consume_attempt("password_reset", request, email)
        except TooManyAttempts as exc:
            return _too_many(exc)

        """
        応答は登録の有無に関わらず同じにする（上のとおり）。

        だからといって、実際に送れたかどうかを見ずに捨ててよいわけではない。
        `send_password_reset` は成功/失敗を bool で返す。以前はこれを
        受け取らずに捨てていたため、SMTP の設定が壊れていて
        本当に送れていない登録済みユーザーにも「送信しました」がそのまま
        返っていた——問い合わせが来るまで、運営側も気づけない状態だった。

        戻り値は**応答には出さない**（出すと登録の有無が漏れる）。
        ログにだけ残す。`accounts.email.failed` は emails.py 側でも
        記録されるが、ここで「re用途で失敗した」という1行を足しておくと、
        Sentry 等で `password_reset` 単位に絞って見張れる。
        """
        """
        応答は登録の有無に関わらず同じにする（上のとおり）。

        だからといって、実際に送れたかどうかを見ずに捨ててよいわけではない。
        `send_password_reset` は成功/失敗を bool で返す。以前はこれを
        受け取らずに捨てていたため、SMTP の設定が壊れていて
        本当に送れていない登録済みユーザーにも「送信しました」がそのまま
        返っていた——問い合わせが来るまで、運営側も気づけない状態だった。

        戻り値は**応答には出さない**（出すと登録の有無が漏れる）。
        ログにだけ残す。`accounts.email.failed` は emails.py 側でも
        記録されるが、ここで「re用途で失敗した」という1行を足しておくと、
        Sentry 等で `password_reset` 単位に絞って見張れる。
        """
        user = User.objects.filter(email__iexact=email).first()
        sent = False
        if user is not None:
            sent = emails.send_password_reset(user)
            if not sent:
                logger.error("accounts.password_reset.send_failed")

        """
        実際に送れた回だけ、記録に1行残す（Analytics）。

        画面側の `password_reset_requested`（押した回）と対にする。
        押した数と送れた数が離れていれば、送り口が壊れている——
        画面には出せない（登録の有無が漏れる）ので、ここでしか見えない。

        **メールアドレスは残さない。** 誰が押したかではなく、
        送り口が動いているかを見るための記録。
        """
        if sent:
            _record_account_event(
                request, LearningEventType.PASSWORD_RESET_SENT
            )

        """
        次に送れるようになるまでの秒数も返す。

        画面はこれで「再送は60秒後にできます」を出す（要件 P0-5）。
        クライアント側に秒数を書き写すと、サーバーの設定を変えたときに
        画面だけ古い数字を出し続ける。**決めるのは1か所**にする。

        登録の有無では変わらない値なので、これを返しても
        どのメールが登録済みかは分からない。
        """
        return Response(
            {
                "sent": True,
                "detail": "登録があれば、再設定の案内をお送りしました。",
                "retry_after": cooldown_seconds("password_reset"),
            }
        )


def _user_from_uid(uid: str):
    try:
        return User.objects.filter(pk=force_str(urlsafe_base64_decode(uid))).first()
    except Exception:  # noqa: BLE001
        return None


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            return _invalid(serializer.errors)

        data = serializer.validated_data
        user = _user_from_uid(data["uid"])
        if user is None or not default_token_generator.check_token(user, data["token"]):
            return Response(
                {
                    "code": "INVALID_TOKEN",
                    "errors": {
                        "detail": [
                            "この案内はすでに使われたか、期限が切れています。"
                            "もう一度お試しください。"
                        ]
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(data["new_password"])
        user.save(update_fields=["password"])

        return Response({"changed": True})


class EmailVerifyView(APIView):
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = EmailVerifySerializer(data=request.data)
        if not serializer.is_valid():
            return _invalid(serializer.errors)

        data = serializer.validated_data
        user = _user_from_uid(data["uid"])
        if user is None or not default_token_generator.check_token(user, data["token"]):
            return Response(
                {
                    "code": "INVALID_TOKEN",
                    "errors": {
                        "detail": ["この確認リンクは使えません。もう一度お送りします。"]
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile, _ = UserProfile.objects.get_or_create(user=user)
        if profile.email_verified_at is None:
            profile.email_verified_at = timezone.now()
            profile.save(update_fields=["email_verified_at", "updated_at"])

        return Response({"verified": True})


class DeleteLearningDataView(APIView):
    """学習の記録だけ消す。アカウントは残す。"""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        keys = learner_keys_for(request.user)
        deleted, _ = LearningSession.objects.filter(learner_key__in=keys).delete()

        from apps.lessons.models import SavedArtifact, SkillProgress
        from apps.profiles.models import LearnerProfile
        from apps.rewards.models import XpEvent

        LearnerProfile.objects.filter(learner_key__in=keys).delete()
        SkillProgress.objects.filter(learner_key__in=keys).delete()
        # 学んだ量も学習の記録。「消した」と言った以上、ここも消す
        XpEvent.objects.filter(learner_key__in=keys).delete()
        SavedArtifact.objects.filter(learner_key__in=keys).delete()
        # セッションに繋がっていない操作ログ（登録・再設定・図鑑）
        LearningEvent.objects.filter(
            session__isnull=True, learner_key__in=keys
        ).delete()

        # 「本当に消えたのか」とあとから聞かれたときに、答えられるようにする。
        # 消した本人の記憶しか残らないのは、答えとして弱い
        audit.record(
            audit.AuditAction.SELF_DATA_DELETE,
            actor="self",
            target_model="lessons.LearningSession",
            target_id=str(request.user.pk),
            ip=client_ip(request),
            rows=deleted,
        )

        logger.info("accounts.learning_data.deleted user=%s", request.user.pk)
        return Response({"deleted": True, "rows": deleted})


class DeleteAccountView(APIView):
    """アカウントごと消す。取り消せない。"""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        user = request.user
        keys = learner_keys_for(user)

        from apps.lessons.models import SavedArtifact, SkillProgress
        from apps.profiles.models import LearnerProfile
        from apps.rewards.models import XpEvent

        LearningSession.objects.filter(learner_key__in=keys).delete()
        LearnerProfile.objects.filter(learner_key__in=keys).delete()
        SkillProgress.objects.filter(learner_key__in=keys).delete()
        XpEvent.objects.filter(learner_key__in=keys).delete()
        SavedArtifact.objects.filter(learner_key__in=keys).delete()
        # セッションに繋がっていない操作ログ（登録・再設定・図鑑）
        LearningEvent.objects.filter(
            session__isnull=True, learner_key__in=keys
        ).delete()

        # 消す**前**に残す。消したあとでは user.pk が無くなり、
        # 「誰のアカウントが消えたか」を書けなくなる
        audit.record(
            audit.AuditAction.SELF_ACCOUNT_DELETE,
            actor="self",
            target_model="accounts.User",
            target_id=str(user.pk),
            ip=client_ip(request),
        )

        logout(request)
        user.delete()

        logger.info("accounts.deleted")
        return Response({"deleted": True})


# ------------------------------------------------------------------ 外部連携


class SocialProvidersView(APIView):
    """使える連携先の一覧。

    設定が入っている先だけを返す。画面はこれを見てボタンを出すので、
    設定していない先のボタンは出ない。押すと落ちるボタンは、無いより悪い。
    """

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        from apps.accounts.social import configured_providers

        return Response(
            {
                "providers": [
                    {
                        "name": provider.name,
                        "label": provider.label,
                        "start_url": f"/api/v1/accounts/social/{provider.name}/start/",
                    }
                    for provider in configured_providers().values()
                ]
            }
        )


class SocialStartView(APIView):
    """向こうの画面へ送り出す。

    GET で入って redirect で出る。画面は `window.location` を差し替える
    だけでよく、合言葉に触らない。
    """

    permission_classes = [AllowAny]

    def get(self, request: Request, provider: str) -> HttpResponseRedirect:
        from apps.accounts.social import SocialAuthError, start

        try:
            return redirect(start(request, provider))
        except SocialAuthError as exc:
            logger.warning("social.start.failed provider=%s reason=%s", provider, exc.reason)
            return redirect(_front_with_error(exc.reason))


class SocialCallbackView(APIView):
    """向こうから戻ってきたところ。

    ここで初めてサーバーがトークンを扱う。画面へは渡さない。
    最後は画面へ戻す。API の応答を見せても、利用者には何も分からない。
    """

    permission_classes = [AllowAny]

    def get(self, request: Request, provider: str) -> HttpResponseRedirect:
        from apps.accounts.social import SocialAuthError, finish
        from apps.accounts.social_signin import sign_in_with

        # 向こうが断った（利用者が「許可しない」を押した、など）
        if request.GET.get("error"):
            logger.info("social.denied provider=%s", provider)
            return redirect(_front_with_error("denied"))

        try:
            identity = finish(
                request,
                provider,
                code=request.GET.get("code", ""),
                state=request.GET.get("state", ""),
            )
            user, created = sign_in_with(
                identity,
                current_user=request.user if request.user.is_authenticated else None,
            )
        except SocialAuthError as exc:
            logger.warning("social.failed provider=%s reason=%s", provider, exc.reason)
            return redirect(_front_with_error(exc.reason))

        login(request, user)

        """
        ゲストの記録を引き継ぐ。

        メールで登録したときと同じ扱いにする。ここを忘れると、
        「Google で入ったら進み具合が消えた」になる。
        """
        learner_key = getattr(request, "learner_key", None)
        if learner_key is not None:
            try:
                claim_guest_data(user, learner_key)
            except Exception as exc:  # noqa: BLE001
                logger.error("social.migration.failed error=%s", type(exc).__name__)

        if created:
            emails.send_welcome(user)

        return redirect(_front_with_success(provider, created))


def _front(path: str = "/") -> str:
    base = (getattr(settings, "FRONTEND_URL", "") or "http://localhost:5173").rstrip("/")
    return f"{base}{path}"


def _front_with_error(reason: str) -> str:
    """画面へ戻す。理由は短い名前だけ渡す。

    文言はサーバーが決めず、画面側の固定文から出す。ここで文を渡すと、
    URL に載せた文字がそのまま画面に出る作りになり、
    差し込みの入口になる。
    """
    return _front(f"/?social_error={quote(reason)}")


def _front_with_success(provider: str, created: bool) -> str:
    kind = "signup" if created else "signin"
    return _front(f"/?social={quote(provider)}&social_result={kind}")
