"""いまどこにいて、次に何が要るか。

ここが持つ判断
--------------
Level・技・実践問題は別々のモデルに分かれている。**それらを突き合わせて
1つの答えにする**のがここ。画面（地図・レッスンの開始・完了・ホーム）は
どれも同じ問いを持つので、答えを1か所で作る。

    いまの段は？
    次の段に要る技は？ そのうち何をもう持っている？
    実践問題は受けられる？（技がそろっているか）
    あと何個で挑戦できる？

上がる条件は2つ、どちらも要る
-----------------------------
    1. その段に要る技を全部そろえる
    2. 昇段の実践問題を通る

片方だけで上がる形にすると、**こなした本数か、受けた回数**のどちらかが
Level の正体になる。集めただけでは上がらないし、問題だけ受けても
上がらない。

診断で始めた段は、飛ばした段として扱う
--------------------------------------
診断で Lv.3 と出た人に Lv.1・Lv.2 をやり直させない（仕様12）。ただし
**実際に取っていない技を「取った」ことにはしない**——地図では通り過ぎた
段として出し、技は未取得のまま置く。混ぜると、あとから「この人は
本当にこの技を使えるのか」が分からなくなる。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from apps.lessons.models import SkillProgress
from apps.rewards.models import (
    AippoLevel,
    AiSkill,
    LevelRequirement,
    UserLevel,
)

#: 診断も挑戦もまだの人が居る段。
FIRST_LEVEL = 1


@dataclass(frozen=True)
class SkillState:
    """1つの技の、その人にとっての状態。"""

    slug: str
    name: str
    one_line: str
    #: earned … 実際に取った
    #: locked … まだ取っていない
    status: str
    #: どのレッスンで取れるか。無ければ空（まだ教材が無い技）。
    lesson_ids: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class LevelState:
    """1つの段の、その人にとっての状態。地図の1区画になる。"""

    number: int
    name: str
    description: str
    #: done    … 通り過ぎた段（実際に上がった、または診断で飛ばした）
    #: current … いまここ
    #: locked  … まだ先
    status: str
    #: 診断で飛ばした段か。技を取ったわけではないことを、地図で言うため。
    skipped: bool
    #: この段へ上がるのに要る技と、その状態。
    skills: list[SkillState]
    #: そろっていない技の数。0 なら挑戦できる。
    remaining: int
    #: 昇段の実践問題があるか（まだ用意していない段は無い）。
    has_challenge: bool
    #: 挑戦できるか。技がそろっていて、かつ**いまの段の次**であること。
    challenge_open: bool


def current_level(learner_keys: list[UUID]) -> tuple[int, str]:
    """いまの段と、どうやってそこに居るか。

    まだ何も無ければ Lv.1。診断を受けていない人にも地図を見せるため、
    ここで空を返さない。
    """
    row = (
        UserLevel.objects.filter(learner_key__in=learner_keys)
        .order_by("-level_id")
        .first()
    )
    if row is None:
        return FIRST_LEVEL, UserLevel.ReachedBy.DIAGNOSIS
    return row.level_id, row.reached_by


def earned_skills(learner_keys: list[UUID]) -> set[str]:
    """実際に取った技の slug。"""
    return set(
        SkillProgress.objects.filter(learner_key__in=learner_keys).values_list(
            "skill_key", flat=True
        )
    )


def build_map(learner_keys: list[UUID]) -> list[LevelState]:
    """地図に出す、5段ぶんの状態。

    **段の数も要件も、ここで決め打たない。** 全部データから読む
    （`AippoLevel` / `LevelRequirement`）ので、段を足しても技を
    入れ替えても、ここは直さずに済む。
    """
    now, reached_by = current_level(learner_keys)
    earned = earned_skills(learner_keys)

    requirements = {
        requirement.level_id: requirement
        for requirement in LevelRequirement.objects.prefetch_related(
            "required_skills__lesson_links__lesson"
        )
    }
    challenges = set(
        AippoLevel.objects.filter(challenge__isnull=False).values_list(
            "number", flat=True
        )
    )

    states: list[LevelState] = []
    for level in AippoLevel.objects.all():
        requirement = requirements.get(level.number)
        skills = _skill_states(requirement, earned)
        remaining = sum(1 for one in skills if one.status != "earned")

        if level.number < now:
            status = "done"
        elif level.number == now:
            status = "current"
        else:
            status = "locked"

        states.append(
            LevelState(
                number=level.number,
                name=level.name,
                description=level.description,
                status=status,
                # 診断で始めた人の、通り過ぎた段
                skipped=(
                    level.number < now
                    and reached_by == UserLevel.ReachedBy.DIAGNOSIS
                ),
                skills=skills,
                remaining=remaining,
                has_challenge=level.number in challenges,
                # 挑戦できるのは、**いまの段のすぐ次**で、技がそろって
                # いるときだけ。先の段の問題を先取りできると、途中を
                # 飛ばして上がれてしまう。
                challenge_open=(
                    level.number == now + 1
                    and remaining == 0
                    and level.number in challenges
                ),
            )
        )
    return states


def _skill_states(
    requirement: LevelRequirement | None, earned: set[str]
) -> list[SkillState]:
    if requirement is None:
        return []
    states: list[SkillState] = []
    for skill in requirement.required_skills.all():
        states.append(
            SkillState(
                slug=skill.slug,
                name=skill.name,
                one_line=skill.one_line,
                status="earned" if skill.slug in earned else "locked",
                lesson_ids=[
                    link.lesson.slug for link in skill.lesson_links.all()
                ],
            )
        )
    return states


def next_level_state(learner_keys: list[UUID]) -> LevelState | None:
    """次の段。いちばん上に居れば None。

    ホームの1行とレッスンの開始画面が、どちらもこれを聞く——「あと
    何個で上がるか」は同じ数でないといけない。
    """
    now, _ = current_level(learner_keys)
    for state in build_map(learner_keys):
        if state.number == now + 1:
            return state
    return None


def start_from_diagnosis(learner_key: UUID, number: int) -> int:
    """診断の結果を、開始地点として記録する。いまの段を返す。

    **下げない。** 2回目の診断で前より低く出ても、いま居る段は
    動かさない——実践問題を通って上がった段を、あとから受け直した
    診断が取り消す形にすると、**やったことが消える**。

    技は付けない。飛ばした段の技は未取得のまま置く（`reached_by`）。
    """
    now, _ = current_level([learner_key])
    top = AippoLevel.objects.order_by("-number").values_list("number", flat=True).first()
    wanted = max(FIRST_LEVEL, min(number, top or FIRST_LEVEL))
    if wanted <= now and UserLevel.objects.filter(pk=learner_key).exists():
        return now

    UserLevel.objects.update_or_create(
        learner_key=learner_key,
        defaults={
            "level_id": wanted,
            "reached_by": UserLevel.ReachedBy.DIAGNOSIS,
        },
    )
    return wanted


def record_rankup(learner_key: UUID, number: int) -> None:
    """実践問題を通って上がったことを記録する。

    呼ぶ前に、**技がそろっていることと、すぐ次の段であること**を
    確かめる（`LevelState.challenge_open`）。ここでは確かめない——
    確かめる場所を2つに分けると、片方だけ直した日に抜ける。
    """
    UserLevel.objects.update_or_create(
        learner_key=learner_key,
        defaults={"level_id": number, "reached_by": UserLevel.ReachedBy.RANKUP},
    )


def skill_for_lesson(lesson_slug: str) -> AiSkill | None:
    """そのレッスンで身につく技。無ければ None。

    レッスンの開始画面が「今回身につける Skill」を出すのに使う。
    1本に複数ひも付いていることもあるので、並び順の先頭を取る。
    """
    return (
        AiSkill.objects.filter(lesson_links__lesson__slug=lesson_slug)
        .order_by("lesson_links__order", "order")
        .first()
    )
