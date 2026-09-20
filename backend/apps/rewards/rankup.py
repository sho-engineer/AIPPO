"""昇段の実践問題を、規則で見る。

なぜ AI に採点させないか
------------------------
「目的が入っているか」「誰向けか書いてあるか」を AI に聞く形も考えた。
やめた理由は3つある。

  1. **同じ答えで結果が揺れる。** 昨日通った文が今日落ちると、
     学ぶ側には何が悪かったのか分からない。段が上がるかどうかを
     決めるものなので、揺れてはいけない
  2. **落ちた人へ返す言葉が毎回変わる。** 規則なら「出力形式が
     入っていません」と観点の名前で言い切れる
  3. 検査が書けない。AI を呼ぶ判定は、通ることを確かめるために
     毎回 AI を呼ぶことになる

規則は素朴でよい
----------------
ここで見たいのは**指示文の書き方を覚えたか**で、日本語の理解ではない。
「誰向けか」を言う言い方は限られていて（〜向け、〜に向けて、〜が読む）、
そこを拾えれば足りる。

**拾いすぎない。** 迷ったら通す側に倒してある——昇段は励ますための
場面で、粗探しをする場面ではない。通してしまった人は次の段で詰まり、
そこで足りないものに気づく。逆に、書けているのに落とすと、何を直せば
よいか分からないまま繰り返すことになる。

言い回しを足すとき
------------------
`CHECKS` に1語足すだけ。教材データ側には持たせない——持たせると、
言い回しを1つ足すたびに全部の問題を配り直すことになる。
"""

from __future__ import annotations

import re
from dataclasses import dataclass

#: 観点ごとの、見つけたい言い回し。
#:
#: 正規表現にしてあるのは、送り仮名と助詞の揺れを1つにまとめるため
#: （「向け」「向けに」「向けの」）。**語そのもの**を並べるので、
#: 読めばどこまで拾うつもりか分かる。
CHECKS: dict[str, tuple[str, re.Pattern[str]]] = {
    "purpose": (
        "目的",
        re.compile(
            r"(ため|目的|したい|してほしい|共有|報告|説明|依頼|相談|判断|検討)"
        ),
    ),
    "audience": (
        "誰向けか",
        re.compile(
            r"(向け|に向けて|が読む|読む人|上司|部長|課長|同僚|部下|新人|新入社員"
            r"|お客様|顧客|取引先|クライアント|社内|社外|初めて|専門家|経営)"
        ),
    ),
    "condition": (
        "条件",
        re.compile(
            r"(以内|まで|字|文字|行|ページ|分|短く|簡潔|詳しく|やさしく|丁寧"
            r"|カジュアル|専門用語|かみ砕|要点|重要|優先)"
        ),
    ),
    "format": (
        "出力形式",
        re.compile(
            r"(箇条書き|リスト|表|テーブル|見出し|段落|番号|ステップ|手順"
            r"|フォーマット|形式|形で|まとめて|整理して)"
        ),
    ),
}

#: これより短い答えは、観点を探す前に「まだ書けていない」とする。
#:
#: 1〜2語だと、たまたま1つの語が当たって通ってしまう。指示文として
#: 成り立つ最低限（実測で、短めの合格例が 40 字前後）。
MIN_LENGTH = 25


@dataclass(frozen=True)
class Judgement:
    """見た結果。**点数は持たない。**

    何割できたかではなく、**何が足りないか**を返す。点にすると、
    落ちた人に「62点」とだけ伝えることになり、次にやることが出てこない。
    """

    passed: bool
    #: 足りなかった観点の鍵。通ったときは空。
    missing: list[str]
    #: 足りなかった観点の、人に見せる名前。
    missing_labels: list[str]


def judge(answer: str, checks: list[str]) -> Judgement:
    """書いた指示文を、観点の一覧に照らす。

    `checks` が空なら、**誰でも通る**。問題を置いたが観点をまだ決めて
    いない段で、そこだけ進めなくなるのを避ける（`Coming Soon` の段）。
    """
    text = (answer or "").strip()
    wanted = [key for key in checks if key in CHECKS]

    if not wanted:
        return Judgement(passed=True, missing=[], missing_labels=[])

    if len(text) < MIN_LENGTH:
        """短すぎる。**観点を探さずに、全部足りないことにする。**

        1語だけ書いて、たまたま当たった観点で通るのを防ぐ。
        """
        return Judgement(
            passed=False,
            missing=list(wanted),
            missing_labels=[CHECKS[key][0] for key in wanted],
        )

    missing = [key for key in wanted if not CHECKS[key][1].search(text)]
    return Judgement(
        passed=not missing,
        missing=missing,
        missing_labels=[CHECKS[key][0] for key in missing],
    )
