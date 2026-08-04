"""いまコードにある9教材を DB へ取り込む。

    uv run python manage.py seed_catalog

何度実行しても同じ結果になる（slug で突き合わせて上書きする）。
すでに管理画面で直した教材を、実行のたびに巻き戻さないよう
`--only-new` を付ければ、無い教材だけを足す。

取り込み元は `apps/catalog/seed_catalog.json`。
これは画面側の教材（TypeScript）をそのまま書き出したもので、
「移す前と1文字も変わっていない」ことを確かめる正解データでもある
（tests/test_catalog_parity.py）。

骨格から組み立てられる教材（レッスン1〜6・最終課題）は、
19行のステップとしてではなく**パラメータとして**入れる。
ステップを行で持つと7教材で133行になり、流れを直すたびに全部を直すことになる。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.catalog.models import (
    AccessType,
    AvailabilityStatus,
    Course,
    Lesson,
    LessonStep,
    LessonTemplate,
    PublishStatus,
    StepPlacement,
)

SEED_PATH = Path(__file__).resolve().parents[2] / "seed_catalog.json"

#: 第一リリース（Closed Beta）で始められる教材。
#: これ以外は一覧に出すが「近日公開」で止める。
#: 増やすときは管理画面で availability_status を変える（ここは初期値だけ）。
RELEASE_AVAILABLE = ("diagnosis", "rewrite_text")

#: 骨格で組み立てた教材かどうかの見分け方。
#: 先頭とは限らない（最終課題は前置きを6つ置いてから骨格へ入る）ので、
#: 並びの中に骨格の頭があるかどうかで見る。
_FLOW_HEAD = ("outcome_preview", "quick_try", "generate_first", "observe_result")


def _flow_start(lesson: dict[str, Any]) -> int | None:
    """骨格が始まる位置。骨格を使っていなければ None。"""
    ids = [step["id"] for step in lesson["steps"]]
    for index in range(len(ids) - len(_FLOW_HEAD) + 1):
        if tuple(ids[index : index + len(_FLOW_HEAD)]) == _FLOW_HEAD:
            return index
    return None


def _flow_params(lesson: dict[str, Any]) -> dict[str, Any]:
    """組み上がったステップから、骨格のパラメータを取り出す。

    書き出した JSON には展開後の形しか無いので、逆にたどる。
    取り込みは1度きりなので、ここが多少泥臭くても構わない。
    """
    steps = {step["id"]: step for step in lesson["steps"]}
    quick = steps["quick_try"]
    observe = steps["observe_result"]
    real_task = steps.get("real_task", {})
    compare = steps.get("compare_results", {})

    cards = [
        steps[f"concept_{i}"]["card"]
        for i in (1, 2, 3)
        if f"concept_{i}" in steps and "card" in steps[f"concept_{i}"]
    ]

    review = compare.get("meta", {})

    return {
        "ai_action": quick.get("aiAction", {}),
        "sample_text": quick.get("meta", {}).get("sampleText", ""),
        "quick_title": quick.get("title", ""),
        "quick_instruction": quick.get("instruction", ""),
        "quick_key": quick.get("key", ""),
        "quick_options": quick.get("options", []),
        "quick_defaults": quick.get("meta", {}).get("defaults", {}),
        "working": steps.get("generate_first", {}).get("instruction", ""),
        "observation_options": observe.get("options", []),
        "concept_cards": cards,
        "review_points": review.get("reviewPoints", []),
        "real_task_label": real_task.get("instruction", ""),
        "real_task_placeholder": real_task.get("placeholder", ""),
        "takeaway": steps.get("reflection", {}).get("poMessage", ""),
        "next_suggestion": steps.get("completion", {}).get("poMessage", ""),
        "fact_check": bool(review.get("factCheck", False)),
    }


#: 骨格が自分で作るステップ。これ以外は行として残す。
_GENERATED = frozenset({
    "outcome_preview", "quick_try", "generate_first", "observe_result",
    "concept_1", "concept_2", "concept_3", "add_condition", "generate_improved",
    "compare_results", "real_task_intro", "real_task", "prompt_preview",
    "generate_real", "real_task_result", "reflection", "completion",
})


def _rows(lesson: dict[str, Any], flow_start: int | None) -> list[dict[str, Any]]:
    """ステップを行にする。

    自由型はすべての行を作る。
    骨格型は、骨格が作らないものだけを行にする
    （骨格より前にあれば前置き、あとにあれば「自分の文章」の直後）。
    """
    rows = []
    for order, step in enumerate(lesson["steps"]):
        if flow_start is not None and step["id"] in _GENERATED:
            continue

        if flow_start is None:
            placement = StepPlacement.OVERRIDE
        elif order < flow_start:
            placement = StepPlacement.LEAD_IN
        else:
            placement = StepPlacement.AFTER_REAL_TASK

        rows.append(
            {
                "placement": placement,
                "step_key": step["id"],
                "step_type": step.get("type", ""),
                "phase": step.get("phase", ""),
                "title": step.get("title", ""),
                "instruction": step.get("instruction", ""),
                "po_message": step.get("poMessage", ""),
                "po_emotion": step.get("poEmotion", ""),
                "input_key": step.get("key", ""),
                "options": step.get("options", []),
                "placeholder": step.get("placeholder", ""),
                "example": step.get("example", ""),
                "hints": step.get("hints", []),
                "validation_rules": step.get("validationRules", {}),
                "ai_action": step.get("aiAction", {}),
                "card": step.get("card", {}),
                "meta": step.get("meta", {}),
                "skill": step.get("skill", ""),
                "is_required": step.get("required"),
                "is_skippable": step.get("skippable"),
                "sort_order": order,
            }
        )
    return rows


class Command(BaseCommand):
    help = "コードにある教材を DB へ取り込む（何度実行してもよい）"

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--only-new",
            action="store_true",
            help="すでにある教材には触らない（管理画面での修正を守る）",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        data = json.loads(SEED_PATH.read_text(encoding="utf-8"))
        only_new = options["only_new"]

        course, created = Course.objects.get_or_create(
            slug=data["id"],
            defaults={
                "title": data["title"],
                "description": data["description"],
                "access_type": AccessType.FREE,
                "status": PublishStatus.PUBLISHED,
            },
        )
        if not created and not only_new:
            course.title = data["title"]
            course.description = data["description"]
            course.status = PublishStatus.PUBLISHED
            course.save()

        added = skipped = updated = 0

        for order, entry in enumerate(data["lessons"]):
            exists = Lesson.objects.filter(slug=entry["id"]).exists()
            if exists and only_new:
                skipped += 1
                continue

            flow_start = _flow_start(entry)
            is_flow = flow_start is not None
            fields: dict[str, Any] = {
                "course": course,
                "number": entry["number"],
                "title": entry["title"],
                "goal": entry["goal"],
                "template": (
                    LessonTemplate.OUTCOME_FIRST if is_flow else LessonTemplate.CUSTOM
                ),
                "outcome_title": entry.get("outcomeTitle", ""),
                "outcome_description": entry.get("outcomeDescription", ""),
                "estimated_minutes": entry.get("estimatedMinutes"),
                "before_example": entry.get("beforeExample", ""),
                "after_example": entry.get("afterExample", ""),
                "learned_skills": entry.get("learnedSkills", []),
                "outcomes": entry.get("outcomes", []),
                "tags": entry.get("tags", []),
                "uses_ai": entry.get("usesAi", True),
                "mode": entry.get("mode", ""),
                "status": PublishStatus.PUBLISHED,
                "availability_status": (
                    AvailabilityStatus.AVAILABLE
                    if entry["id"] in RELEASE_AVAILABLE
                    else AvailabilityStatus.COMING_SOON
                ),
                "sort_order": order,
            }
            if is_flow:
                fields.update(_flow_params(entry))

            lesson, made = Lesson.objects.update_or_create(
                slug=entry["id"], defaults=fields
            )
            lesson.mark_published()
            lesson.save(update_fields=["status", "published_at"])

            # 行は入れ直す。骨格が作るぶんは行にしない
            lesson.steps.all().delete()
            LessonStep.objects.bulk_create(
                LessonStep(lesson=lesson, **row) for row in _rows(entry, flow_start)
            )

            if made:
                added += 1
            else:
                updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"コース「{course.title}」: 追加 {added} / 更新 {updated} / 触れず {skipped}"
            )
        )
