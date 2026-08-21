"""Learning Path・スタンプ・節目の特典・AI単価の初期データを入れる。

    uv run python manage.py seed_rewards

何度実行しても同じ結果になる。すでに管理画面で直した値は巻き戻さない。

ふだんは `seed_catalog` の最後から自動で呼ばれるので、手で叩く必要は無い。
教材を先に入れてしまった環境で、あとから足したいときに使う。
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.rewards.seeding import seed_rewards


class Command(BaseCommand):
    help = "学習パス・スタンプ・節目の特典・AI単価の初期データを入れる"

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        path, pricing_made = seed_rewards()

        if path is None:
            self.stdout.write(
                self.style.WARNING(
                    "コースがまだ入っていないので、学習パスは作れませんでした。"
                    "先に seed_catalog を実行してください。"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"学習パス「{path.title}」: "
                    f"レッスン {path.path_lessons.count()} / "
                    f"スタンプ {path.stamp_definitions.count()} / "
                    f"節目 {path.milestones.count()}"
                )
            )

        self.stdout.write(f"AI単価: 新しく追加 {pricing_made} 件")
