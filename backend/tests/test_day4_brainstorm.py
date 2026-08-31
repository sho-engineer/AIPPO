"""Day4「アイデアを広げる」が、教材として成り立っていること。

なぜこの検査が要るのか
----------------------
この教材は長いあいだ、骨格の**埋め草**のまま並んでいた。解説カードが
「目的を先に伝える」「形も指定する」——他のレッスンと1文字も同じ。
お試しの見出しは「まず、使う場面を1つ選びます」。一覧では9本そろって
見えるのに、開くと中身が隣と区別できない、という壊れ方だった。

しかも埋め草はどのレッスンでも同じ文なので、**1本だけ直しても
どのテストも落ちない。** だからここで名指しで見張る。

見るのは4つ。

  1. 覚える技（発散・ロール指定・追加質問・反復）が、名前だけでなく
     **使う場面まで**あること
  2. 解説を続けて2枚出さないこと（あいだに手を動かす画面が入る）
  3. 「条件を足す」がアイデア向けの言葉になっていること
     ——骨格の既定は「もっと短く」「もっと丁寧に」で、案の束には当たらない
  4. 選んだ立場と聞き返しが、実際に AI へ届くこと（看板倒れにしない）
"""

from __future__ import annotations

import pytest
from django.core.management import call_command

from apps.ai.actions import get_action
from apps.catalog.expand import lesson_to_dict
from apps.catalog.models import Lesson

SLUG = "brainstorm_ideas"


@pytest.fixture
def day4(db):
    call_command("seed_catalog", verbosity=0)
    return lesson_to_dict(Lesson.objects.get(slug=SLUG))


@pytest.fixture
def order(day4):
    return [step["id"] for step in day4["steps"]]


@pytest.mark.django_db
class TestDay4IsWritten:
    def test_it_is_not_the_shared_filler_any_more(self, day4):
        """隣のレッスンと同じ文言で埋まっていないこと。"""
        titles = [
            step["card"]["title"]
            for step in day4["steps"]
            if step["type"] == "concept_card"
        ]
        assert "目的を先に伝える" not in titles
        assert "形も指定する" not in titles

        quick = next(step for step in day4["steps"] if step["id"] == "quick_try")
        assert quick["title"] != "まず、使う場面を1つ選びます"

    def test_it_asks_for_a_theme_not_a_piece_of_writing(self, day4):
        """画面が「文章」と言い、絵が「アイデア」と言う、を残さない。"""
        for step_id in ("real_task_intro", "real_task", "compare_results"):
            step = next(one for one in day4["steps"] if one["id"] == step_id)
            text = f"{step.get('title', '')}{step.get('instruction', '')}"
            assert "文章" not in text, f"{step_id} がまだ文章と言っている"

    def test_the_skills_it_promises_are_the_ones_it_teaches(self, day4):
        lesson = Lesson.objects.get(slug=SLUG)
        assert lesson.learned_skills == ["発散", "ロール指定", "追加質問", "反復"]

        taught = {
            step["card"]["title"]
            for step in day4["steps"]
            if step["type"] == "concept_card"
        }
        assert taught == {"発散", "ロール指定", "追加質問", "反復（Iteration）"}


@pytest.mark.django_db
class TestTheOrder:
    def test_divergence_comes_after_the_first_try(self, order):
        # 説明を先に読ませない。一度出してもらってから「これが発散」
        assert order.index("concept_1") > order.index("generate_first")

    def test_the_comparison_comes_after_adding_a_condition(self, order):
        # concept_1 はここに入れない。**解説は比べたあとに来る**ので、
        # 「比べるより前にあること」を求めると順序が逆に固定される
        for earlier in ("quick_try", "add_condition", "generate_improved"):
            assert order.index("compare_results") > order.index(earlier)

    def test_the_slide_comes_straight_after_the_comparison(self, order):
        """AI技の名前は、**使って、違いを見たあと**に出す。

        前はここが逆で、条件を足す前に「〜とは」を読ませていた。
        何の役に立つのか分からないまま読む説明は、飛ばされるか、
        読んでも残らない。

        見比べた直後に置くと、名前がたったいま自分で起こした変化に
        貼り付く。**あいだに何も挟まない**のが肝心で、1画面でも
        空くと「さっきの話」になってしまう。
        """
        assert order.index("concept_1") - order.index("compare_results") == 1

    def test_no_two_slides_in_a_row(self, day4, order):
        """解説を2枚続けて出さない。読み下す画面が続くと手が止まる。"""
        slides = [
            index
            for index, step in enumerate(day4["steps"])
            if step["type"] == "concept_card"
        ]
        for first, second in zip(slides, slides[1:], strict=False):
            assert second - first > 1, f"{order[first]} と {order[second]} が隣り合っている"

    def test_each_skill_sits_right_before_the_screen_that_uses_it(self, order):
        # 技は、使う直前に出す
        assert order.index("real_role") - order.index("concept_role") == 1
        assert order.index("real_followup") - order.index("concept_followup") == 1
        # 反復は送る直前。「一度で完璧を目指さなくていい」がいちばん効く場所
        assert order.index("prompt_preview") - order.index("concept_iteration") == 1


@pytest.mark.django_db
class TestItActuallyReachesTheAi:
    def test_the_chosen_role_and_followup_are_sent(self, day4):
        """「これがロール指定」と教えて、使う口が無い、にしない。"""
        sends = next(step for step in day4["steps"] if step["id"] == "generate_real")
        inputs = sends["aiAction"]["inputs"]
        assert inputs["role"] == "role"
        assert inputs["followup"] == "instruction"

        action = get_action("brainstorm")
        names = {field.key for field in action.fields}
        assert {"role", "instruction"} <= names

    def test_the_role_cannot_be_skipped_by_a_leftover_default(self, day4):
        """必ず答える質問に、既定値が先に入っている欄を使わない。

        最初のお試しは、聞かなかった条件を既定値で埋めて成立させている。
        そのキーを必須の質問に流用すると、開いた時点で値が入っていて、
        選ばずに次へ進める（空かどうかしか見ていない）。
        """
        quick = next(step for step in day4["steps"] if step["id"] == "quick_try")
        defaults = quick["meta"]["defaults"]

        for step in day4["steps"]:
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

    def test_the_followup_can_be_left_empty(self, day4):
        # 聞きたいことが無い人を、ここで止めない
        followup = next(
            step for step in day4["steps"] if step["id"] == "real_followup"
        )
        assert not followup.get("required")
        assert any(one["value"] == "" for one in followup["options"])


@pytest.mark.django_db
class TestAddingAConditionFitsIdeas:
    def test_the_choices_are_about_ideas_not_rewriting(self, day4):
        """骨格の既定（もっと短く・もっと丁寧に）は案の束に当たらない。"""
        step = next(one for one in day4["steps"] if one["id"] == "add_condition")
        labels = [one["label"] for one in step["options"]]

        assert "もっと丁寧に" not in labels
        assert "やわらかく" not in labels
        # 数と方向性を足す一歩になっていること
        assert any("10個" in one["value"] for one in step["options"])
