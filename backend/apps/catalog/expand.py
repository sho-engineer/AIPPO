"""DB の教材を、画面がそのまま食べられる形へ展開する。

画面（frontend/src/course/types.ts）の型に合わせて camelCase で出す。
ここで snake_case のまま出して受け取る側で詰め替えると、
詰め替えを忘れた項目が黙って消える。境目は1か所に閉じる。

**空の項目は落とす。**
以前は画面側の教材データが TypeScript の変数で、書かなかった項目は
そもそも存在しなかった。同じ形にしておかないと、
画面が「空文字が入っている」と「指定されていない」を区別できない
（例：`instruction: ""` を見出しの下に空行として描いてしまう）。
"""

from __future__ import annotations

from typing import Any

from apps.catalog.flow import build_lesson_flow
from apps.catalog.models import Lesson, LessonStep, LessonTemplate, StepPlacement


def drop_empty(entry: dict) -> dict:
    """指定されていない項目を落とす。**浅く**しか見ない。

    もとの教材は TypeScript の変数で、書かなかった項目はそもそも
    存在しなかった。同じ形にしないと、画面が「空文字が入っている」と
    「指定されていない」を区別できない。

    落とすのは None・空文字・空の配列・空の辞書だけ。
    False と 0 は残す（`required: false` と「指定なし」は別物）。

    中へは潜らない。選択肢の中の `{"value": "", "label": "そのほか"}` の
    ように、**空文字そのものに意味がある**場所があるため
    （潜って消すと「自分で条件を追加」の value が消えた）。
    """
    return {
        key: value
        for key, value in entry.items()
        if value is not None and value != "" and value != [] and value != {}
    }


def _flow_options(lesson: Lesson) -> dict[str, Any]:
    """Lesson の項目を、骨格が受け取る形へ移し替える。"""
    return {
        "aiAction": lesson.ai_action,
        "sampleText": lesson.sample_text,
        "quickTitle": lesson.quick_title,
        "quickInstruction": lesson.quick_instruction,
        "quickKey": lesson.quick_key,
        "quickOptions": lesson.quick_options,
        "quickDefaults": lesson.quick_defaults,
        "working": lesson.working,
        "observationOptions": lesson.observation_options,
        "conceptCards": lesson.concept_cards,
        "reviewPoints": lesson.review_points,
        "realTaskLabel": lesson.real_task_label,
        "realTaskPlaceholder": lesson.real_task_placeholder,
        "takeaway": lesson.takeaway,
        "nextSuggestion": lesson.next_suggestion,
        "factCheck": lesson.fact_check,
    }


def step_row_to_dict(row: LessonStep) -> dict[str, Any]:
    """ステップ行を、画面の形へ。"""
    return {
        "id": row.step_key,
        "type": row.step_type,
        "phase": row.phase,
        "title": row.title,
        "instruction": row.instruction,
        "poMessage": row.po_message,
        "poEmotion": row.po_emotion,
        "key": row.input_key,
        "options": row.options,
        "placeholder": row.placeholder,
        "example": row.example,
        "hints": row.hints,
        "validationRules": row.validation_rules,
        "aiAction": row.ai_action,
        "card": row.card,
        "meta": row.meta,
        "skill": row.skill,
        "required": row.is_required,
        "skippable": row.is_skippable,
    }


def _assemble(
    generated: list[dict[str, Any]], rows: list[LessonStep]
) -> list[dict[str, Any]]:
    """生成したステップへ、行を当てる／差し込む。

    上書きで当たるのは**空でない項目だけ**。空欄を「消す指示」と読むと、
    埋め忘れた項目が中身を消してしまう。消したいときは自由型にする。
    """
    overrides = {
        row.step_key: row for row in rows if row.placement == StepPlacement.OVERRIDE
    }
    lead_in = [row for row in rows if row.placement == StepPlacement.LEAD_IN]
    after_real = [
        row for row in rows if row.placement == StepPlacement.AFTER_REAL_TASK
    ]

    result = [drop_empty(step_row_to_dict(row)) for row in lead_in]

    for step in generated:
        row = overrides.get(step["id"])
        if row is not None:
            patch = {
                k: v
                for k, v in drop_empty(step_row_to_dict(row)).items()
                if k != "id"
            }
            step = {**step, **patch}
        result.append(drop_empty(step))

        # 「自分の文章」の直後に、その教材だけの問いを差し込む
        if step["id"] == "real_task":
            result.extend(drop_empty(step_row_to_dict(row)) for row in after_real)

    return result


def lesson_to_dict(lesson: Lesson, *, with_steps: bool = True) -> dict[str, Any]:
    """レッスン1本を、画面の形へ。

    近日公開の教材は、既定でステップを出さない。
    一覧に出すのに必要なのは見出しと成果物までで、中身まで配ると
    「取れているのだから始められるはず」という作りを画面側に許してしまう。
    """
    rows = list(lesson.steps.all()) if with_steps else []
    steps: list[dict[str, Any]] = []

    if not with_steps:
        pass
    elif lesson.template == LessonTemplate.CUSTOM:
        steps = [drop_empty(step_row_to_dict(row)) for row in rows]
    else:
        steps = _assemble(build_lesson_flow(_flow_options(lesson)), rows)

    # 空でも必ず出す鍵。画面の型が「必ずある」前提で読んでいる
    # （tags が無いと、診断からの推薦がその教材を素通りする）。
    payload: dict[str, Any] = {
        "id": lesson.slug,
        "number": lesson.number,
        "title": lesson.title,
        "goal": lesson.goal,
        "outcomes": lesson.outcomes,
        "tags": lesson.tags,
        "usesAi": lesson.uses_ai,
        # 始められるかは画面が必ず見る。無いと「近日公開」が始まってしまう
        "availability": lesson.availability_status,
        "steps": steps,
    }
    # 指定されたときだけ出す鍵
    payload.update(
        drop_empty(
            {
                "outcomeTitle": lesson.outcome_title,
                "outcomeDescription": lesson.outcome_description,
                "estimatedMinutes": lesson.estimated_minutes,
                "beforeExample": lesson.before_example,
                "afterExample": lesson.after_example,
                "learnedSkills": lesson.learned_skills,
                "thumbnail": lesson.thumbnail,
                "mode": lesson.mode,
                "plannedReleaseDate": (
                    lesson.planned_release_date.isoformat()
                    if lesson.planned_release_date
                    else None
                ),
                "comingSoonMessage": lesson.coming_soon_message,
            }
        )
    )
    return payload


def course_to_dict(course) -> dict[str, Any]:
    """コース1つを、画面の形へ。

    公開済みのレッスンだけを入れる。近日公開のものは一覧に**出す**が、
    ステップは配らない（始められないものの中身を先に渡さない）。
    """
    lessons = [
        lesson_to_dict(lesson, with_steps=lesson.is_startable)
        for lesson in course.lessons.filter(status="published").prefetch_related("steps")
    ]
    return {
        "id": course.slug,
        "title": course.title,
        "description": course.description,
        "difficulty": course.difficulty,
        # 出すことと始められることは別。画面はこの2つを見て、
        # 一覧に出しつつ開かせない、を実現する
        "availability": (
            "available" if course.is_startable else "coming_soon"
        ),
        "comingSoonMessage": course.coming_soon_message,
        "lessons": lessons,
    }
