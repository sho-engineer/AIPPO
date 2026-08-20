"""しばらく開いていない人へ、続きの知らせを送る。

    python manage.py send_reminders

このアプリは「7日でAIの最初の一歩」と言っている。だが2日目に
戻ってくる仕掛けが何も無く、1本やって終わる人を止められなかった。
設定画面には「学習リマインダー」のつまみだけが先に置いてあり、
入れても何も起きない状態だった。

送る相手の決め方
----------------
次の**すべて**に当てはまる人だけに送る。

  - 登録している（メールの宛先がある）
  - 受け取る設定にしている（`UserProfile.remind_study`）
  - メールを確かめている
  - 最後に学んでから、決めた日数が経っている
  - 前に送ってから、決めた日数が経っている
  - まだ全部は終えていない

最後の2つが要る理由
-------------------
前に送った日を見ないと、条件に当てはまり続ける人へ毎日届く。
「もう来ないでほしい」と思われた時点で、その人はもう戻らない。

全部終えた人に「続きを」と言うのも同じ。終えた人に続きは無い。

送りすぎない
------------
1日1回動かす前提。何度動かしても、同じ人へ二重には送らない
（送った時刻を控え、次はそこから数える）。

止められること
--------------
本文に必ず止め方を書く（`emails.send_study_reminder`）。
止められない知らせは、ただの迷惑になる。
"""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import Max, Q
from django.utils import timezone

from apps.accounts import emails
from apps.accounts.models import LearnerIdentity, UserProfile
from apps.lessons.models import LearningSession

#: 最後に学んでから何日で送るか。
#:
#: 2日。翌日だと早すぎて急かしているように見えるし、1週間だと
#: そのころには忘れている。「7日で学ぶ」の間隔にも合う。
#:
#: 送る間隔は運用しながら決まるものなので、設定から変えられるようにする。
DEFAULT_IDLE_DAYS = int(getattr(settings, "REMINDER_IDLE_DAYS", 2))

#: 前に送ってから、次に送るまで最低何日あけるか。
#:
#: 7日。学びに戻る気が無い人に週2回届けば、それは迷惑でしかない。
DEFAULT_COOLDOWN_DAYS = int(getattr(settings, "REMINDER_COOLDOWN_DAYS", 7))


class Command(BaseCommand):
    help = "しばらく開いていない人へ、続きの知らせを送る（1日1回）"

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--idle-days",
            type=int,
            default=DEFAULT_IDLE_DAYS,
            help=f"最後に学んでから何日で送るか（既定 {DEFAULT_IDLE_DAYS}）",
        )
        parser.add_argument(
            "--cooldown-days",
            type=int,
            default=DEFAULT_COOLDOWN_DAYS,
            help=f"前に送ってから何日あけるか（既定 {DEFAULT_COOLDOWN_DAYS}）",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="送らずに、誰に送るかだけ出す",
        )

    def handle(self, *args, **options) -> None:
        idle_days = options["idle_days"]
        cooldown_days = options["cooldown_days"]
        dry_run = options["dry_run"]

        now = timezone.now()
        idle_before = now - timedelta(days=idle_days)
        cooldown_before = now - timedelta(days=cooldown_days)

        sent = skipped = failed = 0

        for profile in self._candidates(cooldown_before):
            last_seen = self._last_seen(profile.user)
            if last_seen is None or last_seen > idle_before:
                # 一度も学んでいない人と、最近来た人には送らない
                skipped += 1
                continue

            if self._finished_everything(profile.user):
                skipped += 1
                continue

            days_away = max(1, (now - last_seen).days)

            if dry_run:
                self.stdout.write(f"  送る予定: {profile.user.email}（{days_away}日ぶり）")
                sent += 1
                continue

            if emails.send_study_reminder(profile.user, days_away=days_away):
                profile.reminded_at = now
                profile.save(update_fields=["reminded_at", "updated_at"])
                sent += 1
            else:
                # 送れなかったときは控えない。次の実行でもう一度試す
                failed += 1

        head = "送る予定" if dry_run else "送った"
        self.stdout.write(
            f"{head} {sent}件 / 見送り {skipped}件 / 失敗 {failed}件"
        )

    @staticmethod
    def _candidates(cooldown_before):
        """送ってよい人。

        メールを確かめていない人には送らない。届かない宛先へ送り続けると、
        送信元の評判が落ちて、確認メールまで迷惑メール扱いになる。
        """
        return (
            UserProfile.objects.filter(
                remind_study=True,
                email_verified_at__isnull=False,
            )
            .filter(
                # 一度も送っていないか、前回から間隔が空いている
                Q(reminded_at__isnull=True) | Q(reminded_at__lt=cooldown_before)
            )
            .exclude(user__email="")
            .select_related("user")
        )

    @staticmethod
    def _last_seen(user):
        """最後に学んだ日時。端末をまたいで一番新しいもの。"""
        keys = list(
            LearnerIdentity.objects.filter(user=user).values_list("learner_key", flat=True)
        )
        if not keys:
            return None
        return LearningSession.objects.filter(learner_key__in=keys).aggregate(
            last=Max("updated_at")
        )["last"]

    @staticmethod
    def _finished_everything(user) -> bool:
        """始められる教材を、全部終えているか。

        終えた人に「続きを」と言わない。続きが無い。
        """
        from apps.catalog.models import AvailabilityStatus, Lesson, PublishStatus

        startable = set(
            Lesson.objects.filter(
                status=PublishStatus.PUBLISHED,
                availability_status=AvailabilityStatus.AVAILABLE,
            ).values_list("slug", flat=True)
        )
        if not startable:
            # 教材を取り込んでいない環境。判断できないので送る側に倒さない
            return False

        keys = list(
            LearnerIdentity.objects.filter(user=user).values_list("learner_key", flat=True)
        )
        done = set(
            LearningSession.objects.filter(
                learner_key__in=keys, completed_at__isnull=False
            ).values_list("lesson_id", flat=True)
        )
        return startable <= done
