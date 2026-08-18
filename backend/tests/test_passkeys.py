"""パスキーで登録し、パスキーでログインできること。

ここでは**確かめる側を差し替えない**。webauthn ライブラリはそのまま動かし、
署名を作る側（ブラウザと端末のふるまい）を tests/support/fake_authenticator.py
に置いてある。

差し替えてしまうと「署名を確かめている」という肝心の部分がテストから抜け、
署名を確かめずに通す実装でもテストが通ってしまう。ここで守りたいのは
まさにその部分なので、本物の鍵で本物の署名を作って通す。

見るのは4つ。

  1. パスキーだけで登録でき、そのままログイン状態になること
  2. 一度ログアウトしても、パスキーで入り直せること
  3. 挑戦文・ドメイン・署名のどれが違っても通らないこと
  4. 最後の1本を、入れなくなる形で消させないこと
"""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from apps.accounts.models import Passkey
from tests.support.fake_authenticator import FakeAuthenticator

User = get_user_model()

SUPPORT_URL = "/api/v1/accounts/passkey/support/"
SIGNUP_OPTIONS_URL = "/api/v1/accounts/passkey/signup/options/"
SIGNUP_VERIFY_URL = "/api/v1/accounts/passkey/signup/verify/"
SIGNIN_OPTIONS_URL = "/api/v1/accounts/passkey/signin/options/"
SIGNIN_VERIFY_URL = "/api/v1/accounts/passkey/signin/verify/"
REGISTER_OPTIONS_URL = "/api/v1/accounts/passkey/register/options/"
REGISTER_VERIFY_URL = "/api/v1/accounts/passkey/register/verify/"
LIST_URL = "/api/v1/accounts/passkey/"
ME_URL = "/api/v1/accounts/me/"
SIGNOUT_URL = "/api/v1/accounts/signout/"

RP_ID = "localhost"
ORIGIN = "http://localhost:5173"
EMAIL = "passkey@example.com"


@pytest.fixture(autouse=True)
def _rp(settings):
    settings.PASSKEY_RP_ID = RP_ID
    settings.PASSKEY_ORIGINS = [ORIGIN]
    settings.PASSKEY_RP_NAME = "AIPPO"


@pytest.fixture
def device():
    return FakeAuthenticator(rp_id=RP_ID, origin=ORIGIN)


def _json(client, url, payload=None):
    return client.post(url, payload or {}, content_type="application/json")


def _sign_up(client, device, email: str = EMAIL):
    """パスキーだけで登録する。合言葉は一度も出てこない。"""
    options = _json(
        client,
        SIGNUP_OPTIONS_URL,
        {
            "email": email,
            "accept_terms": True,
            "accept_privacy": True,
        },
    )
    assert options.status_code == 200, options.json()

    credential = device.register(options.json()["challenge"])
    return _json(client, SIGNUP_VERIFY_URL, {"credential": credential})


def _sign_in(client, device):
    options = _json(client, SIGNIN_OPTIONS_URL)
    assert options.status_code == 200, options.json()

    credential = device.sign_in(options.json()["challenge"])
    return _json(client, SIGNIN_VERIFY_URL, {"credential": credential})


def _authenticated(client) -> bool:
    return client.get(ME_URL).json()["authenticated"]


@pytest.mark.django_db
class TestSignUpWithAPasskey:
    def test_a_passkey_alone_creates_the_account(self, client, device):
        response = _sign_up(client, device)

        assert response.status_code == 201, response.json()
        assert response.json()["user"]["email"] == EMAIL
        assert _authenticated(client)

    def test_no_password_is_set(self, client, device):
        """合言葉を持たないこと。

        覚えるものを無くすのが目的なので、裏で勝手に作らない。
        """
        _sign_up(client, device)
        user = User.objects.get(username=EMAIL)

        assert not user.has_usable_password()

    def test_the_public_key_is_stored_not_the_private_one(self, client, device):
        _sign_up(client, device)
        passkey = Passkey.objects.get()

        assert passkey.user.email == EMAIL
        assert bytes(passkey.public_key), "公開鍵が保存されていない"
        # 端末の秘密鍵は、こちらのどこにも無い
        private_numbers = device._key.private_numbers().private_value
        assert str(private_numbers).encode() not in bytes(passkey.public_key)

    def test_consent_is_required(self, client):
        response = _json(
            client,
            SIGNUP_OPTIONS_URL,
            {"email": EMAIL, "accept_terms": False, "accept_privacy": True},
        )

        assert response.status_code == 400
        assert not User.objects.filter(username=EMAIL).exists()

    def test_an_email_already_in_use_is_refused(self, client, device):
        User.objects.create_user(username=EMAIL, email=EMAIL, password="already-here-9x")

        response = _json(
            client,
            SIGNUP_OPTIONS_URL,
            {"email": EMAIL, "accept_terms": True, "accept_privacy": True},
        )

        assert response.status_code == 400
        assert response.json()["code"] == "EMAIL_TAKEN"

    def test_an_abandoned_signup_can_be_retried(self, client, device):
        """途中でやめた人が、同じメールでやり直せること。

        鍵も合言葉も無いアカウントは、まだ誰も入れていない。
        「使われています」と言って詰ませない。
        """
        _json(
            client,
            SIGNUP_OPTIONS_URL,
            {"email": EMAIL, "accept_terms": True, "accept_privacy": True},
        )
        # verify へ進まずに離脱した

        response = _sign_up(client, device)

        assert response.status_code == 201, response.json()
        assert User.objects.filter(username=EMAIL).count() == 1


@pytest.mark.django_db
class TestSignInWithAPasskey:
    def test_signing_in_again_after_signing_out(self, client, device):
        _sign_up(client, device)
        _json(client, SIGNOUT_URL)
        assert not _authenticated(client)

        response = _sign_in(client, device)

        assert response.status_code == 200, response.json()
        assert response.json()["user"]["email"] == EMAIL
        assert _authenticated(client)

    def test_no_email_is_needed_to_sign_in(self, client, device):
        """ログインのときに何も打たせないこと。

        端末側に鍵を持たせてあるので、メールを聞く必要が無い。
        聞かないので、そのメールが登録済みかを外から測ることもできない。
        """
        _sign_up(client, device)
        _json(client, SIGNOUT_URL)

        options = _json(client, SIGNIN_OPTIONS_URL)

        assert options.status_code == 200
        # 「この人のパスキー」を絞り込んでいない＝誰かを先に決めていない
        assert not options.json().get("allowCredentials")

    def test_the_sign_count_moves_forward(self, client, device):
        _sign_up(client, device)
        _json(client, SIGNOUT_URL)
        _sign_in(client, device)

        assert Passkey.objects.get().sign_count == device.sign_count

    def test_the_last_used_time_is_recorded(self, client, device):
        _sign_up(client, device)
        assert Passkey.objects.get().last_used_at is None

        _json(client, SIGNOUT_URL)
        _sign_in(client, device)

        assert Passkey.objects.get().last_used_at is not None


@pytest.mark.django_db
class TestItRefusesWhatItShould:
    def test_an_unknown_passkey_cannot_sign_in(self, client, device):
        _sign_up(client, device)
        _json(client, SIGNOUT_URL)

        stranger = FakeAuthenticator(rp_id=RP_ID, origin=ORIGIN)
        options = _json(client, SIGNIN_OPTIONS_URL)
        response = _json(
            client,
            SIGNIN_VERIFY_URL,
            {"credential": stranger.sign_in(options.json()["challenge"])},
        )

        assert response.status_code == 401
        assert not _authenticated(client)

    def test_a_signature_from_another_site_is_refused(self, client, device):
        """偽サイトで作らせた署名が通らないこと。

        パスキーが合言葉より強いのは、ここが効くから。
        署名にドメインが混ざるので、別のドメインで作った署名は通らない。
        """
        _sign_up(client, device)
        _json(client, SIGNOUT_URL)

        evil = FakeAuthenticator(rp_id=RP_ID, origin="https://aippo-phishing.example")
        evil.credential_id = device.credential_id
        evil._key = device._key

        options = _json(client, SIGNIN_OPTIONS_URL)
        response = _json(
            client,
            SIGNIN_VERIFY_URL,
            {"credential": evil.sign_in(options.json()["challenge"])},
        )

        assert response.status_code == 401
        assert not _authenticated(client)

    def test_an_old_challenge_is_refused(self, client, device):
        """挑戦文が使い捨てであること。

        残しておくと、盗んだ署名をもう一度送る手が通る。
        """
        _sign_up(client, device)
        _json(client, SIGNOUT_URL)

        options = _json(client, SIGNIN_OPTIONS_URL)
        challenge = options.json()["challenge"]
        first = _json(client, SIGNIN_VERIFY_URL, {"credential": device.sign_in(challenge)})
        assert first.status_code == 200

        _json(client, SIGNOUT_URL)
        # 同じ挑戦文で、もう一度
        again = _json(client, SIGNIN_VERIFY_URL, {"credential": device.sign_in(challenge)})

        assert again.status_code in (400, 401)
        assert not _authenticated(client)

    def test_a_tampered_signature_is_refused(self, client, device):
        _sign_up(client, device)
        _json(client, SIGNOUT_URL)

        options = _json(client, SIGNIN_OPTIONS_URL)
        credential = device.sign_in(options.json()["challenge"])
        # 署名を1文字だけ変える
        signature = credential["response"]["signature"]
        credential["response"]["signature"] = ("A" if signature[0] != "A" else "B") + signature[1:]

        response = _json(client, SIGNIN_VERIFY_URL, {"credential": credential})

        assert response.status_code == 401
        assert not _authenticated(client)

    def test_a_missing_credential_is_refused(self, client):
        response = _json(client, SIGNIN_VERIFY_URL, {})

        assert response.status_code == 400


@pytest.mark.django_db
class TestManagingPasskeys:
    def _signed_in(self, client, device):
        _sign_up(client, device)
        return client

    def test_a_second_passkey_can_be_added(self, client, device):
        self._signed_in(client, device)

        laptop = FakeAuthenticator(rp_id=RP_ID, origin=ORIGIN)
        options = _json(client, REGISTER_OPTIONS_URL)
        assert options.status_code == 200

        response = _json(
            client,
            REGISTER_VERIFY_URL,
            {"credential": laptop.register(options.json()["challenge"]), "label": "仕事のPC"},
        )

        assert response.status_code == 201, response.json()
        assert Passkey.objects.count() == 2
        assert Passkey.objects.filter(label="仕事のPC").exists()

    def test_either_passkey_can_sign_in(self, client, device):
        self._signed_in(client, device)
        laptop = FakeAuthenticator(rp_id=RP_ID, origin=ORIGIN)
        options = _json(client, REGISTER_OPTIONS_URL)
        _json(client, REGISTER_VERIFY_URL, {"credential": laptop.register(options.json()["challenge"])})
        _json(client, SIGNOUT_URL)

        assert _sign_in(client, laptop).status_code == 200
        _json(client, SIGNOUT_URL)
        assert _sign_in(client, device).status_code == 200

    def test_the_list_shows_what_is_registered(self, client, device):
        self._signed_in(client, device)

        response = client.get(LIST_URL)

        assert response.status_code == 200
        assert len(response.json()["passkeys"]) == 1

    def test_the_last_passkey_cannot_be_removed_without_a_password(self, client, device):
        """消した瞬間にどこからも入れなくなる、を防ぐ。"""
        self._signed_in(client, device)
        passkey = Passkey.objects.get()

        response = client.delete(f"{LIST_URL}{passkey.pk}/")

        assert response.status_code == 409
        assert response.json()["code"] == "PASSKEY_LAST_ONE"
        assert Passkey.objects.count() == 1

    def test_a_passkey_can_be_removed_when_another_one_remains(self, client, device):
        self._signed_in(client, device)
        laptop = FakeAuthenticator(rp_id=RP_ID, origin=ORIGIN)
        options = _json(client, REGISTER_OPTIONS_URL)
        _json(client, REGISTER_VERIFY_URL, {"credential": laptop.register(options.json()["challenge"])})

        first = Passkey.objects.order_by("created_at").first()
        response = client.delete(f"{LIST_URL}{first.pk}/")

        assert response.status_code == 204
        assert Passkey.objects.count() == 1

    def test_other_peoples_passkeys_are_not_visible(self, client, device):
        self._signed_in(client, device)
        stranger = User.objects.create_user(
            username="other@example.com", email="other@example.com", password="other-pass-9x"
        )
        Passkey.objects.create(
            user=stranger, credential_id="someone-elses", public_key=b"x", sign_count=0
        )

        listed = client.get(LIST_URL).json()["passkeys"]

        assert len(listed) == 1

    def test_other_peoples_passkeys_cannot_be_removed(self, client, device):
        self._signed_in(client, device)
        stranger = User.objects.create_user(
            username="other@example.com", email="other@example.com", password="other-pass-9x"
        )
        theirs = Passkey.objects.create(
            user=stranger, credential_id="someone-elses", public_key=b"x", sign_count=0
        )

        response = client.delete(f"{LIST_URL}{theirs.pk}/")

        assert response.status_code == 404
        assert Passkey.objects.filter(pk=theirs.pk).exists()

    def test_signed_out_visitors_cannot_list(self, client):
        assert client.get(LIST_URL).status_code in (401, 403)


@pytest.mark.django_db
class TestSupport:
    def test_it_says_available_when_configured(self, client):
        assert client.get(SUPPORT_URL).json()["available"] is True

    def test_it_says_unavailable_without_a_domain(self, client, settings):
        """設定が無い環境では出さない。

        押すと必ず失敗するボタンは、無いより悪い。
        """
        settings.PASSKEY_RP_ID = ""

        assert client.get(SUPPORT_URL).json()["available"] is False

    def test_signing_up_is_refused_when_unavailable(self, client, settings):
        settings.PASSKEY_RP_ID = ""

        response = _json(
            client,
            SIGNUP_OPTIONS_URL,
            {"email": EMAIL, "accept_terms": True, "accept_privacy": True},
        )

        assert response.status_code == 400
        assert response.json()["code"] == "PASSKEY_NOT_CONFIGURED"


@pytest.mark.django_db
class TestGuestProgressIsKept:
    def test_what_was_learned_before_signing_up_is_carried_over(self, client, device):
        """登録前に進めた分が、そのまま残ること。

        このアプリは登録なしで学べる。そこを引き継げないと、
        登録した人ほど損をする。
        """
        from apps.lessons.models import LearningSession

        # ゲストとして1本ぶんの記録を作る
        client.get(ME_URL)
        learner_key = client.cookies["learner_key"].value
        LearningSession.objects.create(learner_key=learner_key, lesson_id="rewrite_text")

        response = _sign_up(client, device)

        assert response.status_code == 201
        assert response.json()["migration"]["linked"] is True
        assert response.json()["migration"]["sessions"] == 1
