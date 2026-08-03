"""AI実行回数の上限（AI利用料の暴走を止める）のテスト。

守りたいこと:
- Cookie を消しても実行し放題にならないこと
- 想定外が起きても1日あたりの請求が跳ねないこと
- IPアドレスそのものを保存していないこと（憲章 原則 VI）
- 上限に達してもレッスンが止まらないこと（憲章 原則 III）
"""

import uuid

import pytest
from django.urls import reverse

from apps.lessons.models import AiUsageCounter
from apps.lessons.services import quota

LESSON_ID = "rewrite_text_001"

VALID_REQUEST = {
    "original_text": "先日の件ですが、諸事情ございまして、現在調整中でございます。",
    "audience": "社外のお客様",
    "tone": "ていねいに",
    "length": "3行くらい",
}


@pytest.fixture
def stub_ai(monkeypatch):
    class _Provider:
        def generate_json(self, **kwargs):
            return {"rewritten_text": "書き直した文章です。"}

    monkeypatch.setattr("apps.lessons.views.get_provider", lambda: _Provider())


def _generate(api_client, **extra):
    return api_client.post(
        reverse("rewrite-text-generate"), VALID_REQUEST, format="json", **extra
    )


def _ip_counter() -> AiUsageCounter:
    """接続元単位のカウンタだけを取り出す。

    カウンタは「全体」「接続元」「学習者」の3種類あるので、
    全体を除くだけでは絞れない。
    """
    return AiUsageCounter.objects.exclude(
        scope=AiUsageCounter.GLOBAL_SCOPE
    ).exclude(scope__startswith=quota.LEARNER_PREFIX).get()


@pytest.mark.django_db
class TestIpLimit:
    def test_clearing_the_cookie_does_not_grant_unlimited_runs(
        self, api_client, stub_ai, settings
    ):
        """これが入っていないと、公開した瞬間に利用料が青天井になる。"""
        settings.AI_RUNS_PER_IP_PER_DAY = 3
        settings.MAX_ATTEMPTS_PER_SESSION = 100  # セッション上限では止めない

        statuses = []
        for _ in range(5):
            # 毎回 Cookie を捨てて、まっさらな学習者のふりをする
            api_client.cookies.clear()
            statuses.append(_generate(api_client).status_code)

        assert statuses[:3] == [200, 200, 200]
        assert statuses[3:] == [429, 429], "Cookie を消すと上限を回避できてしまう"

    def test_rejected_requests_are_not_counted(self, api_client, stub_ai, settings):
        settings.AI_RUNS_PER_IP_PER_DAY = 1
        settings.MAX_ATTEMPTS_PER_SESSION = 100

        _generate(api_client)
        for _ in range(3):
            api_client.cookies.clear()
            _generate(api_client)

        assert _ip_counter().count == 1, "弾いた分まで数えている"

    def test_message_has_no_jargon(self, api_client, stub_ai, settings):
        settings.AI_RUNS_PER_IP_PER_DAY = 1
        _generate(api_client)
        api_client.cookies.clear()
        response = _generate(api_client)

        detail = response.json()["errors"]["detail"][0]
        for word in ["API", "レート", "リミット", "クォータ", "トークン"]:
            assert word not in detail


@pytest.mark.django_db
class TestGlobalLimit:
    def test_global_cap_stops_everyone(self, api_client, stub_ai, settings):
        """最後の安全弁。想定外が起きても請求が跳ねないようにする。"""
        settings.AI_RUNS_PER_DAY = 2
        settings.AI_RUNS_PER_IP_PER_DAY = 100
        settings.MAX_ATTEMPTS_PER_SESSION = 100

        statuses = []
        for _ in range(4):
            api_client.cookies.clear()
            statuses.append(_generate(api_client).status_code)

        assert statuses == [200, 200, 503, 503]

    def test_ip_rejection_does_not_burn_the_global_budget(
        self, api_client, stub_ai, settings
    ):
        """1人の使いすぎで全体の安全弁が先に落ちてはいけない。"""
        settings.AI_RUNS_PER_IP_PER_DAY = 1
        settings.AI_RUNS_PER_DAY = 100
        settings.MAX_ATTEMPTS_PER_SESSION = 100

        for _ in range(5):
            api_client.cookies.clear()
            _generate(api_client)

        global_counter = AiUsageCounter.objects.get(scope=AiUsageCounter.GLOBAL_SCOPE)
        assert global_counter.count == 1


@pytest.mark.django_db(transaction=True)
class TestConcurrency:
    def test_simultaneous_requests_do_not_break_or_overshoot(self, settings):
        """同時に来ても、詰まらず、上限も超えないこと。

        「読んでから書く」形にすると行を掴んだまま待つことになり、
        SQLite では即座に database is locked で 500 になる。
        """
        import threading

        settings.AI_RUNS_PER_IP_PER_DAY = 5
        settings.AI_RUNS_PER_DAY = 1000

        scope = quota.fingerprint("198.51.100.99")
        results: list[str] = []
        lock = threading.Lock()

        def _run():
            from django.db import connection

            try:
                quota._consume(scope, 5)
                outcome = "ok"
            except quota.QuotaExceeded:
                outcome = "limited"
            except Exception as exc:  # noqa: BLE001 - 種類を見たいのでそのまま拾う
                outcome = f"error:{type(exc).__name__}"
            finally:
                connection.close()

            with lock:
                results.append(outcome)

        threads = [threading.Thread(target=_run) for _ in range(12)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)

        errors = [r for r in results if r.startswith("error:")]
        assert errors == [], f"同時アクセスで落ちている: {errors}"
        assert results.count("ok") == 5, "上限を超えて通している"

        counter = AiUsageCounter.objects.get(scope=scope)
        assert counter.count == 5


@pytest.mark.django_db
class TestPrivacy:
    def test_ip_address_is_never_stored(self, api_client, stub_ai, settings):
        settings.AI_RUNS_PER_IP_PER_DAY = 10
        _generate(api_client, REMOTE_ADDR="203.0.113.42")

        scopes = list(AiUsageCounter.objects.values_list("scope", flat=True))
        assert "203.0.113.42" not in scopes
        for scope in scopes:
            assert "203.0.113" not in scope

    def test_same_ip_maps_to_the_same_scope(self):
        assert quota.fingerprint("198.51.100.7") == quota.fingerprint("198.51.100.7")
        assert quota.fingerprint("198.51.100.7") != quota.fingerprint("198.51.100.8")

    def test_forwarded_header_is_ignored_unless_behind_a_proxy(self, settings, rf):
        """直接公開している状態で信じると、接続元を詐称して上限を回避できる。"""
        settings.TRUST_FORWARDED_FOR = False
        request = rf.get("/", HTTP_X_FORWARDED_FOR="1.2.3.4", REMOTE_ADDR="10.0.0.1")
        assert quota.client_ip(request) == "10.0.0.1"

        settings.TRUST_FORWARDED_FOR = True
        assert quota.client_ip(request) == "1.2.3.4"


@pytest.mark.django_db
class TestLessonKeepsWorking:
    def test_poe_falls_back_to_fixed_hints_instead_of_failing(
        self, api_client, settings, monkeypatch
    ):
        """上限に達してもレッスンは止まらない（憲章 原則 III）。"""
        settings.AI_RUNS_PER_IP_PER_DAY = 1
        settings.AI_RUNS_PER_DAY = 1000

        def _explode():
            raise AssertionError("上限に達したのに AI を呼んでいる")

        # 1回使い切る
        api_client.post(
            reverse("tutor-feedback"),
            {
                "lesson_id": LESSON_ID,
                "step": "review_input",
                "user_input": "たたき台の文章です。",
                "attempt_count": 1,
            },
            format="json",
        )
        monkeypatch.setattr("apps.tutor.views.get_provider", _explode)

        response = api_client.post(
            reverse("tutor-feedback"),
            {
                "lesson_id": LESSON_ID,
                "step": "review_input",
                "user_input": "たたき台の文章です。",
                "attempt_count": 1,
            },
            format="json",
        )

        assert response.status_code == 200, "ポーが黙るとレッスンまで止まってしまう"
        body = response.json()
        assert body["message"], "固定ヒントすら返っていない"


@pytest.mark.django_db
class TestNoLimit:
    def test_zero_means_unlimited(self, api_client, stub_ai, settings):
        settings.AI_RUNS_PER_IP_PER_DAY = 0
        settings.AI_RUNS_PER_DAY = 0
        settings.AI_DAILY_REQUEST_LIMIT_PER_USER = 0
        settings.MAX_ATTEMPTS_PER_SESSION = 100

        for _ in range(4):
            api_client.cookies.clear()
            assert _generate(api_client).status_code == 200

        assert AiUsageCounter.objects.count() == 0


@pytest.mark.django_db
def test_counters_are_per_day(api_client, stub_ai, settings):
    settings.AI_RUNS_PER_IP_PER_DAY = 5
    _generate(api_client)

    counter = _ip_counter()
    assert counter.date is not None
    assert counter.count == 1


@pytest.mark.django_db
def test_learner_key_cookie_is_still_issued(api_client, stub_ai, settings):
    """上限の仕組みを入れても、既存の識別は壊さない。"""
    settings.AI_RUNS_PER_IP_PER_DAY = 5
    response = _generate(api_client)

    assert response.status_code == 200
    cookie = response.cookies["learner_key"]
    assert cookie["httponly"] is True
    uuid.UUID(cookie.value)
