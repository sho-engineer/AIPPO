"""AI技の中身と、獲得のしかた。

名前は一般用語にする
--------------------
図鑑で覚えた言葉が、外の記事や他の道具でそのまま通じないと、
学んだ意味が半分になる。だから AIPPO だけの造語は作らない。
「ターゲット指定」「ファクトチェック」のように、そのまま検索して
続きを読める言葉だけを置く。

枠だけ先に並べない
------------------
「12 / 48」のように集める余地を見せたくなるが、中身の無い枠を並べると
**押しても何も無い項目**ができる。ここに入れるのは、いまあるレッスンの
どれかで実際に習得できるものだけ。レッスンが増えたらここへ足す。

古い記録を捨てない
------------------
獲得の記録は既存の `SkillProgress`（`learner_key` + `skill_key`）を
そのまま使う。新しい表を作って作り直すと、いままでに習得した分が
**消えたように見える**。旧い `skill_key` は migration で新しい slug へ
付け替えてある（`lessons/migrations/0012_rename_skill_keys_to_ai_skills.py`）。
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from apps.catalog.models import Lesson
from apps.rewards.models import AiSkill, AiSkillLesson


@dataclass(frozen=True)
class SkillSeed:
    slug: str
    name: str
    one_line: str
    description: str
    example: str
    lessons: tuple[str, ...] = field(default_factory=tuple)


#: 図鑑に並ぶAI技。順番はこの並びのまま。
#:
#: `lessons` は「そのレッスンを終えると習得できる」という意味で、
#: レッスンの `outcomes`（今日できるようになること）から取っている。
#: **教材が言っていないことを技にしない。** 増やすと図鑑は賑やかになるが、
#: 習得できない技が並ぶだけになる。
AI_SKILLS: tuple[SkillSeed, ...] = (
    SkillSeed(
        slug="target",
        name="ターゲット指定",
        one_line="誰が読むのかをAIに伝える",
        description=(
            "同じ内容でも、読む人が変われば書き方は変わる。"
            "「誰に向けてか」を先に伝えると、AIはそこに合わせてくる。"
        ),
        example="はじめて聞く社外の人に向けて書いてください",
        lessons=("rewrite_text", "explain_topic"),
    ),
    SkillSeed(
        slug="tone",
        name="トーン指定",
        one_line="文章の雰囲気を指定する",
        description=(
            "ていねいに・やわらかく・短く言い切る。"
            "雰囲気を言葉にして渡すと、書き直しの回数が減る。"
        ),
        example="取引先向けに、ていねいな言い方にしてください",
        lessons=("rewrite_text",),
    ),
    SkillSeed(
        slug="length",
        name="長さの指定",
        one_line="何行・何文字かを伝える",
        description=(
            "長さを言わないと、AIはたいてい長く書く。"
            "先に上限を決めておくと、読む側の時間も減る。"
        ),
        example="3行以内にしてください",
        lessons=("rewrite_text", "summarize_text"),
    ),
    SkillSeed(
        slug="output_format",
        name="出力形式の指定",
        one_line="箇条書き・表など、形を決める",
        description=(
            "中身が合っていても、形が違うとそのまま使えない。"
            "貼り付ける先の形を先に伝える。"
        ),
        example="箇条書きで、5個までにしてください",
        lessons=("summarize_text", "explain_topic"),
    ),
    SkillSeed(
        slug="context",
        name="コンテキスト",
        one_line="背景と目的を先に渡す",
        description=(
            "何のために要るのかが分かると、AIは省くところを選べる。"
            "前提を書かずに頼むと、当たりさわりのない答えが返る。"
        ),
        example="来週の社内会議で共有するために、要点だけまとめてください",
        lessons=("summarize_text", "make_plan"),
    ),
    SkillSeed(
        slug="comparison",
        name="比較",
        one_line="複数の案を出して見比べる",
        description=(
            "1つだけ出させると、それが良いのかどうか分からない。"
            "比べる基準を自分で決めて、並べて見る。"
        ),
        example="A案とB案を、費用と手間の2つで比べてください",
        lessons=("compare_options",),
    ),
    SkillSeed(
        slug="decomposition",
        name="分解",
        one_line="大きな課題を小さく割る",
        description=(
            "そのままでは動けない大きさの話を、明日から始められる"
            "大きさまで割ってもらう。"
        ),
        example="この計画を、1日30分でできる手順に分けてください",
        lessons=("make_plan",),
    ),
    SkillSeed(
        slug="iteration",
        name="反復",
        one_line="一度で決めず、直しを重ねる",
        description=(
            "最初の答えを完成品として扱わない。直したい方向を一つずつ"
            "足していくほうが、結果として速い。"
        ),
        example="いまの文章を、もう少し短くしてください",
        lessons=("improve_answer",),
    ),
    SkillSeed(
        slug="follow_up",
        name="追加質問",
        one_line="足りない情報をAIに聞かせる",
        description=(
            "こちらが渡し忘れていることは、AIには分からない。"
            "先に質問させると、的外れな答えが減る。"
        ),
        example="書き始める前に、足りない情報を質問してください",
        lessons=("improve_answer",),
    ),
    SkillSeed(
        slug="fact_check",
        name="ファクトチェック",
        one_line="うのみにせず、確かめる",
        description=(
            "AIは、もっともらしい間違いを自信たっぷりに書く。"
            "そのまま出す前に、確かめる場所を自分で決める。"
        ),
        example="この中で、事実の確認が要る箇所はどこですか",
        lessons=("rewrite_text", "compare_options", "use_ai_safely"),
    ),
    SkillSeed(
        slug="data_safety",
        name="入れてよい情報の切り分け",
        one_line="渡してはいけないものを見分ける",
        description=(
            "名前・連絡先・社外に出していない数字は、そのまま貼らない。"
            "伏せても頼めることは多い。"
        ),
        example="固有名詞をA社・B社に置き換えてから渡す",
        lessons=("use_ai_safely",),
    ),
    SkillSeed(
        slug="task_framing",
        name="タスク定義",
        one_line="困りごとを、頼める形に言い換える",
        description=(
            "「なんとかしたい」はAIには渡せない。何を・どんな形で"
            "出してほしいのかまで言い換えると、頼める形になる。"
        ),
        example="議事録から、決まったことだけを箇条書きで出してください",
        lessons=("final_challenge",),
    ),
)


#: 技の組み合わせ（P1-6）。**表は作らない。**
#:
#: 組み合わせは「見せ方」であって持ち物ではない。表にすると、技を1つ
#: 足すたびに組み合わせの管理が増える。名前も、その組み合わせの効果に
#: 付けるだけで、技そのものの名前は置き換えない（一般用語のまま）。
#: (技の slug の組, 呼び名, ひとこと)
SKILL_COMBOS: tuple[tuple[tuple[str, ...], str, str], ...] = (
    (("target", "tone"), "伝わる文章", "誰に・どんな雰囲気で、が揃うと読みやすくなる"),
    (("context", "output_format"), "そのまま使える形", "目的と形が揃うと、貼り付けるだけで済む"),
    (("comparison", "fact_check"), "選べる材料", "並べて、確かめてから決める"),
    (("decomposition", "iteration"), "動き出せる計画", "小さく割って、直しながら進める"),
    (("follow_up", "task_framing"), "頼み上手", "足りないことを聞かせ、頼める形にする"),
)


def seed_ai_skills() -> int:
    """図鑑の中身をそろえる。何度実行しても同じ結果になる。

    管理画面で直した表示名を、実行のたびに巻き戻さない
    （`get_or_create` で、既にあるものは触らない）。
    """
    made = 0
    for order, seed in enumerate(AI_SKILLS):
        skill, created = AiSkill.objects.get_or_create(
            slug=seed.slug,
            defaults={
                "name": seed.name,
                "one_line": seed.one_line,
                "description": seed.description,
                "example": seed.example,
                "order": order,
            },
        )
        if created:
            made += 1

        for lesson_order, lesson_slug in enumerate(seed.lessons):
            lesson = Lesson.objects.filter(slug=lesson_slug).first()
            if lesson is None:
                # 教材がまだ入っていない環境。次の seed で繋がる
                continue
            AiSkillLesson.objects.get_or_create(
                skill=skill, lesson=lesson, defaults={"order": lesson_order}
            )

    return made


def skills_for_lesson(lesson_slug: str) -> list[AiSkill]:
    """このレッスンを終えると習得できる技。"""
    return list(
        AiSkill.objects.filter(lesson_links__lesson__slug=lesson_slug).distinct()
    )


def award_lesson_skills(learner_key: uuid.UUID, lesson_slug: str) -> list[str]:
    """このレッスンぶんの技を習得済みにする。新しく付いた slug を返す。

    記録先は既存の `SkillProgress`。二重獲得は
    (learner_key, skill_key) の unique constraint が防ぐ。

    前はここが**全レッスン共通の固定4つ**だった。どのレッスンを終えても
    同じ4つが付くので、図鑑は最初の1本で埋まり、そのあとは何本やっても
    増えない。習得したことにならないレッスンがある、の逆——
    **していないことを習得したことにしていた**。
    """
    from apps.lessons.models import SkillProgress

    acquired: list[str] = []
    for skill in skills_for_lesson(lesson_slug):
        _row, created = SkillProgress.objects.get_or_create(
            learner_key=learner_key,
            skill_key=skill.slug,
            defaults={"lesson_id": lesson_slug},
        )
        if created:
            acquired.append(skill.slug)
    return acquired
