"""POST /api/v1/ai/generate/ — 教材から AI を呼ぶ唯一の入口。

守りたいこと:
- 教材の外から任意のプロンプトを流し込めないこと
- mock のままで全アクションが通ること（憲章 原則 III）
- 本文を既定で保存しないこと
- 失敗しても学習者を行き止まりにしないこと
- 利用実績（provider / model / token / latency）が残ること
"""

import pytest

from apps.ai.providers.base import AIProviderError, AIRequest, AIResult, AITimeoutError
from apps.ai.providers.mock import MockProvider
from apps.lessons.models import Attempt, AttemptStatus, LearningEvent

URL = "/api/v1/ai/generate/"

REWRITE_INPUT = {
    "original_text": "先日の件ですが、諸事情ございまして、追ってご連絡差し上げます。",
    "audience": "社外のお客様",
    "tone": "ていねいに",
    "length": "3行くらい",
}


def _post(api_client, **overrides):
    body = {
        "lesson_id": "rewrite_text",
        "step_id": "generate_result",
        "action": "rewrite",
        "input": REWRITE_INPUT,
    }
    body.update(overrides)
    return api_client.post(URL, body, format="json")


@pytest.fixture(autouse=True)
def _use_mock(settings):
    """テストは必ず mock を使う。

    本物のAPIを叩くテストは、鍵の有無で落ちたり費用がかかったりして、
    いずれ誰も回さなくなる。
    """
    settings.AI_PROVIDER = "mock"
    settings.AI_STORE_RAW_INPUT = False


@pytest.mark.django_db
class TestGenerating:
    def test_returns_result_tutor_and_usage(self, api_client):
        response = _post(api_client)

        assert response.status_code == 200
        payload = response.json()
        assert payload["result"].strip()
        assert payload["tutor"]["message"]
        assert payload["tutor"]["emotion"]
        assert payload["usage"]["provider"] == "mock"
        assert payload["usage"]["model"]
        assert payload["usage"]["latency_ms"] >= 0

    def test_conditions_change_the_result(self, api_client):
        """条件を変えると結果が変わること。

        変わらないなら、教材として成り立たない。
        mock でも確かめられるようにしてある。
        """
        first = _post(api_client).json()["result"]
        second = _post(
            api_client,
            input={**REWRITE_INPUT, "length": "1行"},
        ).json()["result"]

        assert first != second

    @pytest.mark.parametrize(
        ("lesson_id", "action", "payload"),
        [
            ("rewrite_text", "rewrite", REWRITE_INPUT),
            (
                "summarize_text",
                "summarize",
                {
                    "original_text": "長い資料の本文です。" * 5,
                    "purpose": "会議で共有する",
                    "format": "重要な点を3つ",
                    "length": "3行で",
                },
            ),
            (
                "explain_topic",
                "explain",
                {
                    "topic": "クラウド",
                    "audience": "はじめて聞く人",
                    "style": "例えを使う",
                    "example": "具体例を入れる",
                    "length": "短め",
                },
            ),
            (
                "compare_options",
                "compare",
                {
                    "options_text": "A社のプラン / B社のプラン",
                    "criteria": "値段と使いやすさ",
                    "priority": "値段",
                    "as_table": "表にする",
                },
            ),
            (
                "make_plan",
                "plan",
                {
                    "goal": "資格の勉強を始める",
                    "deadline": "3か月",
                    "available_time": "1日30分",
                },
            ),
            (
                "improve_answer",
                "improve",
                {
                    "original_text": "AIが書いた回答です。",
                    "improvement": "もっと短く",
                },
            ),
        ],
    )
    def test_every_action_works_on_mock(self, api_client, lesson_id, action, payload):
        response = _post(
            api_client, lesson_id=lesson_id, action=action, input=payload
        )
        assert response.status_code == 200, response.json()
        assert response.json()["result"].strip()

    def test_plan_returns_steps_as_extras(self, api_client):
        """計画は本文だけでなく、手順の一覧も返す。"""
        response = _post(
            api_client,
            lesson_id="make_plan",
            action="plan",
            input={
                "goal": "資格の勉強を始める",
                "deadline": "3か月",
                "available_time": "1日30分",
            },
        )
        assert isinstance(response.json()["extras"]["steps"], list)

    def test_compare_tells_the_learner_to_check_facts(self, api_client):
        """AIのおすすめを確定回答として扱わせない。"""
        response = _post(
            api_client,
            lesson_id="compare_options",
            action="compare",
            input={
                "options_text": "A社 / B社",
                "criteria": "値段",
                "priority": "値段",
                "as_table": "表にする",
            },
        )
        payload = response.json()
        assert payload["extras"]["needs_fact_check"] is True
        assert payload["tutor"]["emotion"] == "warning"


@pytest.mark.django_db
class TestValidation:
    def test_unknown_action_is_rejected(self, api_client):
        assert _post(api_client, action="delete_everything").status_code == 400

    def test_action_cannot_be_used_from_another_lesson(self, api_client):
        """教材の外から任意の指示を流し込めないこと。"""
        response = _post(api_client, lesson_id="make_plan")

        assert response.status_code == 400
        assert "lesson_id" in response.json()["errors"]

    def test_missing_required_field_is_rejected(self, api_client):
        response = _post(
            api_client, input={**REWRITE_INPUT, "audience": ""}
        )
        assert response.status_code == 400
        assert "audience" in response.json()["errors"]

    def test_too_long_body_is_rejected(self, api_client):
        response = _post(
            api_client, input={**REWRITE_INPUT, "original_text": "あ" * 5001}
        )
        assert response.status_code == 400

    def test_error_message_has_no_jargon(self, api_client):
        response = _post(api_client, input={**REWRITE_INPUT, "audience": ""})
        message = response.json()["errors"]["audience"][0]

        for word in ("プロンプト", "トークン", "パラメータ", "API", "バリデーション"):
            assert word not in message


@pytest.mark.django_db
class TestRecording:
    def test_usage_is_recorded(self, api_client):
        _post(api_client)

        attempt = Attempt.objects.get()
        assert attempt.provider == "mock"
        assert attempt.model_name
        assert attempt.token_usage["output"] > 0
        assert attempt.latency_ms is not None
        assert attempt.action == "rewrite"

    def test_raw_input_is_not_stored_by_default(self, api_client):
        _post(api_client)

        attempt = Attempt.objects.get()
        assert attempt.user_input == ""
        assert attempt.input_length == len(REWRITE_INPUT["original_text"])

    def test_raw_input_is_stored_only_when_explicitly_enabled(
        self, api_client, settings
    ):
        settings.AI_STORE_RAW_INPUT = True
        _post(api_client)

        assert Attempt.objects.get().user_input == REWRITE_INPUT["original_text"]

    def test_the_tier_decides_the_model_without_the_lesson_naming_it(
        self, api_client, settings
    ):
        """教材はモデル名を言わない。段階から、サーバー側が決める。"""
        settings.AI_MODEL_TIERS = {
            "basic": {"provider": "mock", "model": "mock-from-tier"}
        }

        _post(api_client, model_tier="basic")

        assert Attempt.objects.get().model_name == "mock-from-tier"

    def test_an_unknown_tier_does_not_stop_the_learner(self, api_client, settings):
        """教材の書き間違いで、学習が止まらないこと。"""
        settings.AI_MODEL_TIERS = {"basic": {"provider": "mock", "model": "mock-1"}}

        response = _post(api_client, model_tier="tier_that_does_not_exist")

        assert response.status_code == 200

    def test_estimated_cost_is_null_when_pricing_not_configured(self, api_client):
        """0円と「単価が分からない」を混同しない（apps/ai/pricing.py）。"""
        _post(api_client)

        assert Attempt.objects.get().estimated_cost_usd is None

    def test_estimated_cost_is_computed_when_pricing_is_configured(
        self, api_client, settings
    ):
        settings.AI_PRICE_PER_1K_TOKENS = {"mock": (0.001, 0.002)}
        _post(api_client)

        attempt = Attempt.objects.get()
        assert attempt.estimated_cost_usd is not None
        assert attempt.estimated_cost_usd > 0

    def test_selected_conditions_are_kept(self, api_client):
        """どの条件を選んだかは残す。本文と違い個人情報にならない。"""
        _post(api_client)

        conditions = Attempt.objects.get().conditions
        assert conditions["audience"] == "社外のお客様"
        assert "original_text" not in conditions

    def test_events_are_written(self, api_client):
        _post(api_client)

        kinds = set(LearningEvent.objects.values_list("event_type", flat=True))
        assert "ai_request_started" in kinds
        assert "ai_request_succeeded" in kinds


class _FailingProvider(MockProvider):
    def __init__(self, exc: Exception) -> None:
        super().__init__()
        self._exc = exc

    def generate_structured(self, request: AIRequest, response_schema: dict) -> AIResult:
        raise self._exc


@pytest.mark.django_db
class TestFailure:
    @pytest.mark.parametrize(
        ("exc", "expected_status", "expected_kind"),
        [
            (AITimeoutError("slow"), AttemptStatus.TIMEOUT, "timeout"),
            (AIProviderError("boom"), AttemptStatus.FAILED, "provider_error"),
        ],
    )
    def test_failure_is_recorded_and_learner_can_retry(
        self, api_client, monkeypatch, exc, expected_status, expected_kind
    ):
        monkeypatch.setattr(
            "apps.ai.views.get_provider", lambda *a, **k: _FailingProvider(exc)
        )
        response = _post(api_client)

        assert response.status_code == 502
        # 黙らせない。次に何をすればよいかを必ず出す
        assert response.json()["tutor"]["action"] == "retry"

        attempt = Attempt.objects.get()
        assert attempt.status == expected_status
        assert attempt.error_kind == expected_kind

    def test_malformed_output_is_treated_as_failure(self, api_client, monkeypatch):
        """構造化出力でも形は崩れる。空の結果を画面へ出さない。"""

        class _Empty(MockProvider):
            def generate_structured(self, request, response_schema):
                return AIResult(text="", data={"result": "   "})

        monkeypatch.setattr("apps.ai.views.get_provider", lambda *a, **k: _Empty())
        response = _post(api_client)

        assert response.status_code == 502
        assert Attempt.objects.get().error_kind == "malformed"


@pytest.mark.django_db
class TestDoubleSubmission:
    def test_same_content_twice_in_a_row_is_not_charged_twice(self, api_client):
        assert _post(api_client).status_code == 200
        assert _post(api_client).status_code == 409

        # AI を呼んでいないので、記録も増えない
        assert Attempt.objects.count() == 1

    def test_changed_content_goes_through(self, api_client):
        assert _post(api_client).status_code == 200
        assert (
            _post(api_client, input={**REWRITE_INPUT, "length": "1行"}).status_code
            == 200
        )

    def test_a_write_failure_in_the_cache_does_not_block_the_first_request(
        self, api_client, monkeypatch
    ):
        """cache.set() が失敗しても、初回の送信は通す。

        Django の DatabaseCache は、書き込みが失敗しても例外を投げずに
        黙って諦める（django/core/cache/backends/db.py）。SQLite の
        書き込みロック競合などで実際に起こりうる。判定を書き込みの
        成否に乗せていると、この失敗が「連打だ」に化けて、
        まだ一度も送っていない内容まで拒んでしまう。
        """

        def _always_fails(*args, **kwargs):
            raise RuntimeError("simulated cache write failure")

        monkeypatch.setattr("apps.ai.views.cache.set", _always_fails)

        assert _post(api_client).status_code == 200

    def test_a_read_failure_in_the_cache_does_not_block_the_request(
        self, api_client, monkeypatch
    ):
        """cache.get() が読めなくても、連打とはみなさない。

        判定できないときに拒む側へ倒すと、通信の瞬断のたびに
        学習者を止めてしまう。分からないときは通す。
        """

        def _always_fails(*args, **kwargs):
            raise RuntimeError("simulated cache read failure")

        monkeypatch.setattr("apps.ai.views.cache.get", _always_fails)

        assert _post(api_client).status_code == 200


@pytest.mark.django_db
class TestLimits:
    def test_daily_limit_per_learner(self, api_client, settings):
        settings.AI_DAILY_REQUEST_LIMIT_GUEST = 2
        settings.AI_RUNS_PER_IP_PER_DAY = 0
        settings.AI_RUNS_PER_DAY = 0

        for index in range(2):
            assert (
                _post(
                    api_client, input={**REWRITE_INPUT, "length": f"{index}行"}
                ).status_code
                == 200
            )

        response = _post(api_client, input={**REWRITE_INPUT, "length": "9行"})
        assert response.status_code == 429
        assert response.json()["tutor"]["message"]

    def test_limit_message_has_no_jargon(self, api_client, settings):
        settings.AI_DAILY_REQUEST_LIMIT_GUEST = 1
        _post(api_client)
        response = _post(api_client, input={**REWRITE_INPUT, "length": "1行"})

        detail = response.json()["errors"]["detail"][0]
        for word in ("上限", "リクエスト", "クォータ", "API"):
            assert word not in detail


@pytest.mark.django_db
class TestSelectableModels:
    """選べるモデルは名簿で決める（apps/ai/models_catalog.py）。

    設定画面から好きな名前を送れてしまうと、高いモデルを指定された分だけ
    請求はこちらに来る。名簿はサーバーだけが持ち、画面は受け取って並べる。
    """

    def test_models_endpoint_lists_choices(self, api_client):
        response = api_client.get("/api/v1/ai/models/")

        assert response.status_code == 200
        models = response.data["models"]
        assert len(models) > 0
        # 画面が並べるのに必要なものが全部あること
        for item in models:
            assert set(item) >= {"id", "label", "note", "provider", "recommended"}
        # いまの既定が、ちょうど1つ「おすすめ」になっていること
        assert sum(1 for item in models if item["recommended"]) == 1

    def test_model_not_on_the_list_is_rejected(self, api_client):
        response = _post(api_client, model="gpt-4-turbo-very-expensive")

        assert response.status_code == 400
        assert "model" in response.data["errors"]

    def test_model_on_the_list_is_accepted(self, api_client, settings):
        settings.AI_PROVIDER = "mock"
        listed = api_client.get("/api/v1/ai/models/").data["models"][0]["id"]

        response = _post(api_client, model=listed)

        assert response.status_code == 200

    def test_empty_model_still_works(self, api_client):
        """指定しないのが通常。教材はモデルを選ばない。"""
        assert _post(api_client, model="").status_code == 200
