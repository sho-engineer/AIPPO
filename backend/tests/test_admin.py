"""実証実験のデータを見る画面のテスト。

守りたいこと:
- 集計画面がデータ0件でも壊れないこと（実証実験の初日に必ず通る道）
- 検証したい数字が実際に出ること
- 管理画面が誰でも見られる状態になっていないこと
"""

import pytest
from django.contrib.auth.models import User

from apps.lessons.models import (
    AiUsageCounter,
    Attempt,
    AttemptStatus,
    LearningSession,
    Survey,
    TutorOrigin,
)

SUMMARY_URL = "/admin/lessons/verificationsummary/"


@pytest.fixture
def staff_client(client, db):
    User.objects.create_superuser("kanri", "kanri@example.com", "pass-1234-pass")
    client.login(username="kanri", password="pass-1234-pass")
    return client


@pytest.fixture
def sample_data(db):
    done = LearningSession.objects.create(
        learner_key="11111111-1111-1111-1111-111111111111",
        lesson_id="rewrite_text_001",
        current_step="COMPLETE",
        completed_at="2026-08-01T10:00:00Z",
    )
    stuck = LearningSession.objects.create(
        learner_key="22222222-2222-2222-2222-222222222222",
        lesson_id="rewrite_text_001",
        current_step="FIRST_INPUT",
    )
    Attempt.objects.create(
        session=done,
        sequence=1,
        lesson_id="rewrite_text_001",
        step="FIRST_INPUT",
        user_input="ここに学習者の本文が入る",
        generated_output="書き直した文章",
        status=AttemptStatus.SUCCEEDED,
        model_name="claude-opus-5",
        token_usage={"input": 300, "output": 80},
        latency_ms=2400,
    )
    Attempt.objects.create(
        session=stuck,
        sequence=1,
        lesson_id="rewrite_text_001",
        step="FIRST_INPUT",
        status=AttemptStatus.FAILED,
        tutor_origin=TutorOrigin.FALLBACK,
    )
    Survey.objects.create(session=done, answers={"would_pay": "yes", "again": "yes"})
    AiUsageCounter.objects.create(
        scope=AiUsageCounter.GLOBAL_SCOPE, date="2026-08-01", count=7
    )
    return done, stuck


@pytest.mark.django_db
class TestAccessControl:
    def test_anonymous_cannot_see_the_data(self, client):
        response = client.get(SUMMARY_URL)
        assert response.status_code in (301, 302), "誰でも見られる状態になっている"
        assert "/admin/login" in response["Location"]

    def test_staff_can_see_the_data(self, staff_client):
        assert staff_client.get(SUMMARY_URL).status_code == 200


@pytest.mark.django_db
class TestSummary:
    def test_survives_an_empty_database(self, staff_client):
        """実証実験の初日は必ず0件から始まる。"""
        response = staff_client.get(SUMMARY_URL)

        assert response.status_code == 200
        assert response.context["completion_rate"] == 0
        assert response.context["total_sessions"] == 0

    def test_shows_completion_rate(self, staff_client, sample_data):
        context = staff_client.get(SUMMARY_URL).context

        assert context["total_sessions"] == 2
        assert context["completed_sessions"] == 1
        assert context["completion_rate"] == 50.0

    def test_shows_where_learners_got_stuck(self, staff_client, sample_data):
        """同じ画面に人が溜まっていたら、そこが迷わせている場所。"""
        steps = staff_client.get(SUMMARY_URL).context["abandoned_steps"]
        assert {"current_step": "FIRST_INPUT", "n": 1} in steps

    def test_shows_ai_cost_and_health(self, staff_client, sample_data):
        context = staff_client.get(SUMMARY_URL).context

        assert context["ai_runs"] == 2
        assert context["ai_failures"] == 1
        assert context["poe_fallbacks"] == 1
        assert context["input_tokens"] == 300
        assert context["output_tokens"] == 80
        assert context["avg_latency_ms"] == 2400

    def test_shows_survey_tally(self, staff_client, sample_data):
        tally = staff_client.get(SUMMARY_URL).context["survey_tally"]
        assert tally["would_pay"] == {"yes": 1}

    def test_does_not_print_learner_text_on_the_summary(self, staff_client, sample_data):
        """集計画面で見たいのは傾向であって、個人の文章ではない。"""
        body = staff_client.get(SUMMARY_URL).content.decode()
        assert "ここに学習者の本文が入る" not in body


@pytest.mark.django_db
class TestRecordsAreReadOnly:
    def test_attempt_fields_cannot_be_edited(self, staff_client, sample_data):
        attempt = Attempt.objects.first()
        url = f"/admin/lessons/attempt/{attempt.pk}/change/"
        response = staff_client.get(url)

        assert response.status_code == 200
        # 読み取り専用なので、本文の入力欄は出てこない
        assert 'name="user_input"' not in response.content.decode()


@pytest.mark.django_db
def test_ip_hash_is_shown_without_revealing_the_address(staff_client):
    AiUsageCounter.objects.create(scope="a" * 64, date="2026-08-01", count=3)
    body = staff_client.get("/admin/lessons/aiusagecounter/").content.decode()

    assert "a" * 8 in body
    assert "a" * 64 not in body, "HMAC 全体を出す必要はない"
