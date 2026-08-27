"""古い記録を消す。

プライバシーポリシーに「登録なしで使った場合の記録は、最後の利用から
一定期間が過ぎたら削除します」と書いてある。書いたなら、消す仕組みが要る。
無いまま置くと、書いたことと実装が食い違う。

消すもの
--------
- **登録していない人**の学習の記録（誰にも結びついていない learner_key）
- 認証の試行回数（用が済んでいる。窓を過ぎれば意味が無い）
- AI実行回数の日次カウンタ（同上）

消さないもの
------------
- 登録した人の記録。消したいときは本人が設定画面から消す
- 教材そのもの

いつ動かすか
------------
1日1回。cron でも、コンテナ基盤の定期実行でもよい。

    python manage.py prune_data

何が消えるか先に見たいときは `--dry-run`。取り消せない操作なので、
はじめて動かすときは必ずこちらから。
"""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import AuthThrottle, LearnerIdentity
from apps.lessons.models import AiUsageCounter, LearningSession, SkillProgress
from apps.profiles.models import LearnerProfile


class Command(BaseCommand):
    help = "登録していない人の古い記録と、用の済んだカウンタを消す"

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--days",
            type=int,
            default=None,
            help="この日数より古いものを消す（既定は GUEST_DATA_RETENTION_DAYS）",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="消さずに、消える件数だけ出す",
        )

    def handle(self, *args, **options) -> None:
        days = options["days"] or settings.GUEST_DATA_RETENTION_DAYS
        dry_run = options["dry_run"]
        cutoff = timezone.now() - timedelta(days=days)

        counts = prune(cutoff, dry_run=dry_run)

        head = "消える件数（--dry-run）" if dry_run else "消しました"
        self.stdout.write(f"{head}: {days}日より前（{cutoff:%Y-%m-%d}）")
        for label, count in counts.items():
            self.stdout.write(f"  {label}: {count}")


def guest_keys(cutoff):
    """消してよい learner_key。

    条件は2つ。**どちらも**満たすものだけ。

    - 誰にも結びついていない（登録していない）
    - 最後に触ってから `cutoff` より前

    結びつきを見ずに日付だけで消すと、しばらく開いていない
    登録済みの人の記録まで消える。
    """
    linked = LearnerIdentity.objects.filter(user__isnull=False).values_list(
        "learner_key", flat=True
    )
    return list(
        LearningSession.objects.filter(updated_at__lt=cutoff)
        .exclude(learner_key__in=linked)
        .values_list("learner_key", flat=True)
        .distinct()
    )


def prune(cutoff, *, dry_run: bool = False) -> dict[str, int]:
    """消す。件数を返す。

    `dry_run` なら数えるだけで消さない。
    """
    keys = guest_keys(cutoff)

    """
    まだ触っている鍵は外す。

    同じ鍵で古いセッションと新しいセッションの両方を持っている人がいる。
    古いほうだけを見て鍵ごと消すと、続きから始めるつもりだった
    新しいほうまで消える。
    """
    still_active = set(
        LearningSession.objects.filter(learner_key__in=keys, updated_at__gte=cutoff)
        .values_list("learner_key", flat=True)
        .distinct()
    )
    keys = [key for key in keys if key not in still_active]

    sessions = LearningSession.objects.filter(learner_key__in=keys)
    profiles = LearnerProfile.objects.filter(learner_key__in=keys)
    skills = SkillProgress.objects.filter(learner_key__in=keys)

    # 学んだ量も、鍵ごと消えるものと一緒に消す。
    # 残しても、鍵が無くなれば誰の分か分からない記録になるだけ
    from apps.rewards.models import XpEvent

    xp_events = XpEvent.objects.filter(learner_key__in=keys)

    # 試行回数は、いちばん長い窓を過ぎたら用が無い。
    # 余裕を持って1日ぶん残す（時計のずれで消しすぎないように）
    throttle_cutoff = timezone.now() - timedelta(days=1)
    throttles = AuthThrottle.objects.filter(window_start__lt=throttle_cutoff)

    # 日次カウンタも同じ。過ぎた日の数は、もう誰も見ない
    counters = AiUsageCounter.objects.filter(date__lt=cutoff.date())

    """
    操作記録は別の物差しで切る。

    学習データの `cutoff` を使い回すと、触られたことに気づくより先に
    調べるための記録が消える。気づくのはたいていずっとあとになる。
    """
    from apps.ops.models import AuditLog

    audit_cutoff = timezone.now() - timedelta(days=settings.AUDIT_LOG_RETENTION_DAYS)
    audit_logs = AuditLog.objects.filter(at__lt=audit_cutoff)

    counts = {
        "学習セッション": sessions.count(),
        "診断の回答": profiles.count(),
        "身につけたこと": skills.count(),
        "XPの記録": xp_events.count(),
        "試行回数": throttles.count(),
        "AI実行回数": counters.count(),
        "操作記録": audit_logs.count(),
    }

    if not dry_run:
        # Attempt / LearningEvent / Survey はセッションに連なって消える
        sessions.delete()
        profiles.delete()
        skills.delete()
        xp_events.delete()
        throttles.delete()
        counters.delete()
        audit_logs.delete()
        # 使われなくなった結びつき（user が空のもの）も片付ける
        LearnerIdentity.objects.filter(user__isnull=True, learner_key__in=keys).delete()

    return counts
