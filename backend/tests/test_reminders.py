"""学習リマインダー。しばらく開いていない人へ、続きの知らせを送る。

このアプリは「7日でAIの最初の一歩」と言っている。だが2日目に戻ってくる
仕掛けが何も無く、1本やって終わる人を止められなかった。設定画面には
つまみだけが先に置いてあり、入れても何も起きない状態だった。

ここで守るのは、送ることそのものより**送りすぎないこと**。

  1. 切っている人には送らない（切れない知らせは、ただの迷惑）
  2. 同じ人へ何度も送らない（毎日届けば、その人はもう戻らない）
  3. 最近来た人には送らない
  4. 全部終えた人に「続きを」と言わない
  5. メールを確かめていない人には送らない
     （届かない宛先へ送り続けると、送信元の評判が落ちて
      確認メールまで迷惑メール扱いになる）
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from io import StringIO

import pytest
from django.core import mail
from django.core.management import call_command
from django.utils import timezone

from apps.accounts.models import LearnerIdentity, UserProfile
from apps.catalog.models import AvailabilityStatus, Lesson, PublishStatus
from apps.lessons.models import LearningSession

PROFILE_URL = "/api/v1/accounts/profile/"
SIGNUP_URL = "/api/v1/accounts/signup/"


@pytest.fixture(autouse=True)
def _mail_to_memory(settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    mail.outbox.clear()


def _learner(django_user_model, *, email="learner@example.com", verified=True, **profile):
    """登録済みの人を1人作り、端末の鍵も結びつける。"""
    user = django_user_model.objects.create_user(
        username=email, email=email, password="aippo-strong-pass-9"
    )
    UserProfile.objects.create(
        user=user,
        email_verified_at=timezone.now() if verified else None,
        **profile,
    )
    key = uuid.uuid4()
    LearnerIdentity.objects.create(learner_key=key, user=user)
    return user, key


def _studied(key: uuid.UUID, *, days_ago: float, lesson_id="rewrite_text", done=False):
    when = timezone.now() - timedelta(days=days_ago)
    session = LearningSession.objects.create(
        learner_key=key, lesson_id=lesson_id, completed_at=when if done else None
    )
    # updated_at は auto_now なので、作ったあとに直接書き戻す
    LearningSession.objects.filter(pk=session.pk).update(updated_at=when)
    return session


def _run(**options) -> str:
    out = StringIO()
    call_command("send_reminders", stdout=out, **options)
    return out.getvalue()


@pytest.mark.django_db
class TestWhoGetsOne:
    def test_someone_who_drifted_away_gets_one(self, django_user_model):
        _, key = _learner(django_user_model)
        _studied(key, days_ago=5)

        _run()

        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == ["learner@example.com"]

    def test_someone_who_came_back_today_does_not(self, django_user_model):
        _, key = _learner(django_user_model)
        _studied(key, days_ago=0)

        _run()

        assert mail.outbox == []

    def test_someone_who_never_started_does_not(self, django_user_model):
        """一度も学んでいない人に「続きを」と言わない。続きが無い。"""
        _learner(django_user_model)

        _run()

        assert mail.outbox == []


@pytest.mark.django_db
class TestNotSendingTooMuch:
    def test_turning_it_off_stops_it(self, django_user_model):
        _, key = _learner(django_user_model, remind_study=False)
        _studied(key, days_ago=5)

        _run()

        assert mail.outbox == []

    def test_it_does_not_arrive_twice_in_a_row(self, django_user_model):
        """1日1回動かしても、同じ人へ毎日届かないこと。

        「もう来ないでほしい」と思われた時点で、その人はもう戻らない。
        """
        _, key = _learner(django_user_model)
        _studied(key, days_ago=5)

        _run()
        _run()
        _run()

        assert len(mail.outbox) == 1

    def test_it_comes_again_after_the_gap(self, django_user_model):
        user, key = _learner(django_user_model)
        _studied(key, days_ago=5)
        _run()
        assert len(mail.outbox) == 1

        # 間隔が空けば、また送ってよい
        profile = UserProfile.objects.get(user=user)
        profile.reminded_at = timezone.now() - timedelta(days=8)
        profile.save(update_fields=["reminded_at"])

        _run()

        assert len(mail.outbox) == 2

    def test_an_unverified_address_is_left_alone(self, django_user_model):
        """届かない宛先へ送り続けると、送信元の評判が落ちる。

        巻き添えで、確認メールまで迷惑メール扱いになる。
        """
        _, key = _learner(django_user_model, verified=False)
        _studied(key, days_ago=5)

        _run()

        assert mail.outbox == []


@pytest.mark.django_db
class TestSomeoneWhoFinished:
    def test_no_reminder_after_finishing_everything(self, django_user_model):
        """終えた人に「続きを」と言わない。続きが無い。"""
        from apps.catalog.models import Course

        course = Course.objects.create(slug="c", title="コース", status=PublishStatus.PUBLISHED)
        for slug in ("rewrite_text", "summarize_text"):
            Lesson.objects.create(
                course=course,
                slug=slug,
                number=1,
                title=slug,
                status=PublishStatus.PUBLISHED,
                availability_status=AvailabilityStatus.AVAILABLE,
            )

        _, key = _learner(django_user_model)
        _studied(key, days_ago=5, lesson_id="rewrite_text", done=True)
        _studied(key, days_ago=5, lesson_id="summarize_text", done=True)

        _run()

        assert mail.outbox == []

    def test_a_reminder_still_comes_with_lessons_left(self, django_user_model):
        from apps.catalog.models import Course

        course = Course.objects.create(slug="c", title="コース", status=PublishStatus.PUBLISHED)
        for slug in ("rewrite_text", "summarize_text"):
            Lesson.objects.create(
                course=course,
                slug=slug,
                number=1,
                title=slug,
                status=PublishStatus.PUBLISHED,
                availability_status=AvailabilityStatus.AVAILABLE,
            )

        _, key = _learner(django_user_model)
        _studied(key, days_ago=5, lesson_id="rewrite_text", done=True)

        _run()

        assert len(mail.outbox) == 1


@pytest.mark.django_db
class TestWhatItSays:
    def test_it_says_how_to_stop(self, django_user_model):
        """止め方を必ず書くこと。止められない知らせは、ただの迷惑になる。"""
        _, key = _learner(django_user_model)
        _studied(key, days_ago=5)

        _run()

        assert "通知設定" in mail.outbox[0].body

    def test_it_does_not_rush_anyone(self, django_user_model):
        """急かさないこと。

        相手はAIに不安がある初心者。急かされると「向いていない」と
        受け取って離れる。
        """
        _, key = _learner(django_user_model)
        _studied(key, days_ago=5)

        _run()
        body = mail.outbox[0].body

        for pushy in ("まだ", "途切れ", "遅れ", "急いで", "しないと"):
            assert pushy not in body, f"急かす言い方が入っている: {pushy}"

    def test_it_says_how_long_it_takes(self, django_user_model):
        """時間が読めないと後回しになる。"""
        _, key = _learner(django_user_model)
        _studied(key, days_ago=5)

        _run()

        assert "10分" in mail.outbox[0].body


@pytest.mark.django_db
class TestTryingItOut:
    def test_dry_run_sends_nothing(self, django_user_model):
        _, key = _learner(django_user_model)
        _studied(key, days_ago=5)

        output = _run(dry_run=True)

        assert mail.outbox == []
        assert "learner@example.com" in output

    def test_dry_run_leaves_no_trace(self, django_user_model):
        """試しただけで「送った」ことにしない。

        控えてしまうと、本番の実行がその人を飛ばす。
        """
        user, key = _learner(django_user_model)
        _studied(key, days_ago=5)

        _run(dry_run=True)

        assert UserProfile.objects.get(user=user).reminded_at is None


@pytest.mark.django_db
class TestTheSetting:
    def test_it_can_be_turned_off_from_the_app(self, client, django_user_model):
        user, _ = _learner(django_user_model)
        client.force_login(user)

        response = client.patch(
            PROFILE_URL, {"remind_study": False}, content_type="application/json"
        )

        assert response.status_code == 200
        assert response.json()["user"]["remind_study"] is False
        assert UserProfile.objects.get(user=user).remind_study is False

    def test_changing_it_does_not_wipe_the_display_name(self, client, django_user_model):
        """片方だけ送ったときに、もう片方が黙って戻らないこと。"""
        user, _ = _learner(django_user_model)
        UserProfile.objects.filter(user=user).update(display_name="たろう")
        client.force_login(user)

        client.patch(
            PROFILE_URL, {"remind_study": False}, content_type="application/json"
        )

        assert UserProfile.objects.get(user=user).display_name == "たろう"

    def test_changing_the_name_does_not_wipe_the_setting(self, client, django_user_model):
        user, _ = _learner(django_user_model)
        UserProfile.objects.filter(user=user).update(remind_study=False)
        client.force_login(user)

        client.patch(
            PROFILE_URL, {"display_name": "はなこ"}, content_type="application/json"
        )

        assert UserProfile.objects.get(user=user).remind_study is False

    def test_it_is_on_by_default(self, client):
        """既定は受け取る。

        7日間で学ぶ設計なのに戻ってくる仕掛けが無いと、
        1本やって終わる人を止められない。切りたい人は切れる。
        """
        response = client.post(
            SIGNUP_URL,
            {
                "email": "new@example.com",
                "password": "aippo-strong-pass-9",
                "accept_terms": True,
                "accept_privacy": True,
            },
            content_type="application/json",
        )

        assert response.json()["user"]["remind_study"] is True


@pytest.mark.django_db
class TestTheCronEndpoint:
    """定期実行から叩く入り口。

    守り方は prune と同じ。勝手に叩けると「利用者へメールを送りつける
    入り口」になるので、消す操作と同じ厳しさで守る。
    """

    URL = "/api/v1/maintenance/reminders/"

    def test_it_does_not_exist_without_a_secret(self, client, settings):
        settings.CRON_SECRET = ""

        assert client.post(self.URL).status_code == 404

    def test_nothing_is_sent_without_a_secret(self, client, settings, django_user_model):
        settings.CRON_SECRET = ""
        _, key = _learner(django_user_model)
        _studied(key, days_ago=5)

        client.post(self.URL, HTTP_AUTHORIZATION="Bearer anything")

        assert mail.outbox == []

    def test_a_wrong_secret_is_refused(self, client, settings, django_user_model):
        settings.CRON_SECRET = "the-real-secret"
        _, key = _learner(django_user_model)
        _studied(key, days_ago=5)

        response = client.post(self.URL, HTTP_AUTHORIZATION="Bearer wrong")

        assert response.status_code == 401
        assert mail.outbox == []

    def test_a_prefix_of_the_secret_is_refused(self, client, settings):
        # 前方一致で通ると、1文字ずつ当てられる
        settings.CRON_SECRET = "the-real-secret"

        response = client.post(self.URL, HTTP_AUTHORIZATION="Bearer the-real")

        assert response.status_code == 401

    def test_the_right_secret_sends(self, client, settings, django_user_model):
        settings.CRON_SECRET = "the-real-secret"
        _, key = _learner(django_user_model)
        _studied(key, days_ago=5)

        response = client.post(
            self.URL, HTTP_AUTHORIZATION="Bearer the-real-secret"
        )

        assert response.status_code == 200
        assert len(mail.outbox) == 1

    def test_get_works_too(self, client, settings, django_user_model):
        """Vercel Cron は GET でしか叩けない。

        POST 限定にすると、設定は正しいのに毎回 405 が返り、
        送られないまま気づけない。
        """
        settings.CRON_SECRET = "the-real-secret"
        _, key = _learner(django_user_model)
        _studied(key, days_ago=5)

        response = client.get(self.URL, HTTP_AUTHORIZATION="Bearer the-real-secret")

        assert response.status_code == 200
        assert len(mail.outbox) == 1

    def test_it_reports_how_many_were_sent(self, client, settings, django_user_model):
        """0件が続いていれば、条件が厳しすぎるか動いていないかが分かる。"""
        settings.CRON_SECRET = "the-real-secret"
        _, key = _learner(django_user_model)
        _studied(key, days_ago=5)

        body = client.post(
            self.URL, HTTP_AUTHORIZATION="Bearer the-real-secret"
        ).json()

        assert "1件" in body["summary"]

    def test_the_path_matches_what_vercel_calls(self):
        """vercel.json に書いた行き先と、実際の入り口が一致すること。

        ずれていても誰も気づかない。届かないだけで、エラーも出ない。
        """
        import json
        from pathlib import Path

        config = json.loads(
            (Path(__file__).resolve().parents[2] / "vercel.json").read_text("utf-8")
        )
        paths = [entry["path"] for entry in config["crons"]]

        assert self.URL in paths
