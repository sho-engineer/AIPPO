"""Day8「画像を修正する」の受け入れ先が、先に揃っていること。

Day7 と対の教材で、閉じている理由も同じ（docs/image-lessons.md）。
見張ることも同じ——閉じたままであることと、**残りが画像を作る口の
1つだけ**であること。

このレッスンだけの事情がひとつある。比べる図が2枚あるのに、骨格が
作る比べる画面は1つしかない。2枚目を置く場所（`concept_partial_result`）
が消えていないかを、ここで見張る。
"""

from __future__ import annotations

import pytest
from django.core.management import call_command

from apps.catalog.expand import course_to_dict, lesson_to_dict
from apps.catalog.models import AvailabilityStatus, Lesson, LessonTemplate
from apps.catalog.validation import validate_for_release

SLUG = "image_edit"


@pytest.fixture
def lesson(db):
    call_command("seed_catalog", verbosity=0)
    return Lesson.objects.get(slug=SLUG)


@pytest.fixture
def steps(lesson):
    """中身を見るために、その場だけ開ける（保存はしない）。"""
    lesson.availability_status = AvailabilityStatus.AVAILABLE
    return lesson_to_dict(lesson)["steps"]


@pytest.mark.django_db
class TestItStaysClosed:
    def test_it_is_still_coming_soon(self, lesson):
        assert lesson.availability_status == AvailabilityStatus.COMING_SOON
        assert lesson.coming_soon_message

    def test_it_does_not_ship_steps_while_closed(self, lesson):
        assert not lesson.is_startable

        payload = course_to_dict(lesson.course)
        entry = next(one for one in payload["lessons"] if one["id"] == SLUG)
        assert entry["steps"] == []

    def test_the_only_thing_left_is_the_image_call(self, lesson):
        lesson.availability_status = AvailabilityStatus.AVAILABLE
        problems = validate_for_release(lesson)

        assert problems, "開けない理由が無い。ならば閉じている意味が無い"
        assert all("AI" in one and "頼み方" in one for one in problems), problems

    def test_it_does_not_name_an_action_that_does_not_exist(self, lesson):
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
        assert lesson.learned_skills == ["画像編集指示", "部分修正", "反復"]

        taught = {
            step["card"]["title"] for step in steps if step["type"] == "concept_card"
        }
        # 「ほかは残せる」は技ではなく、部分修正の効きめを見せる1枚
        assert {"画像編集指示", "部分修正", "反復（Iteration）"} <= taught

    def test_it_asks_for_a_picture_not_a_piece_of_writing(self, steps):
        for step_id in ("real_task_intro", "real_task", "real_task_result"):
            step = next(one for one in steps if one["id"] == step_id)
            assert "文章" not in step.get("title", ""), step_id


@pytest.mark.django_db
class TestTheOrder:
    def test_the_second_comparison_has_a_home(self, steps):
        """比べる図の2枚目を置く一歩が消えていないこと。

        骨格が作る比べる画面は1つだけ。2枚目は部分修正を使った
        すぐ後に置きたいので、専用の一歩を差し込んである。
        ここが消えると、絵は表に残ったまま**出る場所が無くなる**。
        """
        order = [step["id"] for step in steps]
        assert order.index("concept_partial_result") - order.index("real_area") == 1

    def test_where_to_fix_and_how_to_fix_are_asked_apart(self, steps):
        """箇所と変え方は別のこと。1画面で2つ判断させない。"""
        order = [step["id"] for step in steps]
        assert order.index("real_instruction") > order.index("real_area")

    def test_no_two_slides_in_a_row(self, steps):
        order = [step["id"] for step in steps]
        slides = [
            index for index, step in enumerate(steps) if step["type"] == "concept_card"
        ]
        for first, second in zip(slides, slides[1:], strict=False):
            assert second - first > 1, f"{order[first]} と {order[second]} が隣り合っている"

    def test_each_skill_sits_right_before_the_screen_that_uses_it(self, steps):
        order = [step["id"] for step in steps]
        assert order.index("real_area") - order.index("concept_partial") == 1
        # 反復は送る直前。「一度で完璧を目指さなくていい」が効く場所
        assert order.index("prompt_preview") - order.index("concept_iteration") == 1

    def test_adding_a_condition_is_about_pictures(self, steps):
        step = next(one for one in steps if one["id"] == "add_condition")
        labels = [one["label"] for one in step["options"]]

        assert "もっと丁寧に" not in labels
        assert "やわらかく" not in labels
        assert any("夕焼け" in one or "消す" in one for one in labels)

    def test_nothing_required_is_answered_by_a_leftover_default(self, steps):
        quick = next(step for step in steps if step["id"] == "quick_try")
        defaults = quick["meta"]["defaults"]

        for step in steps:
            if step["id"] == "quick_try" or not step.get("required"):
                continue
            key = step.get("key")
            if not key or key not in defaults:
                continue
            values = [one["value"] for one in step.get("options", [])]
            assert defaults[key] in values, (
                f"{step['id']} は「{defaults[key]}」が先に入るのに、"
                "それが選択肢に無い"
            )
