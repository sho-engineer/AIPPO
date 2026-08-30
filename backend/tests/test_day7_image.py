"""Day7「AIで画像を作る」の受け入れ先が、先に揃っていること。

このレッスンは**まだ開けない。**仕組みが無いからではなく、費用の
見通しを先に立てるため（docs/image-lessons.md）。画像1枚は文章1回の
数十倍かかり、レッスン1本で最低2枚生成する。

だから本文とステップだけ先に揃えてある。ここで見張るのは2つ。

  1. 閉じたままであること——うっかり開いて費用が読めなくならない
  2. 残っている仕事が**画像を作る口の1つだけ**であること

2つ目が肝心。「あとは何が要るんだっけ」を人の記憶に置かない。
公開の検査（catalog/validation.py）に言わせて、それがAIの頼み方の
話だけになっているかを、ここで確かめる。
"""

from __future__ import annotations

import pytest
from django.core.management import call_command

from apps.catalog.expand import course_to_dict, lesson_to_dict
from apps.catalog.models import AvailabilityStatus, Lesson, LessonTemplate
from apps.catalog.validation import validate_for_release

SLUG = "image_generation"


@pytest.fixture
def lesson(db):
    call_command("seed_catalog", verbosity=0)
    return Lesson.objects.get(slug=SLUG)


@pytest.fixture
def steps(lesson):
    """中身を見るために、その場だけ開ける（保存はしない）。

    近日公開の教材はステップを配らないので、こうしないと
    組み上がった並びが見られない。
    """
    lesson.availability_status = AvailabilityStatus.AVAILABLE
    return lesson_to_dict(lesson)["steps"]


@pytest.mark.django_db
class TestItStaysClosed:
    def test_it_is_still_coming_soon(self, lesson):
        assert lesson.availability_status == AvailabilityStatus.COMING_SOON
        assert lesson.coming_soon_message

    def test_it_does_not_ship_steps_while_closed(self, lesson):
        """閉じているあいだは中身を配らない。

        取れてしまうと「始められるはず」に見える。配るかどうかを
        決めているのはコースを組み立てるほう（`course_to_dict` が
        `with_steps=lesson.is_startable` を渡す）なので、レッスン単体
        ではなく**画面へ出る形**で確かめる。
        """
        assert not lesson.is_startable

        payload = course_to_dict(lesson.course)
        entry = next(one for one in payload["lessons"] if one["id"] == SLUG)
        assert entry["steps"] == []

    def test_the_only_thing_left_is_the_image_call(self, lesson):
        """開けない理由が、AIの頼み方だけに絞られていること。

        本文・並び・完了まで揃っているなら、検査が返すのは
        「AIへの頼み方がありません」だけになる。ほかの指摘が混じったら、
        それは**書き忘れ**であって費用の話ではない。
        """
        lesson.availability_status = AvailabilityStatus.AVAILABLE
        problems = validate_for_release(lesson)

        assert problems, "開けない理由が無い。ならば閉じている意味が無い"
        assert all("AI" in one and "頼み方" in one for one in problems), problems

    def test_it_does_not_name_an_action_that_does_not_exist(self, lesson):
        # それらしい名前を置くと「あるのに動かない」に見え、検査も素通りする
        assert lesson.ai_action.get("action") == ""


@pytest.mark.django_db
class TestTheBodyIsWritten:
    def test_it_is_not_the_shared_filler(self, steps):
        titles = [
            step["card"]["title"] for step in steps if step["type"] == "concept_card"
        ]
        assert "目的を先に伝える" not in titles
        assert "形も指定する" not in titles

    def test_it_uses_the_skeleton(self, lesson):
        # 画像でも骨格は変えない（docs/image-lessons.md）
        assert lesson.template == LessonTemplate.OUTCOME_FIRST

    def test_the_skills_it_promises_are_the_ones_it_teaches(self, lesson, steps):
        assert lesson.learned_skills == [
            "画像プロンプト",
            "スタイル指定",
            "構図指定",
            "反復",
        ]
        taught = {
            step["card"]["title"] for step in steps if step["type"] == "concept_card"
        }
        assert taught == {
            "画像プロンプト",
            "スタイル指定",
            "構図指定",
            "反復（Iteration）",
        }

    def test_it_asks_for_a_picture_not_a_piece_of_writing(self, steps):
        for step_id in ("real_task_intro", "real_task", "real_task_result"):
            step = next(one for one in steps if one["id"] == step_id)
            assert "文章" not in step.get("title", ""), step_id


@pytest.mark.django_db
class TestTheOrder:
    def test_the_comparison_comes_after_adding_a_condition(self, steps):
        order = [step["id"] for step in steps]
        # concept_1 はここに入れない。**解説は比べたあとに来る**ので、
        # 「比べるより前にあること」を求めると順序が逆に固定される
        for earlier in ("quick_try", "add_condition", "generate_improved"):
            assert order.index("compare_results") > order.index(earlier)

    def test_no_two_slides_in_a_row(self, steps):
        order = [step["id"] for step in steps]
        slides = [
            index
            for index, step in enumerate(steps)
            if step["type"] == "concept_card"
        ]
        for first, second in zip(slides, slides[1:], strict=False):
            assert second - first > 1, f"{order[first]} と {order[second]} が隣り合っている"

    def test_each_skill_sits_right_before_the_screen_that_uses_it(self, steps):
        order = [step["id"] for step in steps]
        assert order.index("real_style") - order.index("concept_style") == 1
        assert order.index("real_composition") - order.index("concept_composition") == 1
        # 反復は送る直前。「一度で完璧を目指さなくていい」が効く場所
        assert order.index("prompt_preview") - order.index("concept_iteration") == 1

    def test_adding_a_condition_is_about_pictures(self, steps):
        """骨格の既定（もっと短く・もっと丁寧に）は画像に当たらない。"""
        step = next(one for one in steps if one["id"] == "add_condition")
        labels = [one["label"] for one in step["options"]]

        assert "もっと丁寧に" not in labels
        assert "やわらかく" not in labels
        assert any("雰囲気" in one or "スタイル" in one for one in labels)
