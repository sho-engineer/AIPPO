"""登録・ログインと、ゲストの記録の引き継ぎ。

第一リリースの合否そのもの。
「成果物を作ってから登録し、別端末で続きを再開できる」が成り立たないと、
Closed Beta を始める意味がない。
"""

from __future__ import annotations

import uuid

import pytest
from django.contrib.auth import get_user_model
from django.core import mail

from apps.accounts.models import LearnerIdentity, UserProfile
from apps.lessons.models import LearningEvent, LearningEventType, LearningSession

User = get_user_model()

SIGNUP = "/api/v1/accounts/signup/"
SIGNIN = "/api/v1/accounts/signin/"
SIGNOUT = "/api/v1/accounts/signout/"
ME = "/api/v1/accounts/me/"

GOOD = {
    "email": "learner@example.com",
    "password": "aippo-strong-pass-9",
    "display_name": "たろう",
    "accept_terms": True,
    "accept_privacy": True,
}


@pytest.fixture(autouse=True)
def _mail_to_memory(settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    mail.outbox.clear()


def _guest_session(client, lesson_id="rewrite_text") -> LearningSession:
    """先にゲストとして学習した状態を作る。

    learner_key の Cookie は、何か1回叩けば発行される。
    """
    client.get(ME)
    key = uuid.UUID(client.cookies["learner_key"].value)
    return LearningSession.objects.create(learner_key=key, lesson_id=lesson_id)


@pytest.mark.django_db
class TestSignUp:
    def test_creates_an_account_and_signs_them_in(self, client):
        response = client.post(SIGNUP, GOOD, content_type="application/json")

        assert response.status_code == 201
        assert response.json()["user"]["email"] == "learner@example.com"
        # そのままログイン状態になること。もう一度入力させない
        assert client.get(ME).json()["authenticated"] is True

    def test_records_which_terms_they_agreed_to(self, client):
        client.post(SIGNUP, GOOD, content_type="application/json")

        profile = UserProfile.objects.get(user__email="learner@example.com")
        assert profile.terms_version
        assert profile.terms_agreed_at is not None

    def test_refuses_without_consent(self, client):
        response = client.post(
            SIGNUP,
            {**GOOD, "accept_terms": False},
            content_type="application/json",
        )

        assert response.status_code == 400
        assert not User.objects.exists()

    def test_refuses_a_duplicate_email(self, client):
        client.post(SIGNUP, GOOD, content_type="application/json")

        response = client.post(
            SIGNUP, {**GOOD, "password": "another-strong-pass-1"}, content_type="application/json"
        )

        assert response.status_code == 400
        assert "email" in response.json()["errors"]
        assert User.objects.count() == 1

    def test_refuses_a_weak_password(self, client):
        response = client.post(
            SIGNUP, {**GOOD, "password": "password"}, content_type="application/json"
        )

        assert response.status_code == 400
        assert "password" in response.json()["errors"]

    def test_sends_a_verification_email(self, client):
        client.post(SIGNUP, GOOD, content_type="application/json")

        subjects = [message.subject for message in mail.outbox]
        assert any("確認" in subject for subject in subjects)

    def test_never_puts_the_password_in_the_email(self, client):
        client.post(SIGNUP, GOOD, content_type="application/json")

        for message in mail.outbox:
            assert GOOD["password"] not in message.body

    def test_never_returns_the_password(self, client):
        body = client.post(SIGNUP, GOOD, content_type="application/json").json()

        assert "password" not in str(body)


@pytest.mark.django_db
class TestGuestMigration:
    """登録前の学習が、登録後も残ること。"""

    def test_guest_progress_is_claimed_on_signup(self, client):
        session = _guest_session(client)

        response = client.post(SIGNUP, GOOD, content_type="application/json")

        assert response.json()["migration"]["linked"] is True
        assert response.json()["migration"]["sessions"] == 1

        user = User.objects.get(email=GOOD["email"])
        assert LearnerIdentity.objects.get(learner_key=session.learner_key).user == user

    def test_progress_shows_up_after_signup(self, client):
        _guest_session(client)
        client.post(SIGNUP, GOOD, content_type="application/json")

        progress = client.get(ME).json()["progress"]

        assert progress["in_progress"] == 1

    def test_migration_is_idempotent(self, client):
        """二度実行しても、結びつきは1つのまま。

        登録直後の再読み込みや、通信が切れての押し直しは普通に起きる。
        そのたびに増えると、数え上げが狂う。
        """
        from apps.accounts.migration import claim_guest_data

        session = _guest_session(client)
        client.post(SIGNUP, GOOD, content_type="application/json")
        user = User.objects.get(email=GOOD["email"])

        first = claim_guest_data(user, session.learner_key)
        second = claim_guest_data(user, session.learner_key)

        assert first.already or second.already
        assert LearnerIdentity.objects.filter(learner_key=session.learner_key).count() == 1

    def test_does_not_steal_another_persons_key(self, client):
        """同じ端末を2人で使ったとき、あとの人が前の人の記録を取らない。"""
        from apps.accounts.migration import claim_guest_data

        session = _guest_session(client)
        first = User.objects.create_user(username="a@example.com", email="a@example.com")
        claim_guest_data(first, session.learner_key)

        second = User.objects.create_user(username="b@example.com", email="b@example.com")
        result = claim_guest_data(second, session.learner_key)

        assert result.linked is False
        assert LearnerIdentity.objects.get(learner_key=session.learner_key).user == first

    def test_signup_still_succeeds_when_migration_fails(self, client, monkeypatch):
        """引き継ぎに失敗しても、登録そのものは通ること。

        ここで登録ごと失敗させると、もう一度登録しようとして
        「そのメールアドレスは使われています」に当たり、そこで詰む。
        """
        _guest_session(client)

        def _boom(*args, **kwargs):
            raise RuntimeError("引き継ぎに失敗")

        monkeypatch.setattr("apps.accounts.views.claim_guest_data", _boom)

        response = client.post(SIGNUP, GOOD, content_type="application/json")

        assert response.status_code == 201
        assert response.json()["migration"]["linked"] is False
        assert response.json()["migration"]["retryable"] is True
        assert User.objects.filter(email=GOOD["email"]).exists()

    def test_migration_events_are_recorded(self, client):
        _guest_session(client)
        client.post(SIGNUP, GOOD, content_type="application/json")

        kinds = set(LearningEvent.objects.values_list("event_type", flat=True))

        assert LearningEventType.GUEST_DATA_MIGRATION_STARTED in kinds
        assert LearningEventType.GUEST_DATA_MIGRATION_COMPLETED in kinds

    def test_events_never_carry_the_text(self, client):
        _guest_session(client)
        client.post(SIGNUP, GOOD, content_type="application/json")

        for event in LearningEvent.objects.all():
            assert not hasattr(event, "user_input")


@pytest.mark.django_db
class TestSignIn:
    def _register(self, client):
        client.post(SIGNUP, GOOD, content_type="application/json")
        client.post(SIGNOUT, {}, content_type="application/json")

    def test_signs_in_with_the_right_password(self, client):
        self._register(client)

        response = client.post(
            SIGNIN,
            {"email": GOOD["email"], "password": GOOD["password"]},
            content_type="application/json",
        )

        assert response.status_code == 200
        assert client.get(ME).json()["authenticated"] is True

    def test_refuses_a_wrong_password(self, client):
        self._register(client)

        response = client.post(
            SIGNIN,
            {"email": GOOD["email"], "password": "wrong-password-here"},
            content_type="application/json",
        )

        assert response.status_code == 401

    def test_does_not_reveal_whether_the_email_exists(self, client):
        """登録済みかどうかを外から調べられないこと。"""
        self._register(client)

        known = client.post(
            SIGNIN,
            {"email": GOOD["email"], "password": "wrong-password-here"},
            content_type="application/json",
        )
        unknown = client.post(
            SIGNIN,
            {"email": "nobody@example.com", "password": "wrong-password-here"},
            content_type="application/json",
        )

        assert known.status_code == unknown.status_code
        assert known.json()["errors"] == unknown.json()["errors"]

    def test_another_device_sees_the_same_progress(self, client, django_user_model):
        """別端末からログインしても、続きが残っていること。

        第一リリースの合否そのもの。
        """
        # 1台目：ゲストで学習してから登録
        _guest_session(client)
        client.post(SIGNUP, GOOD, content_type="application/json")

        # 2台目：Cookie を持たない別の端末
        from django.test import Client

        other = Client()
        other.post(
            SIGNIN,
            {"email": GOOD["email"], "password": GOOD["password"]},
            content_type="application/json",
        )

        progress = other.get(ME).json()["progress"]
        assert progress["in_progress"] == 1
        # 端末が2つ結びついていること
        assert progress["devices"] == 2


@pytest.mark.django_db
class TestSessionAuth:
    """合言葉を画面へ渡さないこと。"""

    def test_no_token_is_returned(self, client):
        body = client.post(SIGNUP, GOOD, content_type="application/json").json()

        for forbidden in ("token", "access", "refresh", "jwt"):
            assert forbidden not in str(body).lower()

    def test_session_cookie_is_http_only(self, client):
        client.post(SIGNUP, GOOD, content_type="application/json")

        assert client.cookies["sessionid"]["httponly"]

    def test_signing_out_ends_the_session(self, client):
        client.post(SIGNUP, GOOD, content_type="application/json")
        client.post(SIGNOUT, {}, content_type="application/json")

        assert client.get(ME).json()["authenticated"] is False


@pytest.mark.django_db
class TestPasswordReset:
    def test_sends_a_link_for_a_known_email(self, client):
        client.post(SIGNUP, GOOD, content_type="application/json")
        mail.outbox.clear()

        response = client.post(
            "/api/v1/accounts/password/reset/",
            {"email": GOOD["email"]},
            content_type="application/json",
        )

        assert response.status_code == 200
        assert len(mail.outbox) == 1

    def test_send_failure_is_logged_but_not_leaked_in_the_response(
        self, client, monkeypatch, caplog
    ):
        """SMTP が壊れていて、実は届かなかったとき。

        以前は `send_password_reset` の戻り値（成功/失敗）を見ずに捨てて
        いたので、登録済みの相手でも送信が失敗しているのに「送信しました」
        がそのまま返っていた。問い合わせが来るまで誰も気づけない。

        直したのは応答ではなく可観測性。応答は変えない
        ——変えると、登録の有無が応答の違いから漏れる
        （このテストは同じ応答のままであることも確かめる）。
        失敗した事実は、ログにだけはっきり残す。
        """
        client.post(SIGNUP, GOOD, content_type="application/json")

        import apps.accounts.views as accounts_views

        monkeypatch.setattr(accounts_views.emails, "send_password_reset", lambda user: False)

        with caplog.at_level("ERROR"):
            response = client.post(
                "/api/v1/accounts/password/reset/",
                {"email": GOOD["email"]},
                content_type="application/json",
            )

        # 応答は「成功したとき」と見分けが付かない
        assert response.status_code == 200
        assert response.json()["sent"] is True
        # 失敗の事実はログに残る
        assert "accounts.password_reset.send_failed" in caplog.text

    def test_says_the_same_thing_for_an_unknown_email(self, client):
        response = client.post(
            "/api/v1/accounts/password/reset/",
            {"email": "nobody@example.com"},
            content_type="application/json",
        )

        assert response.status_code == 200
        assert response.json()["sent"] is True
        # 送ってはいない
        assert mail.outbox == []

    def test_the_link_sets_a_new_password(self, client):
        client.post(SIGNUP, GOOD, content_type="application/json")
        client.post(SIGNOUT, {}, content_type="application/json")
        mail.outbox.clear()
        client.post(
            "/api/v1/accounts/password/reset/",
            {"email": GOOD["email"]},
            content_type="application/json",
        )

        body = mail.outbox[0].body
        uid = body.split("uid=")[1].split("&")[0]
        token = body.split("token=")[1].split()[0]

        response = client.post(
            "/api/v1/accounts/password/reset/confirm/",
            {"uid": uid, "token": token, "new_password": "brand-new-pass-77"},
            content_type="application/json",
        )

        assert response.status_code == 200
        assert (
            client.post(
                SIGNIN,
                {"email": GOOD["email"], "password": "brand-new-pass-77"},
                content_type="application/json",
            ).status_code
            == 200
        )

    def test_a_used_link_stops_working(self, client):
        client.post(SIGNUP, GOOD, content_type="application/json")
        client.post(SIGNOUT, {}, content_type="application/json")
        mail.outbox.clear()
        client.post(
            "/api/v1/accounts/password/reset/",
            {"email": GOOD["email"]},
            content_type="application/json",
        )
        body = mail.outbox[0].body
        uid = body.split("uid=")[1].split("&")[0]
        token = body.split("token=")[1].split()[0]
        payload = {"uid": uid, "token": token, "new_password": "brand-new-pass-77"}

        client.post(
            "/api/v1/accounts/password/reset/confirm/", payload, content_type="application/json"
        )
        again = client.post(
            "/api/v1/accounts/password/reset/confirm/", payload, content_type="application/json"
        )

        assert again.status_code == 400


@pytest.mark.django_db
class TestEmailVerification:
    def test_the_link_marks_the_address_as_confirmed(self, client):
        client.post(SIGNUP, GOOD, content_type="application/json")
        verification = next(m for m in mail.outbox if "確認" in m.subject)
        uid = verification.body.split("uid=")[1].split("&")[0]
        token = verification.body.split("token=")[1].split()[0]

        response = client.post(
            "/api/v1/accounts/email/verify/",
            {"uid": uid, "token": token},
            content_type="application/json",
        )

        assert response.status_code == 200
        assert UserProfile.objects.get(user__email=GOOD["email"]).is_email_verified

    def test_learning_continues_before_verification(self, client):
        """確認前でも学習を止めないこと。

        止めると、メールが届かなかった人がその場で行き止まりになる。
        """
        client.post(SIGNUP, GOOD, content_type="application/json")

        assert client.get(ME).json()["authenticated"] is True


@pytest.mark.django_db
class TestDeletion:
    def test_learning_data_can_be_deleted_without_the_account(self, client):
        _guest_session(client)
        client.post(SIGNUP, GOOD, content_type="application/json")

        response = client.post(
            "/api/v1/accounts/learning-data/delete/", {}, content_type="application/json"
        )

        assert response.status_code == 200
        assert LearningSession.objects.count() == 0
        assert User.objects.filter(email=GOOD["email"]).exists()

    def test_the_account_can_be_deleted(self, client):
        _guest_session(client)
        client.post(SIGNUP, GOOD, content_type="application/json")

        response = client.post("/api/v1/accounts/delete/", {}, content_type="application/json")

        assert response.status_code == 200
        assert not User.objects.filter(email=GOOD["email"]).exists()
        assert LearningSession.objects.count() == 0
        assert client.get(ME).json()["authenticated"] is False


@pytest.mark.django_db
class TestProfile:
    def test_display_name_can_be_changed(self, client):
        client.post(SIGNUP, GOOD, content_type="application/json")

        response = client.patch(
            "/api/v1/accounts/profile/",
            {"display_name": "はなこ"},
            content_type="application/json",
        )

        assert response.status_code == 200
        assert response.json()["user"]["display_name"] == "はなこ"

    def test_signed_out_visitors_cannot_change_it(self, client):
        response = client.patch(
            "/api/v1/accounts/profile/",
            {"display_name": "だれか"},
            content_type="application/json",
        )

        assert response.status_code in (401, 403)


@pytest.mark.django_db
class TestCsrf:
    """よそのサイトから、ログイン中の人の代わりに書き込めないこと。

    Cookie は行き先が AIPPO なら自動でついていくので、Cookie だけでは
    「本人がこの画面から押した」ことにならない。合言葉はヘッダで送るため、
    よそのサイトからは用意できない。
    """

    @pytest.fixture
    def strict(self):
        from django.test import Client

        return Client(enforce_csrf_checks=True)

    def test_the_token_is_handed_out_as_a_cookie(self, strict):
        response = strict.get("/api/v1/accounts/csrf/")

        assert response.status_code == 200
        assert strict.cookies["csrftoken"].value
        # 合言葉そのものは本文に入れない
        assert "csrftoken" not in response.content.decode()

    def test_a_write_without_the_token_is_refused(self, strict):
        strict.post(SIGNUP, GOOD, content_type="application/json")

        response = strict.post(
            "/api/v1/accounts/profile/", {"display_name": "だれか"},
            content_type="application/json",
        )

        assert response.status_code == 403

    def test_a_write_with_the_token_goes_through(self, strict):
        strict.get("/api/v1/accounts/csrf/")
        token = strict.cookies["csrftoken"].value
        strict.post(
            SIGNUP, GOOD, content_type="application/json", HTTP_X_CSRFTOKEN=token
        )

        # ログインすると合言葉は入れ替わる。画面は毎回 Cookie を読み直す
        response = strict.patch(
            "/api/v1/accounts/profile/",
            {"display_name": "はなこ"},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=strict.cookies["csrftoken"].value,
        )

        assert response.status_code == 200


class TestTermsVersion:
    """同意の記録に残す版が、画面に出ている文面の版と揃っていること。

    ずれると「2026-08-03 に同意した」と記録されているのに、
    その版の文面がどこにも無い、という状態になる。
    あとから「何に同意したのか」を示せなくなる。
    """

    def test_matches_the_document_shown_to_people(self):
        import re
        from pathlib import Path

        from apps.accounts.serializers import TERMS_VERSION

        source = (
            Path(__file__).resolve().parents[2]
            / "frontend"
            / "src"
            / "content"
            / "legal.ts"
        ).read_text(encoding="utf-8")

        match = re.search(r'TERMS_VERSION = "([^"]+)"', source)
        assert match, "frontend/src/content/legal.ts に TERMS_VERSION が無い"
        assert match.group(1) == TERMS_VERSION
