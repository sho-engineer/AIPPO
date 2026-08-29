"""Day6「情報を整理して見やすくする」が、教材として成り立っていること。

Day4 と同じ理由でここに置く。この教材も長いあいだ骨格の**埋め草**の
まま並んでいて、解説カードは隣のレッスンと1文字も同じだった。埋め草は
どのレッスンでも同じ文なので、**1本だけ直してもどのテストも落ちない。**

このレッスン固有で見張るのはもう1つ。**分けると見やすくなること**を
前後の差で見せる回なので、最初の1回で見出しを先に埋めてしまうと
図が言っていることが画面で起きない。
"""

from __future__ import annotations

import pytest
from django.core.management import call_command

from apps.ai.actions import get_action
from apps.catalog.expand import lesson_to_dict
from apps.catalog.models import Lesson

SLUG = "organize_information"


@pytest.fixture
def day6(db):
    call_command("seed_catalog", verbosity=0)
    return lesson_to_dict(Lesson.objects.get(slug=SLUG))


@pytest.fixture
def order(day6):
    return [step["id"] for step in day6["steps"]]


@pytest.mark.django_db
class TestDay6IsWritten:
    def test_it_is_not_the_shared_filler_any_more(self, day6):
        titles = [
            step["card"]["title"]
            for step in day6["steps"]
            if step["type"] == "concept_card"
        ]
        assert "目的を先に伝える" not in titles
        assert "形も指定する" not in titles

        quick = next(step for step in day6["steps"] if step["id"] == "quick_try")
        assert quick["title"] != "まず、使う場面を1つ選びます"

    def test_the_skills_it_promises_are_the_ones_it_teaches(self, day6):
        lesson = Lesson.objects.get(slug=SLUG)
        assert lesson.learned_skills == ["情報整理", "分類", "出力形式の指定"]

        taught = {
            step["card"]["title"]
            for step in day6["steps"]
            if step["type"] == "concept_card"
        }
        assert taught == {"情報整理", "分類", "出力形式の指定"}

    def test_it_asks_for_notes_not_a_piece_of_writing(self, day6):
        """画面が「文章」と言い、絵が「メモ」と言う、を残さない。"""
        for step_id in ("real_task_intro", "real_task", "real_task_result"):
            step = next(one for one in day6["steps"] if one["id"] == step_id)
            assert "文章" not in step.get("title", ""), step_id


@pytest.mark.django_db
class TestTheFirstTryHasNoHeadings:
    def test_the_headings_are_not_filled_in_advance(self, day6):
        """最初の1回は見出しを決めずに通す。

        埋めてしまうと、次の「分け方を足す」で何も変わらない。
        分けると見やすくなることを差で見せる回なので、そこが肝心。
        """
        quick = next(step for step in day6["steps"] if step["id"] == "quick_try")
        assert "categories" not in quick["meta"]["defaults"]

    def test_the_action_allows_an_empty_heading(self):
        # 空で通らないと、最初の1回がそもそも 400 で止まる
        field = next(
            one for one in get_action("organize").fields if one.key == "categories"
        )
        assert field.required is False


@pytest.mark.django_db
class TestTheOrder:
    def test_the_comparison_comes_after_adding_a_condition(self, order):
        for earlier in ("quick_try", "concept_1", "add_condition", "generate_improved"):
            assert order.index("compare_results") > order.index(earlier)

    def test_a_hands_on_screen_sits_between_the_slide_and_the_comparison(self, order):
        between = order[order.index("concept_1") + 1 : order.index("compare_results")]
        assert "add_condition" in between

    def test_no_two_slides_in_a_row(self, day6, order):
        slides = [
            index
            for index, step in enumerate(day6["steps"])
            if step["type"] == "concept_card"
        ]
        for first, second in zip(slides, slides[1:], strict=False):
            assert second - first > 1, f"{order[first]} と {order[second]} が隣り合っている"

    def test_each_skill_sits_right_before_the_screen_that_uses_it(self, order):
        assert order.index("real_categories") - order.index("concept_classification") == 1
        assert order.index("real_format") - order.index("concept_output_format") == 1


@pytest.mark.django_db
class TestItActuallyReachesTheAi:
    def test_the_chosen_headings_and_format_are_sent(self, day6):
        sends = next(step for step in day6["steps"] if step["id"] == "generate_real")
        inputs = sends["aiAction"]["inputs"]
        assert inputs["categories"] == "categories"
        assert inputs["format"] == "format"

    def test_nothing_required_is_answered_by_a_leftover_default(self, day6):
        """必ず答える質問に、選択肢に無い既定値が先に入っていないこと。

        入っていると、札はどれも選ばれていないのに空ではないので、
        選ばずに次へ進めてしまう。
        """
        quick = next(step for step in day6["steps"] if step["id"] == "quick_try")
        defaults = quick["meta"]["defaults"]

        for step in day6["steps"]:
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


@pytest.mark.django_db
class TestAddingAConditionFitsNotes:
    def test_the_choices_are_about_grouping_not_rewriting(self, day6):
        """骨格の既定（もっと短く・もっと丁寧に）はメモの束に当たらない。"""
        step = next(one for one in day6["steps"] if one["id"] == "add_condition")
        labels = [one["label"] for one in step["options"]]

        assert "もっと丁寧に" not in labels
        assert "やわらかく" not in labels
        assert any("分け" in one for one in labels)
