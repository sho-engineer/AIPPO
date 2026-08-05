"""古い記録を消す。

プライバシーポリシーに「一定期間が過ぎたら削除します」と書いた以上、
消す仕組みが要る。書いたことと実装が食い違えば、それは嘘になる。

ここで見張るのは、消しすぎないこと。取り消せない操作なので、
「消えるべきものが残る」より「消えてはいけないものが消える」ほうが重い。
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.utils import timezone

from apps.accounts.migration import claim_guest_data
from apps.accounts.models import AuthThrottle, LearnerIdentity
from apps.lessons.management.commands.prune_data import prune
from apps.lessons.models import (
    AiUsageCounter,
    Attempt,
    AttemptStatus,
    LearningEvent,
    LearningSession,
    SkillProgress,
)
from apps.profiles.models import LearnerProfile

User = get_user_model()


def _session(*, age_days: int, learner_key=None) -> LearningSession:
    """`age_days` 日前に最後に触った、というセッションを作る。

    `updated_at` は auto_now なので、作ってから直接書き換える。
    """
    session = LearningSession.objects.create(
        learner_key=learner_key or uuid.uuid4(), lesson_id="rewrite_text"
    )
    when = timezone.now() - timedelta(days=age_days)
    LearningSession.objects.filter(pk=session.pk).update(updated_at=when)
    session.refresh_from_db()
    return session


def _cutoff(days: int = 180):
    return timezone.now() - timedelta(days=days)


@pytest.mark.django_db
class TestWhatGoes:
    def test_an_old_guest_session_is_removed(self):
        _session(age_days=200)

        prune(_cutoff())

        assert not LearningSession.objects.exists()

    def test_a_recent_guest_session_stays(self):
        _session(age_days=10)

        prune(_cutoff())

        assert LearningSession.objects.count() == 1

    def test_what_hangs_off_the_session_goes_with_it(self):
        session = _session(age_days=200)
        Attempt.objects.create(
            session=session,
            sequence=1,
            lesson_id="rewrite_text",
            step="FIRST_INPUT",
            status=AttemptStatus.SUCCEEDED,
        )
        session.events.create(
            lesson_id="rewrite_text", step="FIRST_INPUT", event_type="lesson_started"
        )

        prune(_cutoff())

        assert not Attempt.objects.exists()
        assert not LearningEvent.objects.exists()

    def test_the_diagnosis_and_skills_go_too(self):
        session = _session(age_days=200)
        LearnerProfile.objects.create(learner_key=session.learner_key)
        SkillProgress.objects.create(
            learner_key=session.learner_key, lesson_id="rewrite_text", skill_key="state_audience"
        )

        prune(_cutoff())

        assert not LearnerProfile.objects.exists()
        assert not SkillProgress.objects.exists()


@pytest.mark.django_db
class TestWhatStays:
    def test_a_registered_persons_records_are_never_touched(self):
        """しばらく開いていない登録済みの人の記録まで消さない。

        結びつきを見ずに日付だけで消すと、これが起きる。
        """
        session = _session(age_days=400)
        user = User.objects.create_user(username="a@example.com", email="a@example.com")
        claim_guest_data(user, session.learner_key)

        prune(_cutoff())

        assert LearningSession.objects.filter(pk=session.pk).exists()

    def test_a_key_still_in_use_is_kept_whole(self):
        """同じ鍵で古い分と新しい分の両方を持っている人がいる。

        古いほうだけを見て鍵ごと消すと、続きから始めるつもりだった
        新しいほうまで消える。
        """
        key = uuid.uuid4()
        old = _session(age_days=300, learner_key=key)
        recent = _session(age_days=3, learner_key=key)

        prune(_cutoff())

        assert LearningSession.objects.filter(pk=recent.pk).exists()
        assert LearningSession.objects.filter(pk=old.pk).exists()

    def test_someone_elses_records_are_not_swept_up(self):
        _session(age_days=200)
        keep = _session(age_days=5)

        prune(_cutoff())

        assert list(LearningSession.objects.values_list("pk", flat=True)) == [keep.pk]


@pytest.mark.django_db
class TestCounters:
    def test_spent_attempt_counts_are_removed(self):
        AuthThrottle.objects.create(
            scope="signin:ip:x", window_start=timezone.now() - timedelta(days=3), count=5
        )
        AuthThrottle.objects.create(
            scope="signin:ip:y", window_start=timezone.now(), count=1
        )

        prune(_cutoff())

        # いまの窓は残す。消すと、進行中の連打がやり直しになる
        assert AuthThrottle.objects.count() == 1

    def test_old_daily_counters_are_removed(self):
        AiUsageCounter.objects.create(
            scope="global", date=(timezone.now() - timedelta(days=300)).date(), count=10
        )
        AiUsageCounter.objects.create(scope="global", date=timezone.localdate(), count=3)

        prune(_cutoff())

        assert AiUsageCounter.objects.count() == 1


@pytest.mark.django_db
class TestTheCommand:
    def test_dry_run_deletes_nothing(self):
        _session(age_days=300)

        out = StringIO()
        call_command("prune_data", "--dry-run", stdout=out)

        assert LearningSession.objects.count() == 1
        assert "学習セッション: 1" in out.getvalue()

    def test_it_reports_what_it_removed(self):
        _session(age_days=300)

        out = StringIO()
        call_command("prune_data", stdout=out)

        assert not LearningSession.objects.exists()
        assert "消しました" in out.getvalue()

    def test_the_period_can_be_overridden(self):
        _session(age_days=20)

        call_command("prune_data", "--days", "10")

        assert not LearningSession.objects.exists()

    def test_unlinked_identities_are_cleaned_up(self):
        session = _session(age_days=300)
        LearnerIdentity.objects.create(learner_key=session.learner_key)

        call_command("prune_data")

        assert not LearnerIdentity.objects.exists()


class TestItMatchesWhatWeSaid:
    """画面に書いた期間と、実際に消す期間が同じであること。

    ずれると、書いたことと実装が食い違う。ポリシーは「そう書いてある」
    だけで意味を持つものではなく、そのとおりに動いて初めて意味がある。
    """

    def test_the_period_in_the_policy_is_the_one_we_use(self, settings):
        from pathlib import Path

        source = (
            Path(__file__).resolve().parents[2]
            / "frontend"
            / "src"
            / "content"
            / "legal.ts"
        ).read_text(encoding="utf-8")

        assert f"最後の利用から{settings.GUEST_DATA_RETENTION_DAYS}日" in source
