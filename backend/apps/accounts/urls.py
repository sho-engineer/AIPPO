"""アカウントのルーティング。"""

from django.urls import path

from apps.accounts.mfa import (
    MfaConfirmView,
    MfaDisableView,
    MfaSetupView,
    MfaStateView,
    MfaVerifyView,
)
from apps.accounts.passkey_views import (
    PasskeyDeleteView,
    PasskeyListView,
    PasskeyRegisterOptionsView,
    PasskeyRegisterVerifyView,
    PasskeySignInOptionsView,
    PasskeySignInVerifyView,
    PasskeySignUpOptionsView,
    PasskeySignUpVerifyView,
    PasskeySupportView,
)
from apps.accounts.views import (
    CsrfTokenView,
    DeleteAccountView,
    DeleteLearningDataView,
    EmailVerifyView,
    MeView,
    PasswordChangeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    ProfileView,
    SignInView,
    SignOutView,
    SignUpView,
    SocialCallbackView,
    SocialProvidersView,
    SocialStartView,
)

urlpatterns = [
    # 最初の POST の前に1回。CSRF の合言葉を Cookie で受け取る
    path("csrf/", CsrfTokenView.as_view(), name="accounts-csrf"),
    path("signup/", SignUpView.as_view(), name="accounts-signup"),
    path("signin/", SignInView.as_view(), name="accounts-signin"),
    path("signout/", SignOutView.as_view(), name="accounts-signout"),
    # 2段階認証（認証アプリ）。入れたい人だけが設定から入れる
    path("mfa/", MfaStateView.as_view(), name="accounts-mfa"),
    path("mfa/setup/", MfaSetupView.as_view(), name="accounts-mfa-setup"),
    path("mfa/confirm/", MfaConfirmView.as_view(), name="accounts-mfa-confirm"),
    path("mfa/disable/", MfaDisableView.as_view(), name="accounts-mfa-disable"),
    # ログインの続き。合言葉が合っていた人だけがここへ来る
    path("mfa/verify/", MfaVerifyView.as_view(), name="accounts-mfa-verify"),
    # 画面が開くたびに見る。ログイン状態と進み具合
    path("me/", MeView.as_view(), name="accounts-me"),
    path("profile/", ProfileView.as_view(), name="accounts-profile"),
    path("password/change/", PasswordChangeView.as_view(), name="accounts-password-change"),
    path("password/reset/", PasswordResetRequestView.as_view(), name="accounts-password-reset"),
    path(
        "password/reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="accounts-password-reset-confirm",
    ),
    path("email/verify/", EmailVerifyView.as_view(), name="accounts-email-verify"),
    path(
        "learning-data/delete/",
        DeleteLearningDataView.as_view(),
        name="accounts-delete-learning-data",
    ),
    path("delete/", DeleteAccountView.as_view(), name="accounts-delete"),
    # パスキー。合言葉を覚えなくてよくする仕組み
    path("passkey/support/", PasskeySupportView.as_view(), name="passkey-support"),
    path("passkey/", PasskeyListView.as_view(), name="passkey-list"),
    path("passkey/<int:passkey_id>/", PasskeyDeleteView.as_view(), name="passkey-delete"),
    path(
        "passkey/register/options/",
        PasskeyRegisterOptionsView.as_view(),
        name="passkey-register-options",
    ),
    path(
        "passkey/register/verify/",
        PasskeyRegisterVerifyView.as_view(),
        name="passkey-register-verify",
    ),
    path(
        "passkey/signin/options/",
        PasskeySignInOptionsView.as_view(),
        name="passkey-signin-options",
    ),
    path(
        "passkey/signin/verify/",
        PasskeySignInVerifyView.as_view(),
        name="passkey-signin-verify",
    ),
    path(
        "passkey/signup/options/",
        PasskeySignUpOptionsView.as_view(),
        name="passkey-signup-options",
    ),
    path(
        "passkey/signup/verify/",
        PasskeySignUpVerifyView.as_view(),
        name="passkey-signup-verify",
    ),
    # 外部サービスでのログイン。設定が入っている先だけが一覧に出る
    path("social/providers/", SocialProvidersView.as_view(), name="social-providers"),
    path("social/<str:provider>/start/", SocialStartView.as_view(), name="social-start"),
    path(
        "social/<str:provider>/callback/",
        SocialCallbackView.as_view(),
        name="social-callback",
    ),
]
