"""Google と LINE でのログイン。

いちばん危ないのは**結びつけ方**。確かめていないメールで既存の
アカウントへ繋ぐと、他人のメールアドレスを名乗るだけでそのアカウントへ
入れてしまう。ここを機械に見張らせる。

向こうのサービスは呼ばない。呼ぶと、テストが向こうの都合で落ちるし、
そもそも鍵が無い。身元を組み立てたところから先を確かめる。
"""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core import mail

from apps.accounts.models import LearnerIdentity, SocialAccount, UserProfile
from apps.accounts.social import Identity, SocialAuthError
from apps.accounts.social_signin import sign_in_with

User = get_user_model()

PROVIDERS = "/api/v1/accounts/social/providers/"


def google(subject="g-1", email="learner@example.com", verified=True) -> Identity:
    return Identity(
        provider="google",
        subject=subject,
        email=email,
        email_verified=verified,
        display_name="たろう",
    )


def line(subject="l-1", email="") -> Identity:
    return Identity(
        provider="line",
        subject=subject,
        email=email,
        email_verified=bool(email),
        display_name="はなこ",
    )


@pytest.fixture(autouse=True)
def _mail_to_memory(settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    mail.outbox.clear()


@pytest.mark.django_db
class TestFirstTime:
    def test_a_new_person_gets_an_account(self):
        user, created = sign_in_with(google())

        assert created is True
        assert SocialAccount.objects.get(provider="google", subject="g-1").user == user

    def test_a_verified_address_is_kept(self):
        user, _ = sign_in_with(google())

        assert user.email == "learner@example.com"
        assert user.profile.is_email_verified, "向こうで確かめ済みなら、こちらで確認し直さない"

    def test_consent_is_recorded(self):
        """いつ何に同意したかを、あとから示せるようにする。"""
        user, _ = sign_in_with(google())

        profile = UserProfile.objects.get(user=user)
        assert profile.terms_version
        assert profile.terms_agreed_at is not None

    def test_a_password_cannot_be_used(self):
        """パスワードでは入れない口にする。

        空にすると Django は「未設定」として扱い、あとから当てられる
        余地が残る。
        """
        user, _ = sign_in_with(google())

        assert not user.has_usable_password()


@pytest.mark.django_db
class TestComingBack:
    def test_the_same_person_is_the_same_account(self):
        first, _ = sign_in_with(google())
        second, created = sign_in_with(google())

        assert second == first
        assert created is False
        assert SocialAccount.objects.count() == 1

    def test_a_changed_address_does_not_make_a_new_person(self):
        """向こうでメールを変えても、同じ人のまま。

        メールを鍵にしていると、ここで別人になり進み具合が消える。
        """
        first, _ = sign_in_with(google(subject="g-1", email="old@example.com"))

        second, created = sign_in_with(google(subject="g-1", email="new@example.com"))

        assert second == first
        assert created is False

    def test_the_new_address_is_recorded(self):
        sign_in_with(google(subject="g-1", email="old@example.com"))
        sign_in_with(google(subject="g-1", email="new@example.com"))

        account = SocialAccount.objects.get(provider="google", subject="g-1")
        assert account.email == "new@example.com"


@pytest.mark.django_db
class TestLinkingToAnExistingAccount:
    def test_a_verified_address_links_to_the_password_account(self):
        """同じメールで登録済みなら、その人として入る。

        別々のアカウントになると、「登録したはずの進み具合が無い」になる。
        """
        existing = User.objects.create_user(
            username="learner@example.com",
            email="learner@example.com",
            password="aippo-strong-pass-9",
        )

        user, created = sign_in_with(google(email="learner@example.com", verified=True))

        assert user == existing
        assert created is False

    def test_an_unverified_address_never_links(self):
        """ここが乗っ取りの入口。

        確かめていないメールで繋ぐと、他人のアドレスを名乗るだけで
        そのアカウントへ入れてしまう。
        """
        existing = User.objects.create_user(
            username="learner@example.com",
            email="learner@example.com",
            password="aippo-strong-pass-9",
        )

        user, created = sign_in_with(google(email="learner@example.com", verified=False))

        assert user != existing, "確かめていないメールで他人のアカウントへ入れてしまう"
        assert created is True

    def test_an_unverified_address_is_not_stored_on_the_user(self):
        """確かめていないメールを user.email に入れない。

        入れると、次に誰かが確かめ済みで来たときに引き当ててしまう。
        """
        user, _ = sign_in_with(google(email="learner@example.com", verified=False))

        assert user.email == ""


@pytest.mark.django_db
class TestLine:
    def test_it_works_without_an_address(self):
        """LINE はメールを返さないことがある（申請が要る）。

        ここで断ると、申請が通るまで誰も LINE で入れない。
        """
        user, created = sign_in_with(line())

        assert created is True
        assert user.email == ""

    def test_two_line_users_are_two_accounts(self):
        """メールが無くても、別の人は別のアカウントになる。"""
        first, _ = sign_in_with(line(subject="l-1"))
        second, _ = sign_in_with(line(subject="l-2"))

        assert first != second

    def test_google_and_line_with_the_same_address_are_one_person(self):
        google_user, _ = sign_in_with(google(email="learner@example.com"))

        line_user, created = sign_in_with(line(subject="l-9", email="learner@example.com"))

        assert line_user == google_user
        assert created is False
        assert SocialAccount.objects.filter(user=google_user).count() == 2


@pytest.mark.django_db
class TestAddingASecondProvider:
    def test_a_signed_in_person_can_connect_another(self):
        existing = User.objects.create_user(
            username="learner@example.com", email="learner@example.com"
        )

        user, created = sign_in_with(line(subject="l-5"), current_user=existing)

        assert user == existing
        assert created is False
        assert SocialAccount.objects.filter(user=existing, provider="line").exists()

    def test_the_same_provider_cannot_be_connected_twice(self):
        existing = User.objects.create_user(
            username="learner@example.com", email="learner@example.com"
        )
        sign_in_with(google(subject="g-1"), current_user=existing)

        with pytest.raises(SocialAuthError):
            sign_in_with(google(subject="g-2"), current_user=existing)


@pytest.mark.django_db
class TestTheEndpoints:
    def test_nothing_is_offered_without_settings(self, client, settings):
        settings.GOOGLE_CLIENT_ID = ""
        settings.GOOGLE_CLIENT_SECRET = ""
        settings.LINE_CLIENT_ID = ""
        settings.LINE_CLIENT_SECRET = ""

        body = client.get(PROVIDERS).json()

        # 押すと落ちるボタンは、無いより悪い
        assert body["providers"] == []

    def test_a_configured_provider_is_offered(self, client, settings):
        settings.GOOGLE_CLIENT_ID = "test-id"
        settings.GOOGLE_CLIENT_SECRET = "test-secret"
        settings.LINE_CLIENT_ID = ""
        settings.LINE_CLIENT_SECRET = ""

        body = client.get(PROVIDERS).json()

        assert [p["name"] for p in body["providers"]] == ["google"]

    def test_the_secret_is_never_handed_out(self, client, settings):
        settings.GOOGLE_CLIENT_ID = "test-id"
        settings.GOOGLE_CLIENT_SECRET = "super-secret-value"

        text = client.get(PROVIDERS).content.decode()

        assert "super-secret-value" not in text

    def test_starting_sends_you_to_the_provider(self, client, settings):
        settings.GOOGLE_CLIENT_ID = "test-id"
        settings.GOOGLE_CLIENT_SECRET = "test-secret"

        response = client.get("/api/v1/accounts/social/google/start/")

        assert response.status_code == 302
        assert response["Location"].startswith("https://accounts.google.com/")
        # 合言葉の要約だけを渡す。検証子そのものは渡さない
        assert "code_challenge=" in response["Location"]
        assert "code_challenge_method=S256" in response["Location"]

    def test_the_verifier_stays_on_the_server(self, client, settings):
        settings.GOOGLE_CLIENT_ID = "test-id"
        settings.GOOGLE_CLIENT_SECRET = "test-secret"

        response = client.get("/api/v1/accounts/social/google/start/")

        assert "code_verifier" not in response["Location"]
        assert client.session["social_verifier"]

    def test_an_unconfigured_provider_sends_you_back(self, client, settings):
        settings.LINE_CLIENT_ID = ""
        settings.LINE_CLIENT_SECRET = ""

        response = client.get("/api/v1/accounts/social/line/start/")

        assert response.status_code == 302
        assert "social_error=not_configured" in response["Location"]


@pytest.mark.django_db
class TestComingBackFromTheProvider:
    """戻りの入口。ここを素通しにすると、他人のアカウントへ入れられる。"""

    def _configure(self, settings):
        settings.GOOGLE_CLIENT_ID = "test-id"
        settings.GOOGLE_CLIENT_SECRET = "test-secret"

    def test_a_reply_we_did_not_start_is_refused(self, client, settings):
        """`state` が合わないものを通さない。

        通すと、攻撃者が用意したコードを本人のブラウザに踏ませて、
        攻撃者のアカウントへログインさせられる。
        """
        self._configure(settings)

        response = client.get(
            "/api/v1/accounts/social/google/callback/?code=x&state=made-up"
        )

        assert response.status_code == 302
        assert "social_error=state_mismatch" in response["Location"]
        assert not User.objects.exists()

    def test_a_reply_with_no_state_is_refused(self, client, settings):
        self._configure(settings)
        client.get("/api/v1/accounts/social/google/start/")

        response = client.get("/api/v1/accounts/social/google/callback/?code=x")

        assert "social_error=state_mismatch" in response["Location"]

    def test_saying_no_at_the_provider_sends_you_back(self, client, settings):
        self._configure(settings)

        response = client.get(
            "/api/v1/accounts/social/google/callback/?error=access_denied"
        )

        assert response.status_code == 302
        assert "social_error=denied" in response["Location"]

    def test_the_state_cannot_be_used_twice(self, client, settings):
        """一度使った照合値は消える。

        残しておくと、戻りの URL を保存しておいて後から踏ませることが
        できてしまう。
        """
        self._configure(settings)
        client.get("/api/v1/accounts/social/google/start/")
        state = client.session["social_state"]

        client.get(f"/api/v1/accounts/social/google/callback/?code=x&state={state}")
        second = client.get(
            f"/api/v1/accounts/social/google/callback/?code=x&state={state}"
        )

        assert "social_error=state_mismatch" in second["Location"]


@pytest.mark.django_db
class TestGuestData:
    def test_what_was_done_before_signing_in_is_kept(self, client, settings, monkeypatch):
        """Google で入っても、それまでの進み具合が消えないこと。

        メールで登録したときと同じ扱いにする。ここを忘れると
        「Google で入ったら進み具合が消えた」になる。
        """
        from apps.lessons.models import LearningSession

        settings.GOOGLE_CLIENT_ID = "test-id"
        settings.GOOGLE_CLIENT_SECRET = "test-secret"

        # ゲストとして学習した状態を作る
        client.get("/api/v1/accounts/me/")
        import uuid as _uuid

        key = _uuid.UUID(client.cookies["learner_key"].value)
        LearningSession.objects.create(learner_key=key, lesson_id="rewrite_text")

        client.get("/api/v1/accounts/social/google/start/")
        state = client.session["social_state"]

        # 向こうとのやりとりだけ差し替える
        monkeypatch.setattr(
            "apps.accounts.social.finish",
            lambda request, name, code, state: google(),
        )
        response = client.get(
            f"/api/v1/accounts/social/google/callback/?code=x&state={state}"
        )

        assert response.status_code == 302
        assert "social_error" not in response["Location"]

        user = User.objects.get()
        assert LearnerIdentity.objects.filter(learner_key=key, user=user).exists()


@pytest.mark.django_db
class TestWhatIsLogged:
    def test_the_secret_never_reaches_the_log(self, client, settings, caplog):
        settings.GOOGLE_CLIENT_ID = "test-id"
        settings.GOOGLE_CLIENT_SECRET = "super-secret-value"

        client.get("/api/v1/accounts/social/google/start/")
        client.get("/api/v1/accounts/social/google/callback/?code=abc&state=wrong")

        assert "super-secret-value" not in caplog.text
        assert "abc" not in caplog.text


@pytest.mark.django_db
class TestSocialAccountsAreVisibleToSupport:
    def test_the_admin_page_opens(self, client, django_user_model):
        staff = django_user_model.objects.create_superuser(
            "admin@example.com", "admin@example.com", "admin-pass-9xyz"
        )
        client.force_login(staff)

        response = client.get("/admin/accounts/socialaccount/")

        assert response.status_code == 200
