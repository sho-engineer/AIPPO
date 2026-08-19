"""登録・ログインの入出力検証。

メールアドレスを利用者名として扱う。
Django の User はメールの重複を許すので、ここで塞ぐ。
塞がないと、同じメールで2つのアカウントができ、
どちらでログインしたかで進捗が変わる。
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

User = get_user_model()

#: いま有効な規約の版。文面を直したら上げる。
#: 同意の記録に残すので、あとから「いつ何に同意したか」を示せる。
TERMS_VERSION = "2026-08-03"


class SignUpSerializer(serializers.Serializer):
    """新規登録。

    表示名は任意。最初に聞くことを増やすほど、登録の途中で離れる。
    """

    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    display_name = serializers.CharField(
        max_length=60, required=False, allow_blank=True, default=""
    )
    #: 規約への同意。無いと登録させない。
    accept_terms = serializers.BooleanField()
    accept_privacy = serializers.BooleanField()

    def validate_email(self, value: str) -> str:
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(
                "このメールアドレスはすでに登録されています。"
                "ログインするか、パスワードの再設定をお試しください。"
            )
        return email

    def validate_password(self, value: str) -> str:
        """Django の検査を通す（短すぎる・よくある・数字だけ、など）。

        メッセージはそのまま画面に出るので、専門用語を足さない。
        """
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def validate(self, attrs: dict) -> dict:
        if not attrs.get("accept_terms") or not attrs.get("accept_privacy"):
            raise serializers.ValidationError(
                {
                    "accept_terms": [
                        "利用規約とプライバシーポリシーへの同意が必要です。"
                    ]
                }
            )
        return attrs


class SignInSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, max_length=128)


class ProfileUpdateSerializer(serializers.Serializer):
    display_name = serializers.CharField(
        max_length=60, allow_blank=True, required=False
    )
    #: 学習リマインダーを受け取るか。
    #: 送るのはサーバーなので、端末側にだけ持たせると「切ったのに届く」。
    remind_study = serializers.BooleanField(required=False)

    def validate(self, attrs: dict) -> dict:
        if not attrs:
            raise serializers.ValidationError(
                {"detail": ["変更する項目がありません。"]}
            )
        return attrs


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, max_length=128)
    new_password = serializers.CharField(write_only=True, min_length=8, max_length=128)

    def validate_new_password(self, value: str) -> str:
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=64)
    token = serializers.CharField(max_length=64)
    new_password = serializers.CharField(write_only=True, min_length=8, max_length=128)

    def validate_new_password(self, value: str) -> str:
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value


class EmailVerifySerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=64)
    token = serializers.CharField(max_length=64)


def describe_user(user) -> dict[str, object]:
    """画面へ返す、その人の情報。

    パスワードに関わるものは1つも入れない。
    """
    profile = getattr(user, "profile", None)
    return {
        "email": user.email,
        "display_name": getattr(profile, "display_name", "") or "",
        "email_verified": bool(profile and profile.is_email_verified),
        "terms_version": getattr(profile, "terms_version", "") or "",
        "joined_at": user.date_joined.isoformat(),
        # 知らせを受け取る設定。画面のつまみは、これを見て state を決める
        "remind_study": bool(getattr(profile, "remind_study", True)),
    }


class PasskeySignUpSerializer(serializers.Serializer):
    """パスキーで新規登録するときの、最初の一歩。

    合言葉を受け取らない。覚えるものを無くすのが目的なので、
    ここで作らせたら意味がない。

    メールは受け取る。パスキーを全部失ったときの逃げ道
    （メールでのパスワード再設定）と、こちらからの連絡に要る。

    `SignUpSerializer` と違い、すでに使われているメールをここでは弾かない。
    「鍵も合言葉も無いまま途中でやめたアカウント」は引き取って続きから
    やり直せるようにしたいので、その判断は view 側で行う。
    """

    email = serializers.EmailField(max_length=254)
    display_name = serializers.CharField(
        max_length=60, required=False, allow_blank=True, default=""
    )
    accept_terms = serializers.BooleanField()
    accept_privacy = serializers.BooleanField()

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def validate(self, attrs: dict) -> dict:
        if not attrs.get("accept_terms") or not attrs.get("accept_privacy"):
            raise serializers.ValidationError(
                {
                    "accept_terms": [
                        "利用規約とプライバシーポリシーへの同意が必要です。"
                    ]
                }
            )
        return attrs
