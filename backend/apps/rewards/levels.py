"""AIPPO Level の中身——段・上がるのに要る技・昇段の実践問題。

ここは「データ」であって「判定」ではない
----------------------------------------
段の数も、要る技も、この表の中だけにある。地図を作る側
（`apps/rewards/progression.py`）は**数を一つも持たない**——全部
データベースから読む。段を1つ足すのも、技を入れ替えるのも、ここへ
1行足すだけで済む。

なぜ技の一覧をここに置くか
--------------------------
画面側にも短い言葉の一覧がある（`frontend/src/course/aippoLevel.ts`）。
あれは**一覧を並べるための名前**で、要件ではない。「この技を持って
いるか」を決めるのは、実際に取得記録が残る `AiSkill` の slug だけ。
言葉の側で判定すると、表示を直した日に判定が変わる。

段と技の対応の付け方
--------------------
技は、その段で**初めて要るもの**だけを置く。下の段の技は
`progression` 側が「通り過ぎた段」として扱うので、ここで重ねて
書かない——重ねると、Lv.5 の要件が13個並んで、何が新しいのか
分からなくなる。

昇段の実践問題が無い段
----------------------
Lv.4・Lv.5 の問題はまだ無い。**空の問題を置かない**——押しても
何も無い項目を作るより、地図に「準備中」と出すほうがよい
（`LevelState.has_challenge` が False になる）。
"""

from __future__ import annotations

from dataclasses import dataclass, field

from apps.rewards.models import (
    AippoLevel,
    AiSkill,
    LevelRequirement,
    RankUpChallenge,
)


@dataclass(frozen=True)
class LevelSeed:
    number: int
    #: 短い名前。結果の画面の道（`GrowthTrack`）と同じ言葉にする。
    name: str
    #: 1行。5つを一目で見比べるためのものなので、長くしない。
    description: str
    #: この段へ**上がるのに**要る技の slug（`apps/rewards/skills.py`）。
    #: Lv.1 は始まりの段なので空。
    skills: tuple[str, ...] = field(default_factory=tuple)


#: 5段。番号は診断の段階（画面側 `diagnosisScore.ts` の `STAGES`）と同じ。
#:
#: **2つの数を並行に持たない。** 持つと、片方だけ動かした日に
#: 「道は5段目なのに Level 2」という食い違いが出る。
LEVELS: tuple[LevelSeed, ...] = (
    LevelSeed(
        number=1,
        name="試す",
        description="AIに質問したり、簡単な文章生成を試せる",
        skills=(),
    ),
    LevelSeed(
        number=2,
        name="頼む",
        description="目的を伝えて、基本的な仕事をAIに頼める",
        skills=("prompt", "context"),
    ),
    LevelSeed(
        number=3,
        name="条件をつける",
        description="相手・目的・条件・形式を指定して、欲しい結果に近づけられる",
        # 「相手・目的・条件・形式」の4つ。昇段の問題で見る観点と
        # そろえてある（下の `CHALLENGES` の Lv.3）
        skills=("target", "tone", "length", "output_format"),
    ),
    LevelSeed(
        number=4,
        name="使い分ける",
        description="仕事の内容に応じて、AIへの頼み方や使い方を選べる",
        skills=("comparison", "iteration", "fact_check", "data_safety"),
    ),
    LevelSeed(
        number=5,
        name="組み立てる",
        description="AIを仕事の流れに組み込み、複数のステップを組み立てて使える",
        skills=("decomposition", "follow_up", "task_framing"),
    ),
)


@dataclass(frozen=True)
class ChallengeSeed:
    #: この問題を通ると上がる段。
    level: int
    title: str
    scenario: str
    #: 見る観点。`apps/rewards/rankup.py` の `CHECKS` の鍵。
    checks: tuple[str, ...]
    estimated_minutes: int = 2


#: 昇段の実践問題。**知識を聞かない。実際に指示文を書かせる。**
#:
#: 場面は、AI の話ではなく**仕事の話**で書く。「プロンプトを書いて
#: ください」と言われると身構えるが、「部長に送る一言を用意する」なら
#: 手が動く。
#:
#: 観点は、その段で初めて要るものに合わせる。Lv.2 で4つ全部を求めると、
#: 上がる前に Lv.3 の力を要求することになる。
CHALLENGES: tuple[ChallengeSeed, ...] = (
    ChallengeSeed(
        level=2,
        title="目的を伝えて、頼んでみる",
        scenario=(
            "先週の打ち合わせのメモが、そのままでは長くて読めません。"
            "何のために使うのかを添えて、AIへの指示文を書いてください。"
        ),
        checks=("purpose",),
    ),
    ChallengeSeed(
        level=3,
        title="相手と条件を決めて、頼む",
        scenario=(
            "取引先へ送る案内文を、AIに下書きしてもらいます。"
            "誰が読むのか・何のためか・どんな条件で・どんな形で出して"
            "ほしいのかを入れて、指示文を書いてください。"
        ),
        checks=("purpose", "audience", "condition", "format"),
        estimated_minutes=3,
    ),
)


def seed_levels() -> int:
    """段・要件・問題をそろえる。何度実行しても同じ結果になる。

    管理画面で直した表示名を巻き戻さない（`get_or_create`）。ただし
    **要る技の一覧だけは合わせる**——ここが古いままだと「そろった
    はずなのに挑戦できない」が起きて、外から原因が見えない。
    """
    made = 0
    for order, seed in enumerate(LEVELS):
        level, created = AippoLevel.objects.get_or_create(
            number=seed.number,
            defaults={
                "name": seed.name,
                "description": seed.description,
                "order": order,
            },
        )
        made += int(created)

        requirement, _ = LevelRequirement.objects.get_or_create(level=level)
        skills = list(AiSkill.objects.filter(slug__in=seed.skills))
        if len(skills) == len(seed.skills):
            requirement.required_skills.set(skills)
        """
        技がまだ入っていない環境では、**何もしない。**

        足りないまま `set()` すると、要件が歯抜けのまま固定される
        ——そして歯抜けの要件は「そろっている」ことになるので、
        挑戦が早く開いてしまう。次に `seed_ai_skills` のあとで
        流し直せば揃う。
        """

    for seed in CHALLENGES:
        level = AippoLevel.objects.filter(number=seed.level).first()
        if level is None:
            continue
        RankUpChallenge.objects.get_or_create(
            level=level,
            defaults={
                "title": seed.title,
                "scenario": seed.scenario,
                "checks": list(seed.checks),
                "estimated_minutes": seed.estimated_minutes,
            },
        )

    return made
