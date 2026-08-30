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

#: これから増えるコース（中身はまだ無い）。
#:
#: `seed_catalog.json` とは別のファイルにしてある。あちらは
#: 「コードからDBへ移して1文字も変わっていない」ことを確かめる正解データで、
#: 増やすとその役目が薄れる。増えるものはこちらへ書く。
UPCOMING_PATH = Path(__file__).resolve().parents[2] / "seed_upcoming.json"

#: 取り込んだ時点で「近日公開」にしておく教材。
#:
#: 以前はここが逆で、始められるものを列挙していた
#: （第一リリースでは診断と文章改善の2本だけを開けていた）。
#: 教材9本の中身が揃った今、閉じておく理由はもう無い。
#:
#: 空でも仕組みは残る。管理画面から availability_status を
#: 「近日公開」へ戻せば、一覧に出したまま開始を止められる
#: （止める本体は apps/catalog/access.py）。
#: 未完成の教材を足すときは、ここに slug を並べる。
RELEASE_COMING_SOON: tuple[str, ...] = ()

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

    concepts = [
        steps[f"concept_{i}"]
        for i in (1, 2, 3)
        if f"concept_{i}" in steps and "card" in steps[f"concept_{i}"]
    ]
    cards = [step["card"] for step in concepts]
    # その解説で覚える技の名前。並びはカードと同じ
    skills = [step.get("skill", "") for step in concepts]

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
        "condition_options": steps.get("add_condition", {}).get("options", []),
        "concept_cards": cards,
        "concept_skills": skills,
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
    骨格型は、骨格が作らないものだけを行にする。置き場所は
    **教材の中での位置から決める**——書いてある順が正しい順なので、
    そこを読み替えない。

        骨格より前          … 前置き（lead_in）
        「自分の文章」より前 … 技を深める回（deepen）
        「自分の文章」より後 … その直後（after_real_task）

    前は最後の2つを分けておらず、骨格より後ろなら何でも
    「自分の文章の直後」にしていた。教材で前に置いても後ろへ回るので、
    **並べ替えても並びが変わらない**——直したつもりで直っていない。
    """
    rows = []
    own_text_at = next(
        (i for i, step in enumerate(lesson["steps"]) if step["id"] == "real_task"),
        None,
    )

    for order, step in enumerate(lesson["steps"]):
        if flow_start is not None and step["id"] in _GENERATED:
            continue

        if flow_start is None:
            placement = StepPlacement.OVERRIDE
        elif order < flow_start:
            placement = StepPlacement.LEAD_IN
        elif own_text_at is not None and order < own_text_at:
            placement = StepPlacement.DEEPEN
        else:
            placement = StepPlacement.AFTER_REAL_TASK

        rows.append(
            {
                "placement": placement,
                "step_key": step["id"],
                "step_type": step.get("type", ""),
                "phase": step.get("phase", ""),
                "title": step.get("title", ""),
                "primary_label": step.get("primaryLabel", ""),
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
                "thumbnail": entry.get("thumbnail", ""),
                "uses_ai": entry.get("usesAi", True),
                "mode": entry.get("mode", ""),
                "status": PublishStatus.PUBLISHED,
                "availability_status": (
                    AvailabilityStatus.COMING_SOON
                    if entry["id"] in RELEASE_COMING_SOON
                    else AvailabilityStatus.AVAILABLE
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

        self._seed_upcoming(only_new)

    def _seed_upcoming(self, only_new: bool) -> None:
        """これから増えるコースを、近日公開として入れる。

        中身（ステップ）は入れない。入れると「取れているのだから
        始められる」作りが画面側にできてしまう。ここで入れるのは
        一覧のカードに出す分——題・説明・難易度・レッスンの並び——だけ。

        すでにあるコースの `availability_status` は**触らない**。
        管理画面で開けたものを、実行のたびに閉じ直さないため。
        """
        if not UPCOMING_PATH.exists():
            return

        data = json.loads(UPCOMING_PATH.read_text(encoding="utf-8"))
        courses = 0
        lessons = 0

        for entry in data.get("courses", []):
            course, created = Course.objects.get_or_create(
                slug=entry["id"],
                defaults={
                    "title": entry["title"],
                    "description": entry.get("description", ""),
                    "difficulty": entry.get("difficulty", "beginner"),
                    "access_type": AccessType.FREE,
                    "status": PublishStatus.PUBLISHED,
                    "availability_status": AvailabilityStatus.COMING_SOON,
                    "coming_soon_message": entry.get("comingSoonMessage", ""),
                    "sort_order": entry.get("sortOrder", 0),
                },
            )
            if not created:
                if only_new:
                    continue
                course.title = entry["title"]
                course.description = entry.get("description", "")
                course.difficulty = entry.get("difficulty", "beginner")
                course.status = PublishStatus.PUBLISHED
                course.coming_soon_message = entry.get("comingSoonMessage", "")
                course.sort_order = entry.get("sortOrder", 0)
                # availability_status は入れない（上の説明のとおり）
                course.save()
            courses += 1

            for order, row in enumerate(entry.get("lessons", [])):
                if Lesson.objects.filter(slug=row["id"]).exists() and only_new:
                    continue
                Lesson.objects.update_or_create(
                    slug=row["id"],
                    defaults={
                        "course": course,
                        "number": row["number"],
                        "title": row["title"],
                        "goal": row["goal"],
                        "template": LessonTemplate.CUSTOM,
                        "estimated_minutes": row.get("estimatedMinutes"),
                        "outcomes": row.get("outcomes", []),
                        "tags": row.get("tags", []),
                        "thumbnail": row.get("thumbnail", ""),
                        "uses_ai": row.get("usesAi", True),
                        "status": PublishStatus.PUBLISHED,
                        "availability_status": AvailabilityStatus.COMING_SOON,
                        "sort_order": order,
                    },
                )
                lessons += 1

        if courses:
            self.stdout.write(
                self.style.SUCCESS(
                    f"これから増えるコース: {courses}件 / レッスン {lessons}件（近日公開）"
                )
            )

        from apps.catalog.release_seeding import seed_first_release

        start, practical = seed_first_release(only_new=only_new)
        self.stdout.write(
            self.style.SUCCESS(
                f"第1リリース: {start.title} / {practical.title}"
            )
        )
        self._seed_rewards()

    def _seed_rewards(self) -> None:
        """学習パス・スタンプ・節目の特典・AI単価も、ここで揃える。

        新しい環境は `migrate → seed_catalog` の順に立ち上がるので、
        マイグレーションの時点では**コースもレッスンもまだ無い**。
        そこで作ろうとしても相手がいないため、教材を入れ終わった
        ここから呼ぶ（apps/rewards/seeding.py に理由を書いた）。

        これを忘れると、スタンプ定義が1件も無いまま動きはじめる。
        エラーは出ず、ただスタンプが永久に埋まらない——いちばん
        気づきにくい壊れ方になる。
        """
        from apps.rewards.seeding import seed_rewards

        path, pricing_made = seed_rewards()
        if path is not None:
            self.stdout.write(
                self.style.SUCCESS(
                    f"学習パス「{path.title}」: "
                    f"スタンプ {path.stamp_definitions.count()} / "
                    f"節目 {path.milestones.count()} / "
                    f"AI単価 追加 {pricing_made}"
                )
            )
