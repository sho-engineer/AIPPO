"""アカウントのルーティング。"""

from django.urls import path

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
    # 外部サービスでのログイン。設定が入っている先だけが一覧に出る
    path("social/providers/", SocialProvidersView.as_view(), name="social-providers"),
    path("social/<str:provider>/start/", SocialStartView.as_view(), name="social-start"),
    path(
        "social/<str:provider>/callback/",
        SocialCallbackView.as_view(),
        name="social-callback",
    ),
]
