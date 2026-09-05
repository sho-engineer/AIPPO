"""返ってきたものが、**そのレッスンの学習になっているか**。

なぜ要るか
----------
`_validate`（views.py）が見ているのは形だけ——鍵がそろっていて、
`result` が空でないこと。だが AI は、形は正しいまま**役に立たない
もの**を返すことがある。

    元の文章をそのまま返す
    「以下が書き直した文章です：」だけ返す
    「もっと短く」と頼んだのに長くなる
    「箇条書きに」と頼んだのに段落のまま

どれも 200 で返ってくる。そのまま画面へ出すと、Day1 の学習
（送る → 変わる → 見比べる）が**「何も変わらなかった」で終わる**。
AI のばらつきが、そのままレッスン体験の壊れになる。

採点はしない
------------
ここは**採点AIではない**。「良い文章か」は測らないし、測ろうと
すると生成そのものより高くつく。測るのは1つだけ——

    **頼んだことが、起きたかどうか。**

だから検査はすべて、入力と出力の文字を数えるだけで済む。
LLM は呼ばない。呼んだ瞬間、品質検査の費用が生成本体を超える。

測れないものは測らない
----------------------
「ていねいになったか」（トーン）は決定的には測れない。無理に
軽量モデルを足すより、**測らないと決めるほうがよい**。測れないものを
測ったふりをすると、正しい結果を弾いて作り直し、費用だけが増える。

誤って弾かないことを優先する
----------------------------
見逃し（微妙な結果が1つ通る）より、**誤検知（まともな結果を弾く）
のほうが高くつく**。弾くたびに作り直しの費用がかかり、待ち時間が
延び、それでも通らなければ学習が止まる。

だからどの検査も「これが起きていたら、頼んだことは確実に
起きていない」と言い切れるものだけにしてある。閾値はすべて
**ゆるい側**に倒してある。
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class Verdict:
    """検査の結果。落ちたときは、どの検査かを短い名前で持つ。

    本文は持たない。記録に残すのはこの名前だけで、
    利用者の文章は残さない（`Attempt.user_input` と同じ方針）。
    """

    ok: bool
    reason: str = ""

    @staticmethod
    def passed() -> Verdict:
        return Verdict(True)

    @staticmethod
    def failed(reason: str) -> Verdict:
        return Verdict(False, reason)


#: 検査1つ。送った値と、返ってきた文章を受け取る。
Check = Callable[[dict, str], Verdict]


def _flat(text: str) -> str:
    """比べるための形に均す。

    全角・半角、空白、改行の違いだけで「別の文章」と見なさない。
    ここを雑にすると、空白が1つ増えただけの丸写しを見逃す。
    """
    normalized = unicodedata.normalize("NFKC", text or "")
    return re.sub(r"\s+", "", normalized)


def _lines(text: str) -> int:
    """中身のある行の数。空行は数えない。"""
    return len([line for line in (text or "").splitlines() if line.strip()])


# ---------------------------------------------------------------- 検査


def no_copy(values: dict, text: str) -> Verdict:
    """元の文章をそのまま返していないか。

    **Day1でいちばん学習を壊す壊れ方。** 「送ったのに何も変わらない」
    ので、比べる画面に同じ文章が2つ並ぶ。学習者から見れば、
    AI が動いていないのと区別が付かない。

    判定は完全一致だけにしてある。「似ている」で弾くと、
    短い文章を丁寧にしただけの正しい結果まで巻き込む。
    """
    source = _flat(values.get("original_text", ""))
    if source and _flat(text) == source:
        return Verdict.failed("copy")
    return Verdict.passed()


def not_empty_ish(values: dict, text: str) -> Verdict:
    """中身がある長さか。

    `_validate` が空文字を弾いているので、ここが見るのはその先——
    **元がそれなりに長いのに、返りが一言しかない**場合。
    「はい。」だけが返ってきても、形としては正しい。

    元が短いときは何も言わない。1行の文章を1行に直すのは正しい。
    """
    source = _flat(values.get("original_text", ""))
    if len(source) >= 60 and len(_flat(text)) < 10:
        return Verdict.failed("too_short")
    return Verdict.passed()


#: 頼んだ形式を、こちらの都合の名前ではなく**頼んだ言葉**で引く。
#: 教材の選択肢（frontend の shared.ts）と同じ文字列にしてあること。
_BULLET = re.compile(r"^\s*(?:[-*・●○◆■]|\d+[.)、]|[（(]\d+[）)])", re.MULTILINE)


def follows_format(values: dict, text: str) -> Verdict:
    """「箇条書きにする」と頼んだのに、段落のままではないか。

    見るのは印だけ。中身が良い箇条書きかは見ない。
    印が1つも無ければ、頼んだことは確実に起きていない。
    """
    asked = f"{values.get('improvement', '')}{values.get('format', '')}"
    if "箇条書き" in asked and not _BULLET.search(text or ""):
        return Verdict.failed("format_ignored")
    return Verdict.passed()


def follows_length(values: dict, text: str) -> Verdict:
    """頼んだ長さに、だいたい沿っているか。

    閾値はどれもゆるい。「3行くらい」に5行で返ってきたのは
    直す必要が無く、**10行で返ってきたときだけ**直したい。

    「今のままの長さ」は何も見ない。頼んでいないことは測らない。
    """
    source = _flat(values.get("original_text", ""))
    made = _flat(text)
    asked = f"{values.get('length', '')}{values.get('improvement', '')}"

    """
    「もっと短く」「半分の長さ」は、短くなっていなければ起きていない。
    同じ長さで返るのは、条件を足した意味がまるごと消えること。

    ただし**元が短すぎるときは何も言わない**。「了解です。」を
    さらに短くしろというのは、無理を言っている。ここで弾くと、
    正しく答えているものを作り直させることになる。

    20文字。これより短い文章は、日本語では削る余地がほとんど無い。
    """
    if (
        ("短く" in asked or "半分" in asked)
        and len(source) >= 20
        and len(made) >= len(source)
    ):
        return Verdict.failed("not_shorter")

    # 「1行」は改行なし。2行までは許す（体裁の改行を弾かないため）
    if "1行" in asked and _lines(text) > 2:
        return Verdict.failed("too_many_lines")

    # 「3行くらい」。倍でも通し、その先だけ落とす
    if "3行" in asked and _lines(text) > 6:
        return Verdict.failed("too_many_lines")

    return Verdict.passed()


#: 前置きの見出し。**1行目が見出しで終わっている**ときだけ拾う。
#:
#: 「承知しました。」で始まる文だけを見て弾いてはいけない。ビジネス文書を
#: 丁寧に書き直すと、本文がその言葉で**正しく**始まることがある
#: （「了解です」→「承知しました。」）。弾くのは、行末が「：」で終わり、
#: 作業そのものを指す言葉を含む行だけにしてある。
_PREAMBLE = re.compile(r"^.{0,40}(書き直し|修正|要約|以下|下記).{0,20}[：:]\s*$")


def no_preamble(values: dict, text: str) -> Verdict:
    """作業の報告が混ざっていないか。

    「以下が書き直した文章です：」は、**成果物ではなく報告**。
    そのまま仕事に持っていけないので、学習の出口が閉じる。

    見るのは1行目だけ。しかも見出しの形（行末が「：」）に
    なっているときだけ。ふつうの本文を巻き込まないため。
    """
    body = (text or "").strip()
    if not body:
        return Verdict.passed()

    head = body.splitlines()[0].strip()
    # 見出しだけの行なら、そのあとに本文が続いているはず
    if len(body.splitlines()) > 1 and _PREAMBLE.match(head):
        return Verdict.failed("preamble")

    if body.startswith("※") or "【解説】" in body:
        return Verdict.failed("commentary")

    return Verdict.passed()


#: 作業そのものを名指す言い方。**1文目がこれで終わるときだけ**見る。
_DECLARE_VERB = re.compile(
    r"(?:(?:修正|要約|整理|説明|翻訳|変換|作成)(?:し|いたし)"
    r"|書き直し|書きなおし|書き換え|書きかえ|言い換え|言いかえ|直し|訳し|まとめ)"
    r"(?:ます|ました)(?:ね)?$"
)

#: 「いま頼まれた仕事」のほうを指す言葉。本文の話題としては、まず出てこない。
#:
#: 「用に」の前に「利・使・活・採・運・費」が来るものは外す。
#: 「利用について」「使用に関する」は、書き直した本文にふつうに出る。
_DECLARE_MARK = re.compile(
    r"元の文章|元の文|原文|いただいた|ご要望|ご依頼|ご指示|ご指定"
    r"|以下のとおり|以下の通り|以下のよう|下記のとおり|下記の通り|下記のよう"
    r"|(?<![利使活採運費])用に|向けに|専門用語"
)


def no_work_declaration(values: dict, text: str) -> Verdict:
    """1行目が、これからやることの宣言になっていないか。

    実機で出た壊れ方。1文目が「上司への報告用に、専門用語を減らして
    丁寧に書き直します。」で、書き直した文章はその次から始まっていた。
    見出し（行末が「：」）ではないので `no_preamble` はすり抜ける。
    **成果物ではなく作業の報告**なので、そのまま仕事へ持っていけない。

    何を目印にするか
    ----------------
    「します。」で終わる文を弾くのは危ない。**書き直した本文が
    そう終わることは、ふつうにある**（「明日までに企画書を書き直します。」）。
    だから、3つそろったときだけ落とす。

    1. **1文目であること。** 途中の文は見ない。宣言は必ず頭に来る
    2. 作業そのものを名指す動詞で終わっている（`_DECLARE_VERB`）
    3. その同じ文が、**本文の話題ではなく依頼のほうを指す言葉**を
       含んでいる（`_DECLARE_MARK`）——「〜向けに」「ご要望に沿って」
       「元の文章を」「以下のとおり」。これが2と一緒に出るのは、
       書き直した文章ではなく、書き直すという作業の話をしているとき

    2だけでは足りず、3だけでも足りない。「詳細は以下にまとめます。」は
    2を満たすが3の言い方をしていない（「以下に」であって「以下のとおり」
    ではない）ので通る。「元の文章を読み返した。」は3を満たすが
    2で終わっていないので通る。

    さらに2つ、ゆるい側へ倒してある。

    - 1文目のあとに本文が続いていること。1文しか無い返りは、宣言では
      なく短い書き直しのほうが多い（元の文章が依頼文だった場合など）
    - 1文目が60文字以内であること。宣言は短い。長い1文目は、
      たまたま同じ形で終わった本文である見込みのほうが高い

    取りこぼしは受け入れる。「わかりやすく書き直します。」だけの宣言は
    3を満たさないので通ってしまうが、**まともな結果を弾くほうが高くつく**
    （このファイルの冒頭）。宣言を止める本体は system_prompt 側にあり、
    ここはその取りこぼしを拾う網でしかない。
    """
    body = (text or "").strip()
    if not body:
        return Verdict.passed()

    # 1文目の切れ目は「。」か改行の、先に来たほう。宣言の行に「。」が
    # 付いていないことがあるので、改行も切れ目として数える。
    cuts = [pos for pos in (body.find("。"), body.find("\n")) if pos >= 0]
    if not cuts:
        return Verdict.passed()

    cut = min(cuts)
    head = body[:cut].strip()
    # 1文で終わっている返りは見ない（上の「本文が続くこと」）
    if not body[cut + 1 :].strip():
        return Verdict.passed()

    if len(head) > 60:
        return Verdict.passed()

    if _DECLARE_VERB.search(head) and _DECLARE_MARK.search(head):
        return Verdict.failed("work_declaration")

    return Verdict.passed()


def no_json_leak(values: dict, text: str) -> Verdict:
    """入れ物ごと本文へ漏れていないか。

    構造化出力を指定していても、モデルは JSON を文字列の中へ
    もう一度入れてくることがある。日本語の文章に `{"result"` が
    現れることはまず無いので、これは取り違えようがない。
    """
    body = (text or "").lstrip()
    if body.startswith("{") or '"result"' in body:
        return Verdict.failed("json_leak")
    return Verdict.passed()


# -------------------------------------------------------- どれを掛けるか

#: 共通で掛けるもの。どのレッスンでも、これが起きたら学習にならない。
COMMON: tuple[Check, ...] = (no_copy, not_empty_ish, no_json_leak, no_preamble)

#: 頼んだこと別。**まだ Day1（rewrite / improve）だけ。**
#:
#: 横展開するときはここに1行足す。載っていない頼みごとは共通だけを
#: 掛ける——**知らないものを勝手に弾かない**。品質検査は、
#: 通すべきものを通せなくなった時点で害のほうが大きい。
BY_ACTION: dict[str, tuple[Check, ...]] = {
    # 作業の宣言は rewrite にだけ掛ける。目印にしている言葉（「〜向けに」
    # 「元の文章を」）は書き直しの依頼を指すもので、他の頼みごとでは
    # 本文にふつうに出る。共通に上げると、そちらで誤検知が増える。
    "rewrite": (follows_length, no_work_declaration),
    "improve": (follows_length, follows_format),
}


def inspect(action_id: str, values: dict, text: str) -> Verdict:
    """頼んだことが起きたか。落ちた最初の1つを返す。

    途中で止める。2つ落ちていても、直しに行くことは変わらない。
    """
    for check in COMMON + BY_ACTION.get(action_id, ()):
        verdict = check(values, text)
        if not verdict.ok:
            return verdict
    return Verdict.passed()


# ------------------------------------------------------------ 直しの指示

#: 作り直すときに足す一言。**どこが駄目だったかを、直し方で言う。**
#:
#: 「品質が低い」とだけ伝えても直しようがない。落ちた検査ごとに、
#: 次に何をすればよいかを1文で足す。
RETRY_HINT: dict[str, str] = {
    "copy": (
        "元の文章をそのまま返さないでください。"
        "指定された条件に合わせて必ず書き直してください。"
    ),
    "too_short": "一言で済ませず、元の内容を保った文章を返してください。",
    "not_shorter": "元の文章より必ず短くしてください。",
    "too_many_lines": "指定された行数に収めてください。",
    "format_ignored": "各項目の行頭に「・」を付けた箇条書きで返してください。",
    "preamble": "前置きや報告を書かず、成果物の文章だけを返してください。",
    "work_declaration": (
        "これから何をするかを述べる文で書きはじめないでください。"
        "書き直した文章そのものから、1文目を始めてください。"
    ),
    "commentary": "解説や注釈を混ぜず、成果物の文章だけを返してください。",
    "json_leak": "JSON をそのまま文字列に入れず、文章だけを result に入れてください。",
}


def retry_hint(reason: str) -> str:
    return RETRY_HINT.get(reason, "指定された条件に合わせて書き直してください。")
