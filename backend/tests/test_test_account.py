"""動作確認用のアカウントと、1日の上限の切り替え。

ここは**権限と費用**に触るところなので、守りたい線をはっきりさせておく。

  1. 上限を外せること（外さないと、通しの確認が途中で止まる）
  2. 外れるのが**その人ぶんの1日の上限だけ**であること
     ——接続元ごと・全体の安全弁は外れない
  3. 学習者向けの API からは外せないこと
     ——本人が自分の上限を外せたら、上限が無いのと同じ
  4. 権限は渡したときだけ付くこと
     ——「テスト用だから全部入り」で作らない
  5. 合言葉がリポジトリに無いこと
"""

from __future__ import annotations

import uuid
from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.urls import reverse

from apps.accounts.models import UserProfile
from apps.lessons.models import AiUsageCounter
from apps.lessons.services import quota

User = get_user_model()

EMAIL = "tester@example.com"

GENERATE_URL = "/api/v1/ai/generate/"

REWRITE_INPUT = {
    "original_text": "先日の件ですが、諸事情ございまして、追ってご連絡差し上げます。",
    "audience": "社外のお客様",
    "tone": "ていねいに",
    "length": "3行くらい",
}


def _run(*args: str) -> str:
    out = StringIO()
    call_command("create_test_account", *args, stdout=out)
    return out.getvalue()


def _post(api_client):
    return api_client.post(
        GENERATE_URL,
        {
            "lesson_id": "rewrite_text",
            "step_id": "generate_first",
            "action": "rewrite",
            "input": REWRITE_INPUT,
            "request_id": str(uuid.uuid4()),
        },
        format="json",
    )


@pytest.fixture
def mock_ai(settings):
    settings.AI_PROVIDER = "mock"
    return settings


# --------------------------------------------------------- アカウントを作る


@pytest.mark.django_db
class TestCreating:
    def test_it_makes_a_usable_learner(self):
        """管理画面だけの人にしない。

        `createsuperuser` で作ると `UserProfile` が無く、表示名も規約同意も
        空のまま学習が始まる。**本番の利用者と違う状態**を確かめることになる。
        """
        _run("--email", EMAIL)

        user = User.objects.get(username=EMAIL)
        assert user.email == EMAIL
        profile = UserProfile.objects.get(user=user)
        assert profile.display_name
        assert profile.terms_agreed_at is not None
        assert profile.is_email_verified

    def test_privileges_are_only_granted_when_asked_for(self):
        """「テスト用だから全部入り」で作らない。

        本番に残っていたときに、何ができるアカウントなのか
        誰にも分からなくなる。
        """
        _run("--email", EMAIL)

        user = User.objects.get(username=EMAIL)
        assert user.is_staff is False
        assert user.is_superuser is False
        assert UserProfile.objects.get(user=user).unlimited_ai_runs is False

    def test_it_can_open_the_admin_pages(self):
        _run("--email", EMAIL, "--superuser")

        user = User.objects.get(username=EMAIL)
        # is_superuser だけでは管理画面に入れない。is_staff が入り口
        assert user.is_staff is True
        assert user.is_superuser is True

    def test_running_it_twice_does_not_add_a_second_person(self):
        """作り直しで人が増えると、どちらが本物か分からなくなる。"""
        _run("--email", EMAIL, "--staff")
        out = _run("--email", EMAIL, "--unlimited")

        assert User.objects.filter(username=EMAIL).count() == 1
        user = User.objects.get(username=EMAIL)
        # 2回目に渡さなかった権限を、黙って下げない
        assert user.is_staff is True
        assert UserProfile.objects.get(user=user).unlimited_ai_runs is True
        """報せは、渡した引数ではなく**いまの状態**を読むこと。

        引数を読むと、2回目に `--staff` を付けなかったこの場面で
        「管理画面に入れない」と出る——付いたままなのに。
        """
        assert "管理画面" in out
        assert "管理画面に入れない" not in out

    def test_the_passphrase_is_shown_once_and_kept_nowhere(self):
        out = _run("--email", EMAIL)

        assert "合言葉" in out
        user = User.objects.get(username=EMAIL)
        # 出した合言葉で実際に入れること（表示だけして設定し忘れない）
        shown = out.split("合言葉（この1回しか出ません）:")[1].strip().splitlines()[0]
        assert user.check_password(shown.strip())

    def test_it_takes_the_passphrase_from_the_environment(self, monkeypatch):
        monkeypatch.setenv("TEST_ACCOUNT_PASSWORD", "a-long-enough-passphrase")

        out = _run("--email", EMAIL)

        assert User.objects.get(username=EMAIL).check_password(
            "a-long-enough-passphrase"
        )
        # 環境変数から取ったものは表示しない
        assert "a-long-enough-passphrase" not in out

    def test_an_empty_environment_value_counts_as_not_given(self, monkeypatch):
        """空の合言葉をそのまま入れると、誰でも入れるアカウントになる。"""
        monkeypatch.setenv("TEST_ACCOUNT_PASSWORD", "   ")

        _run("--email", EMAIL)

        user = User.objects.get(username=EMAIL)
        assert user.has_usable_password()
        assert not user.check_password("")

    def test_a_malformed_address_is_refused(self):
        with pytest.raises(CommandError):
            _run("--email", "not-an-email")

    def test_lifting_and_restoring_cannot_both_be_asked(self):
        with pytest.raises(CommandError):
            _run("--email", EMAIL, "--unlimited", "--limited")

    def test_the_limit_can_be_put_back(self):
        _run("--email", EMAIL, "--unlimited")
        _run("--email", EMAIL, "--limited")

        assert UserProfile.objects.get(user__username=EMAIL).unlimited_ai_runs is False


# ------------------------------------------------------------- 1日の上限


@pytest.mark.django_db
class TestDailyLimit:
    def _signed_in(self, api_client, *, unlimited: bool):
        user = User.objects.create_user(username=EMAIL, email=EMAIL)
        UserProfile.objects.create(user=user, unlimited_ai_runs=unlimited)
        api_client.force_authenticate(user=user)
        return user

    def test_a_normal_account_still_stops_at_its_limit(
        self, api_client, mock_ai, settings
    ):
        settings.AI_DAILY_REQUEST_LIMIT_USER = 2
        self._signed_in(api_client, unlimited=False)

        assert _post(api_client).status_code == 200
        assert _post(api_client).status_code == 200
        # 3回目で、その人ぶんの上限に当たる
        assert _post(api_client).status_code == 429

    def test_a_lifted_account_does_not_stop(self, api_client, mock_ai, settings):
        """通しの確認が途中で止まらないこと。ここがこの機能の目的。"""
        settings.AI_DAILY_REQUEST_LIMIT_USER = 2
        self._signed_in(api_client, unlimited=True)

        for _ in range(5):
            assert _post(api_client).status_code == 200

    def test_lifting_does_not_disable_the_per_ip_valve(
        self, api_client, mock_ai, settings
    ):
        """**ここが外れると、確認用のアカウント1つで請求が青天井になる。**

        1日の上限を外すのは体験の都合で、費用の歯止めまで外す話ではない。
        """
        settings.AI_DAILY_REQUEST_LIMIT_USER = 2
        settings.AI_RUNS_PER_IP_PER_DAY = 3
        self._signed_in(api_client, unlimited=True)

        for _ in range(3):
            assert _post(api_client).status_code == 200
        assert _post(api_client).status_code == 429

    def test_lifting_does_not_disable_the_global_valve(
        self, api_client, mock_ai, settings
    ):
        """全体の安全弁は 503。個人の上限（429）とは別のものとして返る。"""
        settings.AI_DAILY_REQUEST_LIMIT_USER = 2
        settings.AI_RUNS_PER_DAY = 3
        self._signed_in(api_client, unlimited=True)

        for _ in range(3):
            assert _post(api_client).status_code == 200
        assert _post(api_client).status_code == 503

    def test_a_lifted_account_is_not_counted(self, api_client, mock_ai, settings):
        """上限が無いのに数えると、戻したときに使い切った状態から始まる。"""
        settings.AI_DAILY_REQUEST_LIMIT_USER = 50
        self._signed_in(api_client, unlimited=True)

        _post(api_client)

        assert not AiUsageCounter.objects.filter(
            scope__startswith=quota.LEARNER_PREFIX
        ).exists()

    def test_a_missing_profile_counts_as_not_lifted(
        self, api_client, mock_ai, settings
    ):
        """無いことを「上限なし」と読むと、作り忘れがそのまま穴になる。"""
        settings.AI_DAILY_REQUEST_LIMIT_USER = 1
        user = User.objects.create_user(username=EMAIL, email=EMAIL)
        assert not UserProfile.objects.filter(user=user).exists()
        api_client.force_authenticate(user=user)

        assert _post(api_client).status_code == 200
        assert _post(api_client).status_code == 429

    def test_the_remaining_count_comes_back_as_none(
        self, api_client, mock_ai, settings
    ):
        """「残り0回」と紛らわしいので、数を出さない。"""
        settings.AI_DAILY_REQUEST_LIMIT_USER = 50
        self._signed_in(api_client, unlimited=True)

        body = _post(api_client).json()

        left = body.get("usage", {}).get("text", {})
        assert left.get("limit") is None
        assert left.get("remaining") is None


# --------------------------------------------------------- 本人からは外せない


@pytest.mark.django_db
class TestNotSelfServe:
    def test_the_learner_api_cannot_lift_its_own_limit(self, api_client):
        """本人が自分の上限を外せたら、上限が無いのと同じ。

        `ProfileView.patch` は直せる項目を名指しで並べてある。
        項目が増えても、名指しに足さないかぎり本人からは触れない。
        """
        user = User.objects.create_user(username=EMAIL, email=EMAIL)
        UserProfile.objects.create(user=user, unlimited_ai_runs=False)
        api_client.force_authenticate(user=user)

        response = api_client.patch(
            reverse("accounts-profile"),
            {"display_name": "わたし", "unlimited_ai_runs": True},
            format="json",
        )

        assert response.status_code == 200
        profile = UserProfile.objects.get(user=user)
        assert profile.display_name == "わたし"
        assert profile.unlimited_ai_runs is False
