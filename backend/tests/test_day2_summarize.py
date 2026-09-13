"""Day2「長い文章を短くまとめる」が、教材として成り立っていること。

見るのは3つ。

  1. 取り込んだ教材が、手書きの並びのまま DB にあること
     （骨格で組み直されると、段ごとに条件を足す形が消える）
  2. AI へ送る依頼文が、頼んだことを**全部**運んでいること
     ——読む人・目的・形は、画面で選んでも依頼文に出なければ意味が無い
  3. 返ってきたものを、品質の関門が正しく通す／落とすこと

3 は `qa-acceptance.md` の「AI evaluation cases」に当たる。**LLM は
呼ばない**。呼ぶと、鍵の有無や気分で落ちるテストになり、やがて誰も
回さなくなる（`apps/ai/providers/mock.py` の決まりと同じ）。ここで
測るのは「頼んだことが起きたか」だけで、文章の良し悪しは測らない。
"""

from __future__ import annotations

import pytest
from django.core.management import call_command

from apps.ai import quality
from apps.ai.actions import get_action
from apps.catalog.expand import lesson_to_dict
from apps.catalog.models import Lesson, LessonTemplate

SLUG = "summarize_text"

#: Lesson の題材（架空の調査資料）。教材から引く——ここに書き写すと、
#: 題材を直したときに検査だけが古い文章を持つ。


@pytest.fixture
def day2(db):
    call_command("seed_catalog", verbosity=0)
    return lesson_to_dict(Lesson.objects.get(slug=SLUG))


@pytest.fixture
def steps(day2):
    return {step["id"]: step for step in day2["steps"]}


@pytest.fixture
def source(steps):
    return steps["read_source"]["meta"]["sampleText"]


@pytest.mark.django_db
class TestDay2ReachedTheDatabase:
    """コードで書いた並びが、そのまま DB に入っていること。"""

    def test_it_is_written_by_hand_not_generated(self, db):
        call_command("seed_catalog", verbosity=0)
        lesson = Lesson.objects.get(slug=SLUG)

        # 骨格で組み直されると、段ごとに条件を足す形が消える
        assert lesson.template == LessonTemplate.CUSTOM
        assert lesson.steps.count() > 0

    def test_the_four_sections_are_there(self, day2):
        covers = [
            step for step in day2["steps"] if step["type"] == "section_transition"
        ]

        assert [step["title"] for step in covers] == [
            "まず短くしてみよう",
            "読みやすい形に変えよう",
            "読む目的を伝えよう",
            "自分の文章で試そう",
        ]

    def test_it_asks_the_ai_four_times(self, day2):
        sends = [step for step in day2["steps"] if step["type"] == "ai_generate"]

        assert len(sends) == 4
        assert all(step["aiAction"]["action"] == "summarize" for step in sends)

    def test_the_skills_it_promises_are_the_ones_it_hands_over(self, day2):
        lesson = Lesson.objects.get(slug=SLUG)
        recap = next(
            step for step in day2["steps"] if step["id"] == "skills_recap"
        )

        assert lesson.learned_skills == ["要約", "出力形式の指定", "コンテキスト"]
        assert [one["name"] for one in recap["meta"]["recap"]] == lesson.learned_skills

    def test_the_source_is_labelled_as_training_material(self, steps):
        """実在の調査と読み違えられないこと。

        読み違えられると、**この数字を仕事で引用する人が出る**。
        """
        assert "Lesson用サンプル" in steps["read_source"]["meta"]["sourceLabel"]

    def test_the_decision_facts_are_in_the_source(self, source):
        """Section 3 が「判断材料が残った」と言えるだけの数字があること。"""
        for fact in ("68％", "54％", "62％", "20名", "1か月", "検索時間", "利用率"):
            assert fact in source, f"題材に「{fact}」が無い"


@pytest.mark.django_db
class TestThePromptCarriesTheConditions:
    """画面で選んだものが、依頼文に出ること。

    ここが抜けると、選ぶ画面は**押せるだけの飾り**になる。
    """

    def test_the_first_call_carries_no_conditions(self, source):
        action = get_action("summarize")
        prompt = action.build({"original_text": source})

        assert "まとめてください" in prompt
        assert source in prompt
        # 条件はまだ1つも無い。「指定なし」が言葉として混ざらないこと
        assert "出力形式" not in prompt
        assert "まとめる目的" not in prompt
        assert "読む人" not in prompt

    def test_the_format_reaches_the_prompt(self, source):
        action = get_action("summarize")
        prompt = action.build(
            {"original_text": source, "format": "3つの箇条書きで"}
        )

        assert "出力形式: 3つの箇条書きで" in prompt

    def test_the_reader_and_purpose_reach_the_prompt(self, source):
        action = get_action("summarize")
        prompt = action.build(
            {
                "original_text": source,
                "format": "3つの箇条書きで",
                "purpose": "新しいツールを試すか判断する上司向けに",
            }
        )

        # 前の段で足した形が、**残ったまま**であること
        assert "出力形式: 3つの箇条書きで" in prompt
        assert "まとめる目的: 新しいツールを試すか判断する上司向けに" in prompt

    def test_the_own_text_call_carries_all_three(self):
        action = get_action("summarize")
        prompt = action.build(
            {
                "original_text": "自分の長い文章",
                "audience": "上司",
                "purpose": "やるかどうか判断するため",
                "format": "3行の文章で",
            }
        )

        assert "読む人: 上司" in prompt
        assert "まとめる目的: やるかどうか判断するため" in prompt
        assert "出力形式: 3行の文章で" in prompt

    def test_conditions_are_optional(self):
        """1回目が 400 で返らないこと。

        Day1 の `rewrite` と同じ理由。最初の1回は条件なしで送るのが
        この教材のねらいなので、必須にすると教材が成り立たない。
        """
        action = get_action("summarize")
        optional = {field.key for field in action.fields if not field.required}

        assert {"audience", "purpose", "format", "length"} <= optional

    def test_the_system_prompt_forbids_inventing_and_preambles(self):
        action = get_action("summarize")

        assert "書き換えない" in action.system_prompt
        assert "承知しました" in action.system_prompt
        assert "ちょうど3つ" in action.system_prompt


class TestTheQualityGate:
    """返ってきたものを、通すべきときに通し、落とすべきときに落とすこと。

    `qa-acceptance.md` の AI evaluation cases に当たる。
    """

    ASKED_THREE = {
        "original_text": "長い調査資料。" * 30,
        "format": "3つの箇条書きで",
    }

    def test_a_three_bullet_answer_passes(self):
        text = (
            "・情報を探す時間と、複数ツールへの重複入力が課題\n"
            "・新ツールには前向きな意見が多いが、操作や移行への不安もある\n"
            "・営業部20名で1か月試し、検索時間と利用率を確認する予定"
        )

        assert quality.inspect("summarize", self.ASKED_THREE, text).ok

    def test_a_paragraph_when_bullets_were_asked_is_caught(self):
        text = "社内調査では、情報検索の難しさや重複入力が課題として挙がりました。"

        verdict = quality.inspect("summarize", self.ASKED_THREE, text)
        assert not verdict.ok
        assert verdict.reason == "format_ignored"

    def test_seven_bullets_when_three_were_asked_is_caught(self):
        text = "\n".join(f"・要点{n}" for n in range(1, 8))

        verdict = quality.inspect("summarize", self.ASKED_THREE, text)
        assert not verdict.ok
        assert verdict.reason == "item_count"

    def test_four_bullets_is_let_through(self):
        """±1 は通す。**正しく答えているものを作り直させない。**

        3つと頼んで4つで返っても「形まで言うと、そのまま使える」は
        伝わる。ここを厳密にすると、待ち時間と費用だけが増える。
        """
        text = "\n".join(f"・要点{n}" for n in range(1, 5))

        assert quality.inspect("summarize", self.ASKED_THREE, text).ok

    def test_a_preamble_is_caught(self):
        text = "以下が要約です：\n・要点1\n・要点2\n・要点3"

        verdict = quality.inspect("summarize", self.ASKED_THREE, text)
        assert not verdict.ok
        assert verdict.reason == "preamble"

    def test_returning_the_source_unchanged_is_caught(self):
        values = {"original_text": "長い調査資料。" * 30, "format": "3つの箇条書きで"}

        verdict = quality.inspect("summarize", values, values["original_text"])
        assert not verdict.ok
        assert verdict.reason == "copy"

    def test_a_one_word_answer_is_caught(self):
        values = {"original_text": "長い調査資料。" * 30}

        verdict = quality.inspect("summarize", values, "調査。")
        assert not verdict.ok

    def test_no_count_asked_means_no_count_check(self):
        """個数を言っていないときは、数を見ない。

        **頼んでいないことは測らない**（`quality.py` の決まり）。
        """
        values = {"original_text": "長い調査資料。" * 30, "format": "箇条書きで"}
        text = "\n".join(f"・要点{n}" for n in range(1, 8))

        assert quality.inspect("summarize", values, text).ok

    def test_the_retry_hint_says_what_to_do(self):
        """落ちたとき、直し方の言葉が出ること。

        「品質が低い」とだけ返しても直しようがない。
        """
        hint = quality.retry_hint("item_count")

        assert "項目数" in hint
