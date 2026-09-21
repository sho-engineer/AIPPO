"""段・昇段の条件・実践問題だけを入れる。

    uv run python manage.py seed_levels

いつ使うか
----------
ふだんは要らない。リリースの流れは `seed_catalog` を流しており、
そこから `seed_rewards` → `seed_levels` と呼ばれるので、段の中身は
放っておいても入る。

ここが要るのは、**段だけを入れ直したいとき**。`seed_catalog` は
教材の本文まで上書きするので（`_upsert_lesson`）、管理画面から
直した文言が同梱データへ巻き戻る。段の要件を1つ変えただけで
そこまで動かす理由は無い。

こちらが触るのは**新しい4つの表だけ**（`AippoLevel` /
`LevelRequirement` / `RankUpChallenge`、および結びつける M2M）。
教材にも、学習者の記録にも触らない。何度実行しても同じ結果になる。

技が先に要る
------------
段の要件は `AiSkill` を指す。図鑑がまだ空の環境では要件を作れない
ので、そのときは**何もせずに終わる**——歯抜けの要件を残すほうが
危ない（技0個は「そろっている」ことになり、素通りで上がれてしまう）。
`build_map` 側にも同じ線を引いてあるが、入れる側でも止めておく。
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.rewards.levels import LEVELS, seed_levels
from apps.rewards.models import (
    AippoLevel,
    AiSkill,
    LevelRequirement,
    RankUpChallenge,
)


class Command(BaseCommand):
    help = "AIPPO Level・昇段の条件・実践問題を入れる（教材には触らない）"

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        if not AiSkill.objects.exists():
            self.stdout.write(
                self.style.ERROR(
                    "AI技がまだ1件も入っていません。段の要件は技を指すので、"
                    "先に seed_catalog（または seed_rewards）を実行してください。"
                    "このまま入れると、要件が空のまま固定されます。"
                )
            )
            return

        seed_levels()

        filled = sum(
            1
            for seed in LEVELS
            if seed.skills
            and LevelRequirement.objects.filter(level_id=seed.number).exists()
            and LevelRequirement.objects.get(
                level_id=seed.number
            ).required_skills.count()
            == len(seed.skills)
        )
        wanted = sum(1 for seed in LEVELS if seed.skills)

        self.stdout.write(
            self.style.SUCCESS(
                f"段 {AippoLevel.objects.count()} / "
                f"条件がそろった段 {filled} / {wanted} / "
                f"実践問題 {RankUpChallenge.objects.count()}"
            )
        )

        if filled < wanted:
            self.stdout.write(
                self.style.WARNING(
                    "要件がそろっていない段があります。指している技が"
                    "図鑑に無い可能性があります（seed_catalog を先に）。"
                )
            )
