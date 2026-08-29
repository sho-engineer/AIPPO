"""2段階認証（認証アプリ）。

守りたいこと
------------
- 全員には強いない。入れたい人だけが設定から入れる
- **確かめるまで有効にしない。** アプリに入れ損ねた人を締め出さない
- 予備の合言葉を渡す。無いと、端末を替えた人が締め出される
- 毎回は聞かない。1度通した端末は30日おぼえる
- 追加の確認が済むまで、ログインさせない
- 6桁は当てられる短さなので、回数を数える
"""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.accounts import totp
from apps.accounts.mfa import TRUST_COOKIE
from apps.accounts.models import RecoveryCode, TotpDevice

pytestmark = pytest.mark.django_db

User = get_user_model()

PASSWORD = "aippo-strong-pass-9"


@pytest.fixture
def learner(db):
    return User.objects.create_user(
        username="a@example.com", email="a@example.com", password=PASSWORD
    )


def _enable(api_client, user) -> list[str]:
    """設定を最後まで通して、予備の合言葉を受け取る。"""
    api_client.force_authenticate(user=user)
    api_client.post(reverse("accounts-mfa-setup"))

    device = TotpDevice.objects.get(user=user)
    code = totp.code_for(device.secret, totp.counter_at())
    response = api_client.post(reverse("accounts-mfa-confirm"), {"code": code}, format="json")

    assert response.status_code == 200
    return response.json()["recovery_codes"]


class TestItIsOptional:
    def test_a_new_account_has_none(self, api_client, learner):
        api_client.force_authenticate(user=learner)

        body = api_client.get(reverse("accounts-mfa")).json()

        assert body["enabled"] is False
        assert body["pending"] is False

    def test_signing_in_without_it_still_works(self, api_client, learner):
        response = api_client.post(
            reverse("accounts-signin"),
            {"email": "a@example.com", "password": PASSWORD},
            format="json",
        )

        assert response.status_code == 200
        assert "mfa_required" not in response.json()


class TestSettingItUp:
    def test_the_secret_can_be_read_by_an_authenticator(self, api_client, learner):
        api_client.force_authenticate(user=learner)

        body = api_client.post(reverse("accounts-mfa-setup")).json()

        assert body["uri"].startswith("otpauth://totp/")
        # 手で入れる人のために、4文字ずつ空けて渡す
        assert " " in body["secret"]

    def test_it_is_not_active_until_a_code_goes_through(self, api_client, learner):
        """アプリに入れ損ねた人を、次のログインで締め出さない。"""
        api_client.force_authenticate(user=learner)
        api_client.post(reverse("accounts-mfa-setup"))

        assert TotpDevice.objects.get(user=learner).is_active is False
        assert api_client.get(reverse("accounts-mfa")).json() == {
            "enabled": False,
            "pending": True,
            "recovery_codes_left": 0,
        }

    def test_a_wrong_code_does_not_enable_it(self, api_client, learner):
        api_client.force_authenticate(user=learner)
        api_client.post(reverse("accounts-mfa-setup"))

        response = api_client.post(
            reverse("accounts-mfa-confirm"), {"code": "000000"}, format="json"
        )

        assert response.status_code == 400
        assert TotpDevice.objects.get(user=learner).is_active is False

    def test_it_hands_over_recovery_codes(self, api_client, learner):
        """無いと、端末を替えた人が自分のアカウントから締め出される。"""
        codes = _enable(api_client, learner)

        assert len(codes) == 10
        assert len(set(codes)) == 10
        assert RecoveryCode.objects.filter(user=learner).count() == 10

    def test_recovery_codes_are_not_stored_in_the_clear(self, api_client, learner):
        codes = _enable(api_client, learner)

        stored = list(RecoveryCode.objects.values_list("code_hash", flat=True))
        for code in codes:
            assert code not in stored

    def test_starting_again_replaces_the_half_done_secret(self, api_client, learner):
        # 途中でやめた分の秘密を使い回さない
        api_client.force_authenticate(user=learner)
        api_client.post(reverse("accounts-mfa-setup"))
        first = TotpDevice.objects.get(user=learner).secret

        api_client.post(reverse("accounts-mfa-setup"))

        assert TotpDevice.objects.get(user=learner).secret != first

    def test_it_cannot_be_set_up_twice(self, api_client, learner):
        _enable(api_client, learner)

        response = api_client.post(reverse("accounts-mfa-setup"))

        assert response.status_code == 409


class TestSigningIn:
    def _signin(self, api_client):
        return api_client.post(
            reverse("accounts-signin"),
            {"email": "a@example.com", "password": PASSWORD},
            format="json",
        )

    def test_the_password_alone_does_not_let_you_in(self, api_client, learner):
        """**先にログインさせてから聞かない。**

        聞いている最中に他の画面が使えると、追加の確認の意味が無くなる。
        """
        _enable(api_client, learner)
        api_client.force_authenticate(user=None)
        api_client.cookies.pop(TRUST_COOKIE, None)

        response = self._signin(api_client)

        assert response.status_code == 200
        assert response.json()["mfa_required"] is True
        assert api_client.get(reverse("accounts-me")).json()["authenticated"] is False

    def test_the_code_completes_the_sign_in(self, api_client, learner):
        _enable(api_client, learner)
        api_client.force_authenticate(user=None)
        api_client.cookies.pop(TRUST_COOKIE, None)
        self._signin(api_client)

        device = TotpDevice.objects.get(user=learner)
        # 設定のときに通した30秒は使えない（同じコードを二度使わせない）
        code = totp.code_for(device.secret, totp.counter_at() + 1)
        response = api_client.post(
            reverse("accounts-mfa-verify"), {"code": code}, format="json"
        )

        assert response.status_code == 200, response.json()
        assert api_client.get(reverse("accounts-me")).json()["authenticated"] is True

    def test_a_wrong_code_does_not_let_you_in(self, api_client, learner):
        _enable(api_client, learner)
        api_client.force_authenticate(user=None)
        api_client.cookies.pop(TRUST_COOKIE, None)
        self._signin(api_client)

        response = api_client.post(
            reverse("accounts-mfa-verify"), {"code": "000000"}, format="json"
        )

        assert response.status_code == 400
        assert api_client.get(reverse("accounts-me")).json()["authenticated"] is False

    def test_the_code_cannot_be_asked_for_without_the_password(self, api_client, learner):
        """合言葉が合っていた人だけが、この口へ来られる。"""
        _enable(api_client, learner)
        api_client.force_authenticate(user=None)
        api_client.cookies.pop(TRUST_COOKIE, None)

        device = TotpDevice.objects.get(user=learner)
        code = totp.code_for(device.secret, totp.counter_at() + 1)
        response = api_client.post(
            reverse("accounts-mfa-verify"), {"code": code}, format="json"
        )

        assert response.status_code == 400
        assert api_client.get(reverse("accounts-me")).json()["authenticated"] is False

    def test_a_recovery_code_also_works(self, api_client, learner):
        """認証アプリを無くした人の逃げ道。"""
        codes = _enable(api_client, learner)
        api_client.force_authenticate(user=None)
        api_client.cookies.pop(TRUST_COOKIE, None)
        self._signin(api_client)

        response = api_client.post(
            reverse("accounts-mfa-verify"), {"code": codes[0]}, format="json"
        )

        assert response.status_code == 200
        assert response.json()["recovery_used"] is True
        assert response.json()["recovery_codes_left"] == 9

    def test_a_recovery_code_only_works_once(self, api_client, learner):
        codes = _enable(api_client, learner)
        api_client.force_authenticate(user=None)
        api_client.cookies.pop(TRUST_COOKIE, None)

        self._signin(api_client)
        api_client.post(reverse("accounts-mfa-verify"), {"code": codes[0]}, format="json")

        api_client.post(reverse("accounts-signout"))
        api_client.cookies.pop(TRUST_COOKIE, None)
        self._signin(api_client)
        again = api_client.post(
            reverse("accounts-mfa-verify"), {"code": codes[0]}, format="json"
        )

        assert again.status_code == 400


class TestRememberingTheDevice:
    def test_a_trusted_device_is_not_asked_again(self, api_client, learner):
        """毎回聞くと、入れた人ほど毎日面倒になり、切る方向に働く。"""
        _enable(api_client, learner)  # 設定した端末は、そのままおぼえる
        """
        `force_authenticate(None)` は DRF の中で `logout()` を呼び、
        **Cookie入れごと空にする**（検査の道具の都合）。
        端末をおぼえているかを見たいので、覚えた値を持ち越す。
        """
        remembered = api_client.cookies[TRUST_COOKIE].value
        api_client.force_authenticate(user=None)
        api_client.cookies[TRUST_COOKIE] = remembered

        response = api_client.post(
            reverse("accounts-signin"),
            {"email": "a@example.com", "password": PASSWORD},
            format="json",
        )

        assert "mfa_required" not in response.json()
        assert api_client.get(reverse("accounts-me")).json()["authenticated"] is True

    def test_a_forged_cookie_does_not_work(self, api_client, learner):
        # 書き換えれば無効になる（SECRET_KEY で署名している）
        _enable(api_client, learner)
        api_client.force_authenticate(user=None)
        api_client.cookies[TRUST_COOKIE] = "not-a-real-signature"

        response = api_client.post(
            reverse("accounts-signin"),
            {"email": "a@example.com", "password": PASSWORD},
            format="json",
        )

        assert response.json()["mfa_required"] is True


class TestTurningItOff:
    def test_it_needs_a_code(self, api_client, learner):
        """求めないと、画面を開けたままの端末を借りた人が黙って外せる。"""
        _enable(api_client, learner)

        response = api_client.post(
            reverse("accounts-mfa-disable"), {"code": "000000"}, format="json"
        )

        assert response.status_code == 400
        assert TotpDevice.objects.filter(user=learner).exists()

    def test_a_correct_code_turns_it_off(self, api_client, learner):
        _enable(api_client, learner)
        device = TotpDevice.objects.get(user=learner)
        # 同じコードは二度使えないので、次の30秒のものを使う
        code = totp.code_for(device.secret, totp.counter_at() + 1)

        response = api_client.post(
            reverse("accounts-mfa-disable"), {"code": code}, format="json"
        )

        assert response.status_code == 200
        assert not TotpDevice.objects.filter(user=learner).exists()
        assert not RecoveryCode.objects.filter(user=learner).exists()

    def test_a_recovery_code_turns_it_off_too(self, api_client, learner):
        codes = _enable(api_client, learner)

        response = api_client.post(
            reverse("accounts-mfa-disable"), {"code": codes[0]}, format="json"
        )

        assert response.status_code == 200
        assert not TotpDevice.objects.filter(user=learner).exists()


class TestCounting:
    def test_guessing_is_stopped(self, api_client, learner, settings):
        """6桁は当てられる短さ。ここを開けたままにしない。"""
        settings.AUTH_THROTTLE_MFA_MAX_SOURCE = 3
        _enable(api_client, learner)
        api_client.force_authenticate(user=None)
        api_client.cookies.pop(TRUST_COOKIE, None)
        api_client.post(
            reverse("accounts-signin"),
            {"email": "a@example.com", "password": PASSWORD},
            format="json",
        )

        codes = ["000000", "111111", "222222", "333333"]
        statuses = [
            api_client.post(
                reverse("accounts-mfa-verify"), {"code": code}, format="json"
            ).status_code
            for code in codes
        ]

        assert 429 in statuses


class TestDeletingTheAccount:
    def test_it_goes_with_the_account(self, api_client, learner):
        _enable(api_client, learner)

        response = api_client.post("/api/v1/accounts/delete/")

        assert response.status_code in (200, 204)
        # 消えた user では絞り込めない。件数で見る
        assert TotpDevice.objects.count() == 0
        assert RecoveryCode.objects.count() == 0
