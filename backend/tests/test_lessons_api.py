"""レッスン実行・学習イベント・セッション再開・アンケートのテスト。

AI プロバイダはモックする。
"""

import uuid

import pytest
from django.urls import reverse

from apps.lessons.models import (
    Attempt,
    AttemptStatus,
    LearningEvent,
    LearningSession,
    SkillProgress,
    Survey,
)
from apps.lessons.services.generation import (
    AiProviderError,
    AiTimeoutError,
    build_instruction,
)

LESSON_ID = "rewrite_text_001"

VALID_REQUEST = {
    "original_text": "先日の件ですが、諸事情ございまして、現在調整中でございます。",
    "audience": "社外のお客様",
    "tone": "ていねいに",
    "length": "3行くらい",
}


@pytest.fixture
def stub_ai(monkeypatch):
    def _apply(text: str = "書き直した文章です。", error: Exception | None = None):
        class _Provider:
            def generate_json(self, **kwargs):
                if error is not None:
                    raise error
                return {
                    "rewritten_text": text,
                    "_meta": {
                        "model_name": "claude-opus-5",
                        "token_usage": {"input": 200, "output": 40},
                    },
                }

        monkeypatch.setattr("apps.lessons.views.get_provider", lambda: _Provider())

    return _apply


@pytest.fixture
def learner_key():
    return uuid.uuid4()


@pytest.fixture
def lesson_teaching_two_skills():
    """この教材を終えると習得できる技を2つ用意する。

    習得できる技は**その教材が教えたもの**だけになった。前はレッスンに
    関係なく固定の4つが付いていたので、教材を用意しなくても数が合って
    しまっていた。用意しないと 0 件になるのが、いまの正しい姿。
    """
    from apps.catalog.models import Course, Lesson
    from apps.rewards.models import AiSkill, AiSkillLesson

    course = Course.objects.create(slug="foundation", title="はじめの一歩")
    lesson = Lesson.objects.create(
        course=course, slug=LESSON_ID, number=1, title="文章を分かりやすくする", goal="goal"
    )
    for order, slug in enumerate(("tone", "length")):
        skill = AiSkill.objects.create(slug=slug, name=slug, one_line="ひとこと", order=order)
        AiSkillLesson.objects.create(skill=skill, lesson=lesson)
    return lesson


def _client_with_key(api_client, learner_key):
    api_client.cookies["learner_key"] = str(learner_key)
    return api_client


class TestBuildInstruction:
    def test_includes_all_three_conditions(self):
        text = build_instruction(
            original_text="もとの文章",
            audience="上司",
            tone="簡潔に",
            length="2行",
        )
        assert "上司" in text
        assert "簡潔に" in text
        assert "2行" in text
        assert "もとの文章" in text

    def test_improvement_instruction_is_appended(self):
        text = build_instruction(
            original_text="x",
            audience="a",
            tone="b",
            length="c",
            instruction="もっと短くしてください。",
        )
        assert "もっと短くしてください。" in text


@pytest.mark.django_db
class TestRewriteTextGenerate:
    url = reverse("rewrite-text-generate")

    def test_returns_rewritten_text(self, api_client, stub_ai, learner_key):
        stub_ai(text="お待たせしております。現在調整中です。近日中にご連絡します。")
        client = _client_with_key(api_client, learner_key)

        response = client.post(self.url, VALID_REQUEST, format="json")

        assert response.status_code == 200
        assert response.json()["rewritten_text"].startswith("お待たせ")

    def test_records_attempt_with_cost_metadata(self, api_client, stub_ai, learner_key):
        stub_ai()
        client = _client_with_key(api_client, learner_key)

        client.post(self.url, VALID_REQUEST, format="json")

        attempt = Attempt.objects.get()
        assert attempt.sequence == 1
        assert attempt.status == AttemptStatus.SUCCEEDED
        assert attempt.model_name == "claude-opus-5"
        assert attempt.token_usage == {"input": 200, "output": 40}
        assert attempt.conditions["audience"] == "社外のお客様"

    def test_sequence_increments_for_comparison(self, api_client, stub_ai, learner_key):
        stub_ai()
        client = _client_with_key(api_client, learner_key)

        client.post(self.url, VALID_REQUEST, format="json")
        client.post(
            self.url, {**VALID_REQUEST, "instruction": "もっと短く"}, format="json"
        )

        assert [a.sequence for a in Attempt.objects.all()] == [1, 2]

    @pytest.mark.parametrize(
        "error,expected_status",
        [
            (AiProviderError("down"), AttemptStatus.FAILED),
            (AiTimeoutError("slow"), AttemptStatus.TIMEOUT),
        ],
        ids=["provider_error", "timeout"],
    )
    def test_ai_failure_returns_502_and_records_attempt(
        self, api_client, stub_ai, learner_key, error, expected_status
    ):
        """文章生成はAIの出力そのものが目的なので、固定文で代替できない。"""
        stub_ai(error=error)
        client = _client_with_key(api_client, learner_key)

        response = client.post(self.url, VALID_REQUEST, format="json")

        assert response.status_code == 502
        assert response.json()["errors"]["detail"]
        assert Attempt.objects.get().status == expected_status
        assert LearningEvent.objects.filter(event_type="ai_run_failed").exists()

    @pytest.mark.parametrize(
        "payload,field",
        [
            ({**VALID_REQUEST, "original_text": ""}, "original_text"),
            ({**VALID_REQUEST, "original_text": "あ" * 5001}, "original_text"),
            ({**VALID_REQUEST, "audience": ""}, "audience"),
            ({**VALID_REQUEST, "tone": ""}, "tone"),
            ({**VALID_REQUEST, "length": ""}, "length"),
        ],
        ids=["blank_text", "too_long", "no_audience", "no_tone", "no_length"],
    )
    def test_invalid_request_returns_400(
        self, api_client, stub_ai, learner_key, payload, field
    ):
        stub_ai()
        client = _client_with_key(api_client, learner_key)

        response = client.post(self.url, payload, format="json")

        assert response.status_code == 400
        assert field in response.json()["errors"]

    def test_attempt_limit_returns_429(self, api_client, stub_ai, learner_key, settings):
        settings.MAX_ATTEMPTS_PER_SESSION = 2
        stub_ai()
        client = _client_with_key(api_client, learner_key)

        for _ in range(2):
            assert client.post(self.url, VALID_REQUEST, format="json").status_code == 200

        response = client.post(self.url, VALID_REQUEST, format="json")

        assert response.status_code == 429
        assert Attempt.objects.count() == 2


@pytest.mark.django_db
class TestLearningEvents:
    url = reverse("learning-events")

    def test_records_event(self, api_client, learner_key):
        client = _client_with_key(api_client, learner_key)

        response = client.post(
            self.url,
            {
                "lesson_id": LESSON_ID,
                "event_type": "lesson_started",
                "step": "INTRO",
                "input_length": 42,
            },
            format="json",
        )

        assert response.status_code == 204
        event = LearningEvent.objects.get()
        assert event.event_type == "lesson_started"
        assert event.input_length == 42

    def test_rejects_body_text(self, api_client, learner_key):
        """Q-2: 操作ログに本文を送らせない。"""
        client = _client_with_key(api_client, learner_key)

        response = client.post(
            self.url,
            {
                "lesson_id": LESSON_ID,
                "event_type": "input_submitted",
                "user_input": "社外秘の内容",
            },
            format="json",
        )

        assert response.status_code == 400
        assert "user_input" in response.json()["errors"]
        assert LearningEvent.objects.count() == 0

    def test_event_model_has_no_text_field(self):
        field_names = {f.name for f in LearningEvent._meta.get_fields()}
        assert not (field_names & {"user_input", "text", "content"})

    def test_completion_records_the_skills_that_lesson_teaches(
        self, api_client, learner_key, lesson_teaching_two_skills
    ):
        client = _client_with_key(api_client, learner_key)

        client.post(
            self.url,
            {"lesson_id": LESSON_ID, "event_type": "lesson_completed", "completed": True},
            format="json",
        )

        session = LearningSession.objects.get()
        assert session.completed_at is not None
        assert sorted(
            SkillProgress.objects.filter(learner_key=learner_key).values_list(
                "skill_key", flat=True
            )
        ) == ["length", "tone"]

    def test_completion_records_nothing_when_the_lesson_teaches_nothing(
        self, api_client, learner_key
    ):
        """診断のように、技の付かない教材もある。

        前はここでも固定の4つが付いていた。**していないことを
        習得したことにしていた**ので、図鑑が最初の1本で埋まっていた。
        """
        client = _client_with_key(api_client, learner_key)

        client.post(
            self.url,
            {"lesson_id": LESSON_ID, "event_type": "lesson_completed", "completed": True},
            format="json",
        )

        assert SkillProgress.objects.filter(learner_key=learner_key).count() == 0

    def test_unknown_event_type_returns_400(self, api_client, learner_key):
        client = _client_with_key(api_client, learner_key)

        response = client.post(
            self.url, {"lesson_id": LESSON_ID, "event_type": "danced"}, format="json"
        )

        assert response.status_code == 400


@pytest.mark.django_db
class TestSessionState:
    def test_returns_null_for_new_learner(self, api_client, learner_key):
        client = _client_with_key(api_client, learner_key)

        response = client.get(reverse("lesson-session", args=[LESSON_ID]))

        assert response.status_code == 200
        assert response.json()["session"] is None

    def test_returns_reached_step_for_returning_learner(self, api_client, learner_key):
        LearningSession.objects.create(
            learner_key=learner_key, lesson_id=LESSON_ID, current_step="IMPROVE_INPUT"
        )
        client = _client_with_key(api_client, learner_key)

        response = client.get(reverse("lesson-session", args=[LESSON_ID]))

        assert response.json()["session"]["current_step"] == "IMPROVE_INPUT"

    def test_other_learner_cannot_see_the_session(self, api_client, learner_key):
        LearningSession.objects.create(
            learner_key=learner_key, lesson_id=LESSON_ID, current_step="REAL_TASK"
        )
        client = _client_with_key(api_client, uuid.uuid4())

        response = client.get(reverse("lesson-session", args=[LESSON_ID]))

        assert response.json()["session"] is None


@pytest.mark.django_db
class TestSurvey:
    def test_stores_answers(self, api_client, learner_key):
        LearningSession.objects.create(learner_key=learner_key, lesson_id=LESSON_ID)
        client = _client_with_key(api_client, learner_key)

        response = client.post(
            reverse("lesson-survey", args=[LESSON_ID]),
            {"answers": {"got_lost": "no", "would_pay": "yes"}},
            format="json",
        )

        assert response.status_code == 204
        assert Survey.objects.get().answers["would_pay"] == "yes"

    def test_without_session_returns_404(self, api_client, learner_key):
        client = _client_with_key(api_client, learner_key)

        response = client.post(
            reverse("lesson-survey", args=[LESSON_ID]),
            {"answers": {"got_lost": "no"}},
            format="json",
        )

        assert response.status_code == 404


@pytest.mark.django_db
def test_lesson_completes_with_stub_provider(
    api_client, learner_key, settings, lesson_teaching_two_skills
):
    """憲章 原則 III: AI が使えなくてもレッスンを完走できる。

    AI_PROVIDER=stub のまま、実行 → 改善 → 自分の文章 → 完了 を通す。
    """
    settings.AI_PROVIDER = "stub"
    client = _client_with_key(api_client, learner_key)

    # 1回目
    first = client.post(reverse("rewrite-text-generate"), VALID_REQUEST, format="json")
    assert first.status_code == 200
    # 改善
    assert (
        client.post(
            reverse("rewrite-text-generate"),
            {**VALID_REQUEST, "instruction": "もっと短くしてください。"},
            format="json",
        ).status_code
        == 200
    )
    # 自分の文章
    assert (
        client.post(
            reverse("rewrite-text-generate"),
            {**VALID_REQUEST, "original_text": "自分で書いた文章です。", "step": "REAL_TASK"},
            format="json",
        ).status_code
        == 200
    )
    # ポーのフィードバック
    assert (
        client.post(
            reverse("tutor-feedback"),
            {
                "lesson_id": LESSON_ID,
                "step": "review_result",
                "user_input": "できた文章",
                "attempt_count": 1,
            },
            format="json",
        ).status_code
        == 200
    )
    # 完了
    assert (
        client.post(
            reverse("learning-events"),
            {"lesson_id": LESSON_ID, "event_type": "lesson_completed", "completed": True},
            format="json",
        ).status_code
        # 終えた回だけ、何が増えたかを返す（204 ではない）
        == 200
    )

    assert Attempt.objects.count() == 4
    assert LearningSession.objects.get().completed_at is not None
    assert SkillProgress.objects.count() == 2

@pytest.mark.django_db
class TestEventStepIds:
    """ステップの id は教材データが決める。

    選択肢で縛っていたころは、レッスンを1本足すたびに
    操作ログが 400 で落ちていた。画面は動いて見えるのに
    記録だけが欠ける、いちばん気づきにくい壊れ方だった。
    """

    def test_new_step_ids_are_accepted(self, api_client):
        from apps.lessons.models import LearningEvent

        for step in ("use_case", "source_text", "prompt_preview", "real_task"):
            response = api_client.post(
                reverse("learning-events"),
                {
                    "lesson_id": "rewrite_text",
                    "step": step,
                    "event_type": "step_viewed",
                },
                format="json",
            )
            assert response.status_code == 204, response.json()

        assert LearningEvent.objects.count() == 4

    def test_body_is_still_refused(self, api_client):
        # 縛りを外しても、本文だけは受け取らない
        response = api_client.post(
            reverse("learning-events"),
            {
                "lesson_id": "rewrite_text",
                "step": "source_text",
                "event_type": "text_entered",
                "user_input": "本文です",
            },
            format="json",
        )
        assert response.status_code == 400
