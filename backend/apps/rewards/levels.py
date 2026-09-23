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
いまは Lv.2〜Lv.5 の4つそろっている。**空の問題を置かない**——
段を足して問題をまだ書いていないときは、そこだけ `CHALLENGES` に
入れずにおく。地図は「準備中」と出す（`LevelState.has_challenge` が
False になる）ので、押しても何も無い項目にはならない。
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
        # `data_safety` は外してある。下の「取れない技を要件にしない」。
        skills=("comparison", "iteration", "fact_check"),
    ),
    LevelSeed(
        number=5,
        name="組み立てる",
        description="AIを仕事の流れに組み込み、複数のステップを組み立てて使える",
        # `task_framing` は外してある。同上。
        skills=("decomposition", "follow_up"),
    ),
)

#: 取れない技を、要件にしない
#: ---------------------------
#: `data_safety` は `use_ai_safely`、`task_framing` は `final_challenge`
#: にしかひも付いていない。**どちらもコースから外して旧教材
#: （`foundation_legacy`）へ移した本**なので、これから始める人は
#: 取りようがない。要件に残すと、Lv.4 と Lv.5 は**誰も届かない段**
#: として地図に並び続ける——「あと1つ」と出ているのに、その1つを
#: 取る道がどこにも無い。
#:
#: 技そのものは図鑑から消していない。過去にあの2本を終えた人は
#: 実際に身につけていて、その記録は本人のものだから（公開範囲は
#: こちら側の都合、`lesson-status-rule.md`）。
#:
#: 旧教材を現役へ戻すなら、ここへ戻す。そのときは
#: `test_level_progression.py::TestCanYouActuallyClimb` が
#: 届くかどうかを実際に数えて教える。


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
    ChallengeSeed(
        level=4,
        title="どう使うかを、自分で決める",
        scenario=(
            "取引先2社から見積もりが届きました。どちらで進めるかを"
            "上司に相談するため、AIに整理してもらいます。見積書には"
            "社名と金額が入っています。\n\n"
            "何を基準に比べるか・どこは自分で確かめるか・そのまま"
            "渡さない情報はどれかを入れて、指示文を書いてください。"
        ),
        #: 観点は**1回の指示文に表れるもの**だけにする。
        #:
        #: この段に要る技は4つあるが、そのうち「反復」（結果を見て
        #: 直す）は1回書いた文からは読み取れない——**次の回に何を
        #: するか**の話なので。見えないものを見たことにしない。
        checks=("basis", "verify", "safety"),
        estimated_minutes=4,
    ),
    ChallengeSeed(
        level=5,
        title="何回かに分けて、組み立てる",
        scenario=(
            "来月から始まる業務の手順書を作ることになりました。"
            "いきなり全部は頼めないので、AIとのやり取りを何回かに"
            "分けて進めます。\n\n"
            "どんな順番で進めるか・前の回の結果を次にどう渡すか・"
            "最後に何をどんな形で受け取りたいかを入れて、"
            "1回目の指示文を書いてください。"
        ),
        checks=("steps", "handoff", "deliverable"),
        estimated_minutes=5,
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
