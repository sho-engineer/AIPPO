"""XP と、そこから決まる呼び名（Level）。

XPは学んだ量。Credit（使える残高）とは別物で、**減らない**。
減る仕組みを入れると「失う恐怖で続けさせる」設計になる。
順位も他人との比較も出さない方針と揃えている。

合計はいつも `XpEvent` の SUM で出す。残高のカラムは持たない——
2か所に持つと必ずずれる（Credit で同じ判断をしている）。

Level をテーブルにしない理由
----------------------------
しきい値から計算で出せる。呼び名を変えたくなったとき、
テーブルだと migration と再計算が要るが、定数なら1行直すだけで済む。
過去の XpEvent は何も書き換わらないので、**呼び名を変えても
学んだ記録は動かない**。
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from django.db import IntegrityError, transaction
from django.db.models import Sum

from apps.rewards.models import XpEvent, XpKind

#: 何をしたら、いくつ増えるか。
#:
#: レッスン1本 > 技1つ にしてある。技は1本のレッスンで複数付くことが
#: あるので、逆にすると「技の多いレッスンだけ得」になり、
#: 教材の並べ方が点数に引きずられる。
XP_AMOUNTS: dict[str, int] = {
    XpKind.LESSON_COMPLETED: 20,
    XpKind.AI_SKILL_ACQUIRED: 10,
    XpKind.COURSE_CHECKPOINT: 30,
}

#: (ここから, 呼び名)。上から順に見て、超えている最後のものが今の呼び名。
#:
#: 数字は「1本20 + 技10前後」を目安にしている。最初の1本を終えた時点で
#: 次の呼び名が見えているほうがよい——0のまま何本も進む区間を作らない。
LEVELS: tuple[tuple[int, str], ...] = (
    (0, "AI Starter"),
    (100, "AI Beginner"),
    (300, "AI User"),
    (600, "AI Explorer"),
    (1000, "AI Navigator"),
)


@dataclass(frozen=True)
class LevelState:
    """いまの呼び名と、次までの距離。

    「あと何点」を出せるようにしてある。総量だけだと、
    次に何が起きるのか分からない。
    """

    total: int
    name: str
    index: int
    next_name: str | None
    next_at: int | None

    @property
    def to_next(self) -> int | None:
        """次の呼び名まで、あといくつ。最後まで来ていれば None。"""
        if self.next_at is None:
            return None
        return max(0, self.next_at - self.total)


def level_for(total: int) -> LevelState:
    """この総量なら、いまどの呼び名か。"""
    index = 0
    for position, (threshold, _name) in enumerate(LEVELS):
        if total >= threshold:
            index = position
    name = LEVELS[index][1]

    if index + 1 < len(LEVELS):
        next_at, next_name = LEVELS[index + 1]
    else:
        next_at, next_name = None, None

    return LevelState(
        total=total, name=name, index=index, next_name=next_name, next_at=next_at
    )


def total_xp(learner_keys: list[uuid.UUID]) -> int:
    """この人のXPの合計（全端末ぶん）。

    読みは必ず「読んでよい鍵ぜんぶ」で引く。いまの端末だけで引くと、
    別の端末で貯めた分が無かったことになる（スタンプと同じ）。
    """
    if not learner_keys:
        return 0
    return XpEvent.objects.filter(learner_key__in=learner_keys).aggregate(
        total=Sum("amount")
    )["total"] or 0


def award(learner_key: uuid.UUID, kind: str, source_id: str) -> XpEvent | None:
    """XPを1件足す。同じ出来事なら2回目は何もしない。

    返すのは、実際に増えたときだけ。既にある（＝やり直し）なら None。
    ここで **黙って握りつぶす** のは、レッスンのやり直しが普通の操作
    だから。落として学習を止めるほどのことではない。

    書き込みはいつも「いまの端末の鍵」で行う。読むときに
    `readable_keys` で拾えるので、鍵が分かれていても合計は合う。
    """
    amount = XP_AMOUNTS.get(kind)
    if not amount:
        return None

    try:
        with transaction.atomic():
            return XpEvent.objects.create(
                learner_key=learner_key,
                kind=kind,
                source_id=source_id,
                amount=amount,
            )
    except IntegrityError:
        return None
