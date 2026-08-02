"""POST /api/tutor/feedback/ のテスト。

AI プロバイダはモックする。
"""

import uuid

import pytest
from django.urls import reverse

from apps.lessons.models import Attempt, LearningEvent, LearningSession
from apps.tutor.services.base import AiProviderError

URL_NAME = "tutor-feedback"

VALID_REQUEST = {
    "lesson_id": "rewrite_text_001",
    "step": "review_input",
    "user_input": "このメールをいい感じにしてください",
    "attempt_count": 1,
}

OK_PAYLOAD = {
    "message": "誰に送るメールなのかを追加してみましょう。",
    "emotion": "hint",
    "action": "retry",
    "hint_level": 1,
    "completed": False,
}


@pytest.fixture
def stub_ai(monkeypatch):
    """指定した戻り値／例外を返すプロバイダへ差し替える。"""

    def _apply(result=None, error: Exception | None = None):
        class _Provider:
            def generate_json(self, **kwargs):
                if error is not None:
                    raise error
                return dict(result) if result is not None else {}

        monkeypatch.setattr("apps.tutor.views.get_provider", lambda: _Provider())

    return _apply


@pytest.fixture
def session(db):
    """learner_key 付きの進行中セッション。"""
    learner_key = uuid.uuid4()
    return LearningSession.objects.create(
        learner_key=learner_key,
        lesson_id="rewrite_text_001",
        current_step="FIRST_INPUT",
    )


def _post(api_client, payload=None, learner_key=None):
    if learner_key is not None:
        api_client.cookies["learner_key"] = str(learner_key)
    return api_client.post(reverse(URL_NAME), payload or VALID_REQUEST, format="json")


@pytest.mark.django_db
def test_returns_tutor_feedback(api_client, stub_ai):
    stub_ai(result=OK_PAYLOAD)

    response = _post(api_client)

    assert response.status_code == 200
    assert set(response.json()) == {"message", "emotion", "action", "hint_level", "completed"}


@pytest.mark.django_db
def test_ai_failure_still_returns_200_with_fallback(api_client, stub_ai):
    """AI障害時もエラーを見せず、レッスンを進められる。"""
    stub_ai(error=AiProviderError("provider down"))

    response = _post(api_client)

    assert response.status_code == 200
    assert response.json()["message"]
    assert response.json()["action"] == "retry"


@pytest.mark.django_db
@pytest.mark.parametrize(
    "payload,invalid_field",
    [
        ({**VALID_REQUEST, "user_input": ""}, "user_input"),
        ({**VALID_REQUEST, "user_input": "あ" * 5001}, "user_input"),
        ({**VALID_REQUEST, "attempt_count": 0}, "attempt_count"),
        ({**VALID_REQUEST, "step": "unknown_step"}, "step"),
    ],
    ids=["blank_input", "too_long_input", "zero_attempt", "unknown_step"],
)
def test_invalid_request_returns_400(api_client, stub_ai, payload, invalid_field):
    stub_ai(result=OK_PAYLOAD)

    response = _post(api_client, payload)

    assert response.status_code == 400
    assert invalid_field in response.json()["errors"]


@pytest.mark.django_db
def test_learner_key_cookie_is_issued(api_client, stub_ai):
    stub_ai(result=OK_PAYLOAD)

    response = _post(api_client)

    cookie = response.cookies.get("learner_key")
    assert cookie is not None
    assert cookie["httponly"]


@pytest.mark.django_db
def test_attempt_is_recorded_with_cost_metadata(api_client, stub_ai, session):
    """Q-5: 1操作＝1 Attempt。§17: 利用料を記録する。"""
    stub_ai(
        result={
            **OK_PAYLOAD,
            "_meta": {"model_name": "claude-opus-5", "token_usage": {"input": 90, "output": 20}},
        }
    )

    _post(api_client, learner_key=session.learner_key)

    attempt = Attempt.objects.get(session=session)
    assert attempt.sequence == 1
    assert attempt.tutor_origin == "ai"
    assert attempt.tutor_message == OK_PAYLOAD["message"]
    assert attempt.model_name == "claude-opus-5"
    assert attempt.token_usage == {"input": 90, "output": 20}


@pytest.mark.django_db
def test_learning_event_records_length_not_content(api_client, stub_ai, session):
    """Q-2: 操作ログに本文を保存しない。"""
    stub_ai(result=OK_PAYLOAD)

    _post(api_client, learner_key=session.learner_key)

    event = LearningEvent.objects.filter(session=session).first()
    assert event is not None
    assert event.input_length == len(VALID_REQUEST["user_input"])
    # 本文を保持するフィールドが存在しないこと
    assert not hasattr(event, "user_input")


@pytest.mark.django_db
def test_fallback_is_recorded_for_quality_monitoring(api_client, stub_ai, session):
    stub_ai(error=AiProviderError("down"))

    _post(api_client, learner_key=session.learner_key)

    assert Attempt.objects.get(session=session).tutor_origin == "fallback"
    assert LearningEvent.objects.filter(
        session=session, event_type="tutor_fallback_used"
    ).exists()


@pytest.mark.django_db
def test_attempt_limit_returns_429(api_client, stub_ai, session, settings):
    """AI利用料の上振れを防ぐ上限。"""
    settings.MAX_ATTEMPTS_PER_SESSION = 2
    stub_ai(result=OK_PAYLOAD)

    for _ in range(2):
        assert _post(api_client, learner_key=session.learner_key).status_code == 200

    response = _post(api_client, learner_key=session.learner_key)

    assert response.status_code == 429
    assert Attempt.objects.filter(session=session).count() == 2
