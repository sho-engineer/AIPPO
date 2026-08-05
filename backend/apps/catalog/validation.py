"""教材を「始められる」にしてよいかの検査。

管理画面から公開するとき、ここを通す。
不備があれば available へ変えさせない。

なぜ止めるのか
--------------
書きかけの教材が学習者に届いたとき、いちばん困るのは
「途中で進めなくなる」こと。押しても動かない画面に当たった人は、
自分の操作を疑い、そのまま閉じる。戻ってこない。

公開ボタンを押した人がその場で気づけるほうが、はるかに安い。

検査は**厳しすぎない**ようにしてある。ここで細かく縛ると、
教材を書く人が管理画面を嫌って、またコードへ戻ってしまう。
見るのは「学習者が行き止まりに当たるかどうか」だけ。
"""

from __future__ import annotations

from collections import Counter

from apps.catalog.expand import lesson_to_dict
from apps.catalog.models import Lesson, LessonTemplate

#: AI を呼ぶステップの種類。ここには必ず頼み方が要る。
_AI_STEP_TYPES = frozenset({"ai_generate", "quick_try", "condition_choice"})

#: 始まりと終わりに置けるステップ。
_OPENING_TYPES = frozenset({"intro", "outcome_preview"})
_CLOSING_TYPE = "completion"


def validate_for_release(lesson: Lesson) -> list[str]:
    """公開してよいかを調べ、直すべきことを日本語で返す。

    空のリストが返れば公開してよい。
    文言は管理画面にそのまま出るので、何を直せばよいかまで書く。
    """
    problems: list[str] = []

    if not lesson.title.strip():
        problems.append("タイトルが空です。")

    if not (lesson.outcome_title.strip() or lesson.goal.strip()):
        problems.append(
            "完成する成果物が書かれていません（「今日つくるもの」か「ねらい」を埋めてください）。"
        )

    # 実際に組み上げた並びで見る。骨格型は行が少なくてもステップは出来る
    try:
        steps = lesson_to_dict(lesson)["steps"]
    except Exception as exc:  # noqa: BLE001 - 何が起きても公開は止める
        return problems + [f"ステップを組み立てられませんでした（{exc}）。"]

    if not steps:
        problems.append("ステップが1つもありません。")
        return problems

    if steps[0].get("type") not in _OPENING_TYPES:
        problems.append(
            "最初のステップが始まりの形になっていません"
            "（intro か outcome_preview にしてください）。"
        )

    if not any(step.get("type") == _CLOSING_TYPE for step in steps):
        problems.append("完了のステップ（completion）がありません。")

    duplicates = [
        key for key, count in Counter(step["id"] for step in steps).items() if count > 1
    ]
    if duplicates:
        problems.append(
            f"ステップの名前が重複しています：{ '、'.join(sorted(duplicates)) }"
        )

    for step in steps:
        if step.get("type") in _AI_STEP_TYPES and not step.get("aiAction", {}).get(
            "action"
        ):
            problems.append(
                f"AIを使うステップ「{step['id']}」に、AIへの頼み方がありません。"
            )

    problems.extend(_check_flow_parameters(lesson))
    problems.extend(_check_step_order(lesson))

    return problems


def _check_flow_parameters(lesson: Lesson) -> list[str]:
    """骨格型のとき、骨格が要る材料が揃っているか。"""
    if lesson.template != LessonTemplate.OUTCOME_FIRST:
        return []

    problems = []
    if not lesson.quick_title.strip():
        problems.append("最初に選ばせる問い（quick_title）が空です。")
    if not lesson.quick_options:
        problems.append("最初に選ばせる選択肢がありません。")
    if not lesson.sample_text.strip():
        problems.append(
            "例文がありません。空欄から始めさせないため、成果物ファーストの教材には必ず要ります。"
        )
    if not lesson.ai_action.get("action"):
        problems.append("AIへの頼み方（ai_action の action）が空です。")
    return problems


def _check_step_order(lesson: Lesson) -> list[str]:
    """並び順が壊れていないか。

    同じ並び順が2つ以上あると、表示の順が実行のたびに入れ替わる。
    見た目には気づけず、学習者だけが違う順で進むことになる。
    """
    orders = [row.sort_order for row in lesson.steps.all()]
    duplicated = [order for order, count in Counter(orders).items() if count > 1]
    if duplicated:
        return [
            "ステップの並び順が重複しています："
            + "、".join(str(order) for order in sorted(duplicated))
        ]
    return []
