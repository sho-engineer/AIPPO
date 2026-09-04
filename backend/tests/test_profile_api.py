"""AI活用診断の回答を保存する経路のテスト。

守りたいこと:
- 回答が保存され、実証実験で「誰が来たか」が分かること
- 学習者を匿名のままにすること（憲章 原則 VI）
- 保存に失敗してもレッスンを止めないこと
"""

import pytest
from django.urls import reverse

from apps.profiles.models import LearnerProfile

VALID = {
    "ai_experience": "none",
    "job_category": "事務・管理",
    "pain_point": "writing",
}


def _post(api_client, **overrides):
    return api_client.post(
        reverse("learner-profile"), {**VALID, **overrides}, format="json"
    )


@pytest.mark.django_db
class TestSaving:
    def test_answers_are_stored(self, api_client):
        """これが無いと、実証実験で誰が来たか分からない。"""
        assert _post(api_client).status_code == 204

        profile = LearnerProfile.objects.get()
        assert profile.ai_experience == "none"
        assert profile.job_category == "事務・管理"
        assert profile.pain_point == "writing"

    def test_retaking_overwrites_instead_of_piling_up(self, api_client):
        _post(api_client)
        _post(api_client, ai_experience="regular")

        assert LearnerProfile.objects.count() == 1
        assert LearnerProfile.objects.get().ai_experience == "regular"

    def test_bound_to_the_learner_key_cookie(self, api_client):
        response = _post(api_client)
        learner_key = response.cookies["learner_key"].value

        assert str(LearnerProfile.objects.get().learner_key) == learner_key

    def test_different_learners_are_separate(self, api_client):
        _post(api_client)
        api_client.cookies.clear()
        _post(api_client, job_category="営業")

        assert LearnerProfile.objects.count() == 2


def _save_in_threads(jobs: list[tuple]) -> list[str]:
    """save_profile を同時に走らせて、結果を集める。"""
    import threading

    from apps.profiles.views import save_profile

    results: list[str] = []
    lock = threading.Lock()

    def _run(learner_key, values):
        from django.db import connection

        try:
            save_profile(learner_key, values)
            outcome = "ok"
        except Exception as exc:  # noqa: BLE001 - 種類を見たいのでそのまま拾う
            outcome = f"error:{type(exc).__name__}"
        finally:
            connection.close()

        with lock:
            results.append(outcome)

    threads = [threading.Thread(target=_run, args=job) for job in jobs]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)
    return results


class TestSavingAtTheSameTime:
    """公開直後に何人もが同時に診断を終える場面。

    以前は `update_or_create` を使っていて、1つのトランザクションの中で
    「読んでから書く」形になっていた。書き込みが重なると
    `database is locked` で 500 になり、
    **診断を終えた人にだけ**エラーが出るという最悪の壊れ方をする。
    """

    def test_many_learners_finish_at_once(self, transactional_db):
        import uuid

        jobs = [
            (uuid.uuid4(), {**VALID, "job_category": f"職種{i}"}) for i in range(12)
        ]
        results = _save_in_threads(jobs)

        errors = [r for r in results if r.startswith("error:")]
        assert errors == [], f"同時に保存すると落ちる: {errors}"
        assert LearnerProfile.objects.count() == 12

    def test_the_same_learner_answers_twice_at_once(self, transactional_db):
        """同じ人の回答がほぼ同時に届いても、行は増えない。"""
        import uuid

        learner_key = uuid.uuid4()
        jobs = [
            (learner_key, {**VALID, "ai_experience": experience})
            for experience in ("none", "tried", "occasional", "regular")
        ]
        results = _save_in_threads(jobs)

        assert [r for r in results if r.startswith("error:")] == []
        assert LearnerProfile.objects.filter(learner_key=learner_key).count() == 1


@pytest.mark.django_db
class TestPrivacy:
    def test_only_the_three_diagnosis_answers_are_accepted(self, api_client):
        """氏名や連絡先の類は、送られてきても保存しない。"""
        _post(api_client, name="山田太郎", email="taro@example.com")

        profile = LearnerProfile.objects.get()
        assert not hasattr(profile, "name")
        stored = {
            f.name: getattr(profile, f.name) for f in LearnerProfile._meta.fields
        }
        assert "山田太郎" not in str(stored)
        assert "taro@example.com" not in str(stored)

    def test_phase3_fields_are_not_filled_yet(self, api_client):
        """MVP で埋めるのは3項目だけ（設計判断 Q-1）。"""
        _post(api_client, learning_goal="上達したい", detail_preference="detailed")

        profile = LearnerProfile.objects.get()
        assert profile.learning_goal == ""
        assert profile.detail_preference == ""


@pytest.mark.django_db
class TestValidation:
    @pytest.mark.parametrize(
        "field,value",
        [
            ("ai_experience", "とても使う"),  # 選択肢にない
            ("ai_experience", ""),
        ],
    )
    def test_invalid_answers_are_refused(self, api_client, field, value):
        assert _post(api_client, **{field: value}).status_code == 400
        assert LearnerProfile.objects.count() == 0

    @pytest.mark.parametrize("field", ["job_category", "pain_point"])
    def test_fields_we_stopped_asking_may_be_empty(self, api_client, field):
        """もう聞いていない項目は、空で来ても受け取る。

        診断が3問から5問へ変わり、職種は聞くのをやめた（初回で聞いても、
        答えたことで次の一歩が変わらないため）。ここで空を弾くと、
        **聞くのをやめた項目のせいで診断の保存が 400 になる**。
        保存は待たずに投げているので、画面には何も出ずに気づけない。

        選択肢のある項目（`ai_experience`）は、これまでどおり弾く。
        あちらは値そのものが集計の単位になっている。
        """
        assert _post(api_client, **{field: ""}).status_code == 204
        assert LearnerProfile.objects.count() == 1

    def test_overlong_values_are_refused(self, api_client):
        assert _post(api_client, job_category="あ" * 101).status_code == 400


@pytest.mark.django_db
def test_summary_shows_completion_rate_by_experience(client, django_user_model):
    """完了率を経験別に割れること。これが今回の追加の目的。"""
    from apps.lessons.models import LearningSession

    django_user_model.objects.create_superuser("kanri", "k@example.com", "pass-1234")
    client.login(username="kanri", password="pass-1234")

    done_key = "11111111-1111-1111-1111-111111111111"
    LearningSession.objects.create(
        learner_key=done_key,
        lesson_id="rewrite_text_001",
        completed_at="2026-08-01T10:00:00Z",
    )
    LearnerProfile.objects.create(
        learner_key=done_key,
        ai_experience="none",
        job_category="事務・管理",
        pain_point="writing",
    )
    LearnerProfile.objects.create(
        learner_key="22222222-2222-2222-2222-222222222222",
        ai_experience="none",
        job_category="営業",
        pain_point="writing",
    )

    context = client.get("/admin/lessons/verificationsummary/").context
    row = context["by_experience"]["使ったことがない"]

    assert row == {"came": 2, "completed": 1, "rate": 50.0}
    assert context["pain_points"] == [("writing", 2)]
