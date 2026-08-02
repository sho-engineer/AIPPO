"""ポーのフィードバック生成サービスのテスト。

AI を全面停止させてもレッスンが進むこと（AIPPO 開発概要 §17）を担保する。
"""

import pytest

from apps.tutor.prompts import hint_level_for, message_max_length
from apps.tutor.services.base import AiProvider, AiProviderError, AiTimeoutError
from apps.tutor.services.feedback import generate_feedback

VALID_PAYLOAD = {
    "message": "誰に送る文章かを足してみましょう。",
    "emotion": "hint",
    "action": "retry",
    "hint_level": 0,
    "completed": False,
}


class FakeProvider(AiProvider):
    def __init__(self, result=None, error: Exception | None = None) -> None:
        self.result = result
        self.error = error
        self.calls: list[dict] = []

    def generate_json(self, **kwargs) -> dict:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return dict(self.result) if self.result is not None else {}


def test_valid_ai_response_is_used():
    provider = FakeProvider(result=dict(VALID_PAYLOAD))

    result = generate_feedback(
        step="review_input", user_input="直して", attempt_count=1, provider=provider
    )

    assert result.origin == "ai"
    assert result.payload["message"] == "誰に送る文章かを足してみましょう。"


@pytest.mark.parametrize("attempt_count,expected", [(1, 1), (2, 2), (3, 3), (7, 3)])
def test_hint_level_is_decided_by_server_not_ai(attempt_count, expected):
    """AI が申告した hint_level は採用しない。"""
    provider = FakeProvider(result={**VALID_PAYLOAD, "hint_level": 0})

    result = generate_feedback(
        step="review_input", user_input="直して", attempt_count=attempt_count, provider=provider
    )

    assert result.payload["hint_level"] == expected


def test_first_attempt_never_reaches_example_level():
    """1回目で具体例（段階3）を出さない。"""
    assert hint_level_for(1) == 1


@pytest.mark.parametrize(
    "error",
    [AiProviderError("boom"), AiTimeoutError("slow")],
    ids=["provider_error", "timeout"],
)
def test_ai_failure_falls_back(error):
    provider = FakeProvider(error=error)

    result = generate_feedback(
        step="review_input", user_input="直して", attempt_count=1, provider=provider
    )

    assert result.origin == "fallback"
    assert result.payload["message"]


@pytest.mark.parametrize(
    "bad_payload",
    [
        {**VALID_PAYLOAD, "emotion": "angry"},
        {**VALID_PAYLOAD, "action": "explode"},
        {**VALID_PAYLOAD, "hint_level": 9},
        {"message": "短い"},
    ],
    ids=["bad_emotion", "bad_action", "bad_hint_level", "missing_fields"],
)
def test_schema_violation_falls_back(bad_payload):
    provider = FakeProvider(result=bad_payload)

    result = generate_feedback(
        step="review_input", user_input="直して", attempt_count=1, provider=provider
    )

    assert result.origin == "fallback"


class TestMessageLengthLimit:
    """Q-4: 段階3のみ150文字まで許容する。"""

    @pytest.mark.parametrize(
        "hint_level,expected", [(0, 100), (1, 100), (2, 100), (3, 150)]
    )
    def test_limit_per_hint_level(self, hint_level, expected):
        assert message_max_length(hint_level) == expected

    def test_120_chars_rejected_at_level_1(self):
        provider = FakeProvider(result={**VALID_PAYLOAD, "message": "あ" * 120})

        result = generate_feedback(
            step="review_input", user_input="直して", attempt_count=1, provider=provider
        )

        assert result.origin == "fallback"

    def test_120_chars_accepted_at_level_3(self):
        provider = FakeProvider(result={**VALID_PAYLOAD, "message": "あ" * 120})

        result = generate_feedback(
            step="review_input", user_input="直して", attempt_count=3, provider=provider
        )

        assert result.origin == "ai"
        assert len(result.payload["message"]) == 120

    def test_160_chars_rejected_even_at_level_3(self):
        provider = FakeProvider(result={**VALID_PAYLOAD, "message": "あ" * 160})

        result = generate_feedback(
            step="review_input", user_input="直して", attempt_count=3, provider=provider
        )

        assert result.origin == "fallback"


def test_token_usage_is_captured_for_cost_tracking():
    """AI利用料の記録（§17）。"""
    provider = FakeProvider(
        result={
            **VALID_PAYLOAD,
            "_meta": {
                "model_name": "claude-opus-5",
                "token_usage": {"input": 120, "output": 30},
            },
        }
    )

    result = generate_feedback(
        step="review_input", user_input="直して", attempt_count=1, provider=provider
    )

    assert result.model_name == "claude-opus-5"
    assert result.token_usage == {"input": 120, "output": 30}


def test_meta_is_not_leaked_into_response():
    provider = FakeProvider(
        result={**VALID_PAYLOAD, "_meta": {"model_name": "x", "token_usage": {}}}
    )

    result = generate_feedback(
        step="review_input", user_input="直して", attempt_count=1, provider=provider
    )

    assert "_meta" not in result.payload


def test_only_minimal_fields_are_sent_to_provider():
    """外部プロバイダへ送るのは最小限のフィールドのみ。"""
    provider = FakeProvider(result=dict(VALID_PAYLOAD))

    generate_feedback(
        step="review_input", user_input="社内向けの案内文", attempt_count=1, provider=provider
    )

    call = provider.calls[0]
    assert set(call) == {
        "system_prompt",
        "user_content",
        "schema",
        "timeout_seconds",
        "max_retries",
    }
    assert call["user_content"] == "社内向けの案内文"


def test_safety_rules_are_in_the_prompt():
    """安全ルール（§15 / N-6）がシステムプロンプトに含まれる。"""
    provider = FakeProvider(result=dict(VALID_PAYLOAD))

    generate_feedback(
        step="review_input", user_input="直して", attempt_count=1, provider=provider
    )

    prompt = provider.calls[0]["system_prompt"]
    assert "個人情報や機密情報" in prompt
    assert "事実として断定しない" in prompt
    assert "専門家への確認" in prompt
    assert "ポー" in prompt
    assert "AIPPO" in prompt
