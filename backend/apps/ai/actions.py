"""教材が AI に頼めることの一覧。

`POST /api/v1/ai/generate/` の `action` はここに載っているものだけ。
教材（LessonStep）はこの名前を指すだけで、プロンプトを持たない。

なぜ分けるか
------------
プロンプトを教材データやフロントエンドに置くと、
利用者側から書き換えられるうえ、安全ルール（§11）を1か所で
守れなくなる。**AI へ送る文面はサーバーが組み立てる**。

文章生成の指示は §11 に従い、共通で次を守る。

- 利用者が指定した目的を優先する
- 指定されていない事実を勝手に足さない
- 元の文章の意味を不必要に変えない
- 日本語として自然にする
- 出力だけを返す。解説を混ぜない
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from apps.ai.providers.mock import SOURCE_MARKER

#: すべての生成に共通する土台。ここを外れる指示は各アクションに書かない。
BASE_RULES = """あなたは、日本語を扱う作業の担当者です。

守ること:
- 利用者が指定した目的・対象者・条件を最優先する
- 指定されていない事実を勝手に足さない。分からないことは書かない
- 元の内容の意味を不必要に変えない
- 中学生でも読める日本語にする
- 依頼された成果物だけを返す。前置き・言い訳・解説を混ぜない
- 指定された JSON 形式だけを返す
"""

#: 1件のテキストを返すときの共通スキーマ。
TEXT_SCHEMA: dict = {
    "type": "object",
    "properties": {"result": {"type": "string"}},
    "required": ["result"],
    "additionalProperties": False,
}


@dataclass(frozen=True)
class ActionField:
    """アクションが受け取る入力1つ分。"""

    key: str
    label: str
    required: bool = True
    max_length: int = 200


@dataclass(frozen=True)
class Action:
    id: str
    #: 対応するレッスン。教材外からの呼び出しを弾くために使う。
    lesson_ids: tuple[str, ...]
    system_prompt: str
    schema: dict
    fields: tuple[ActionField, ...]
    build: Callable[[dict], str]
    #: 本文として受け取る項目。文字数上限が別枠になる。
    body_field: str = ""
    #: 生成後にポーが言うこと。100文字以内（§11）。
    tutor_message: str = ""
    tutor_emotion: str = "neutral"
    tutor_action: str = "review"
    extras: dict = field(default_factory=dict)


def _line(label: str, value: str) -> str:
    return f"- {label}: {value}" if value else ""


def _compose(headline: str, pairs: list[tuple[str, str]], body: str = "") -> str:
    """依頼文を組み立てる。

    条件を箇条書きで先に置き、対象の本文は目印の後ろへ回す。
    本文の中に「〜してください」と書かれていても、
    条件と混ざらないようにするため。
    """
    lines = [headline, ""]
    lines += [text for text in (_line(label, value) for label, value in pairs) if text]
    if body:
        lines += ["", SOURCE_MARKER, body]
    return "\n".join(lines)


# --- Lesson 1: 文章を分かりやすくする ------------------------------------

REWRITE = Action(
    id="rewrite",
    lesson_ids=("rewrite_text", "work_email_chat", "final_challenge"),
    # 前置きと言いかえの2つを、ここでしつこく書いてある理由。
    #
    # BASE_RULES の「前置き・言い訳・解説を混ぜない」だけでは足りなかった。
    # 実機の画面には、1行目に「上司への報告用に、専門用語を減らして丁寧に
    # 書き直します。」という**作業の宣言**が出て、書き直した文章はその次の
    # 行から始まっていた。利用者はこの結果をそのまま仕事へ持っていくので、
    # 1行目が報告だと、貼った先で自分が消して回ることになる。
    #
    # 同じ画面で「各トークンから生成された Query と Key」が「各言語の
    # 質問役と鍵役」になっていた。日常の言葉には置きかわっているが、
    # 指しているものが別物になっている。**かみくだくことと、意味を
    # 変えることは違う**——そこを分けて書かないと、この取り違えは残る。
    #
    # 例はどちらも、どのレッスンでも通じるものにしてある。Day1 の題材
    # （Transformer）を書き足すと、他の教材のときに効かなくなる。
    system_prompt=BASE_RULES
    + """
やること: 与えられた文章を、読む人が理解できる形に書き直す。

- 相手・表現・長さの指定があれば、それに合わせる
- 指定が無いものは、勝手に決めつけない。とくに**短くしろとは言われていない**
  ——長さの指定が無いときは、分かりやすさのために必要なだけ書いてよい
- むずかしい言葉は、かみくだくか、その場で言い換えを添える
- 元の内容の意味は変えない

**1文目から、書き直した文章そのものを書きはじめること。**

- これから何をするかを述べる文を、頭に置かない。
  NG: 「上司への報告用に、専門用語を減らして丁寧に書き直します。」と
  書いてから、書き直した文章を続ける
  OK: 書き直した文章そのものから始める
- 「〜します。」「〜しました。」「〜向けに書き直します。」のような
  作業の宣言も、「以下が書き直した文章です：」のような見出しも書かない。
  挨拶・意気込み・断り書きも要らない
- 頼まれているのは書き直した文章であって、作業の報告ではない

**読んだ人が一読で分かる日本語にすること。**

- 専門用語は、日常の言葉に置きかえる。**訳語に置きかえただけで
  終わらせない**——「自己注意機構」を「自己注意の仕組み」と書いても、
  読む人には同じだけ分からない。何をしているのかを普通の言葉で書く
- **置きかえた言葉が、元と別のものを指してはいけない。**
  かみくだくのは、意味を変えてよいということではない。
  NG: 「振込手数料」を「送るお金」（手数料の話が消えて、別の話になる）
  OK: 「振込手数料」を「お金を送るときにかかる料金」
- 意味を保ったまま言いかえられない言葉は、**元の言葉を残す**。
  そのうえで「（〜のこと）」と短く添える。当てずっぽうのやさしい言葉に
  置きかえるのは、むずかしい言葉を残すより悪い——読む人は、
  間違ったことを分かったつもりで持ち帰る
- 仕組みの内部（計算の手順、式、部品の名前）は、意味を伝えるのに
  要らなければ**省いてよい**。読む人が知りたいのは「結局それは何を
  しているのか」であって、その中身ではない
- 1文を長くしない。ひとつの文にひとつのことだけ書く

**元の文章の言いかえであること。別の説明を書き下ろさない。**

- 元の文章に無いことは足さない。例え話・補足・前置き・感想を
  勝手に付け足さない
- 元の文章が言っていることは、省いた部分も含めて**意味としては
  残す**。省いてよいのは中身の説明であって、結論ではない

書き直した文章だけを result に入れる。前置きも、あとがきも付けない。
""",
    schema=TEXT_SCHEMA,
    fields=(
        ActionField("original_text", "元の文章", max_length=5000),
        # 相手・表現・長さは**任意**。
        #
        # Day1 の最初の1回は「この文章を分かりやすくして」だけを送る
        # ——誰向けかも口調も、そのあとで足して違いを見るのが教材のねらい。
        # 必須のままだと、その1回目が 400 で返る。
        #
        # 他の教材（work_email_chat・final_challenge）は3つとも渡すので、
        # 緩めても送られる内容は変わらない。空のときは依頼文から行ごと
        # 落ちる（`_line`）ので、「指定なし」が文章として混ざることもない。
        ActionField("audience", "誰向け", required=False),
        ActionField("tone", "表現", required=False),
        ActionField("length", "長さ", required=False),
        ActionField("instruction", "追加の条件", required=False),
    ),
    body_field="original_text",
    build=lambda v: _compose(
        "次の文章を書き直してください。",
        [
            ("読む相手", v.get("audience", "")),
            ("表現", v.get("tone", "")),
            ("長さ", v.get("length", "")),
            ("追加の条件", v.get("instruction", "")),
        ],
        v["original_text"],
    ),
    # 何を指定したかは、指定した本人が知っている。ここで言い直さない
    # ——1回目は何も指定していないので、「相手と長さを伝えたので」は嘘になる。
    tutor_message="頼んだとおりに書き直しました。元の意味が変わっていないか見てみましょう。",
)

# --- Lesson 2: 長い文章を短くまとめる ------------------------------------

SUMMARIZE = Action(
    id="summarize",
    lesson_ids=(
        "summarize_text",
        "extract_needed_info",
        "transcription_use",
        "final_challenge",
    ),
    system_prompt=BASE_RULES
    + """
やること: 与えられた文章を、指定された目的・形式・長さでまとめる。
元の文章に書かれていないことは足さない。
まとめた結果だけを result に入れる。
""",
    schema=TEXT_SCHEMA,
    fields=(
        ActionField("original_text", "元の文章", max_length=5000),
        ActionField("purpose", "まとめる目的"),
        ActionField("format", "出力形式"),
        ActionField("length", "長さ"),
        ActionField("instruction", "追加の条件", required=False),
    ),
    body_field="original_text",
    build=lambda v: _compose(
        "次の文章をまとめてください。",
        [
            ("まとめる目的", v["purpose"]),
            ("出力形式", v["format"]),
            ("長さ", v["length"]),
            ("追加の条件", v.get("instruction", "")),
        ],
        v["original_text"],
    ),
    tutor_message="目的と形式を先に伝えると、まとめ方が変わります。元に無い話が混ざっていないか確かめましょう。",
)

# --- Lesson 3: 分からないことを説明してもらう ----------------------------

EXPLAIN = Action(
    id="explain",
    lesson_ids=("explain_topic", "final_challenge"),
    system_prompt=BASE_RULES
    + """
やること: 与えられた言葉や内容を、指定された相手に向けて説明する。
確信が持てないことは書かない。
説明の文章だけを result に入れる。
""",
    schema=TEXT_SCHEMA,
    fields=(
        ActionField("topic", "知りたいこと", max_length=500),
        ActionField("audience", "説明する相手"),
        # どんな立場で答えるか（ロール指定）。教材が聞いたときだけ入る
        ActionField("role", "答える立場", required=False),
        ActionField("style", "説明のしかた"),
        ActionField("example", "具体例の有無"),
        ActionField("length", "長さ"),
        ActionField("instruction", "追加の条件", required=False),
    ),
    body_field="topic",
    build=lambda v: _compose(
        "次のことを説明してください。",
        [
            ("説明する相手", v["audience"]),
            ("答える立場", v.get("role", "")),
            ("説明のしかた", v["style"]),
            ("具体例", v["example"]),
            ("長さ", v["length"]),
            ("追加の条件", v.get("instruction", "")),
        ],
        v["topic"],
    ),
    tutor_message="「誰に向けて」を伝えると、言葉の難しさが変わります。分からない言葉が残っていないか見てみましょう。",
)

# --- Lesson 4: 選択肢を比較する ------------------------------------------

COMPARE = Action(
    id="compare",
    lesson_ids=("compare_options", "final_challenge"),
    system_prompt=BASE_RULES
    + """
やること: 与えられた選択肢を、指定された基準で比べる。

特に守ること:
- 価格・仕様・最新の情報は、確かなことだけを書く。分からなければ
  「確認が必要」と書く。数字を推測で書かない
- 断定して1つに決めない。判断は利用者がする
""",
    schema={
        "type": "object",
        "properties": {
            "result": {"type": "string"},
            "check_points": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["result", "check_points"],
        "additionalProperties": False,
    },
    fields=(
        ActionField("options_text", "比べたいもの", max_length=2000),
        # 最初の1回は基準を決めずに聞く（「どれがおすすめ？」）。
        # 基準を決めると答えが変わることを、その差で見せる回なので、
        # ここを必須にすると最初から基準ありになってしまう。
        ActionField("criteria", "比べる基準", required=False, max_length=500),
        ActionField("priority", "いちばん大事にしたいこと"),
        ActionField("as_table", "表にするか"),
        ActionField("instruction", "追加の条件", required=False),
    ),
    body_field="options_text",
    build=lambda v: _compose(
        "次の選択肢を比べてください。",
        [
            ("比べる基準", v.get("criteria", "")),
            ("いちばん大事にしたいこと", v["priority"]),
            ("表にするか", v["as_table"]),
            ("追加の条件", v.get("instruction", "")),
        ],
        v["options_text"],
    ),
    tutor_message="AIのおすすめは答えではありません。価格や仕様は、必ず自分で確かめましょう。",
    tutor_emotion="warning",
    extras={"needs_fact_check": True},
)

# --- Lesson 5: 計画を作る ------------------------------------------------

PLAN = Action(
    id="plan",
    lesson_ids=("make_plan", "make_document_outline", "final_challenge"),
    system_prompt=BASE_RULES
    + """
やること: 与えられた目標を、実行できる小さな手順に分ける。

特に守ること:
- 1つの手順は、その日のうちに始められる大きさにする
- 期限・使える時間・予算をはみ出す案を出さない
- 避けたいことに挙がったものを手順に入れない
""",
    schema={
        "type": "object",
        "properties": {
            "result": {"type": "string"},
            "steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "detail": {"type": "string"},
                    },
                    "required": ["title", "detail"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["result", "steps"],
        "additionalProperties": False,
    },
    fields=(
        ActionField("goal", "達成したいこと", max_length=500),
        ActionField("deadline", "期限"),
        ActionField("available_time", "使える時間"),
        ActionField("budget", "予算", required=False),
        ActionField("priority", "優先したいこと", required=False),
        ActionField("avoid", "避けたいこと", required=False),
        ActionField("instruction", "追加の条件", required=False),
    ),
    body_field="goal",
    build=lambda v: _compose(
        "次のことを達成する計画を作ってください。",
        [
            ("期限", v["deadline"]),
            ("使える時間", v["available_time"]),
            ("予算", v.get("budget", "")),
            ("優先したいこと", v.get("priority", "")),
            ("避けたいこと", v.get("avoid", "")),
            ("追加の条件", v.get("instruction", "")),
        ],
        v["goal"],
    ),
    tutor_message="期限と使える時間を伝えると、計画の粒が変わります。明日から始められる大きさか見てみましょう。",
)

# --- アイデアを広げる ----------------------------------------------------

BRAINSTORM = Action(
    id="brainstorm",
    lesson_ids=("brainstorm_ideas", "organize_research", "final_challenge"),
    system_prompt=BASE_RULES
    + """
やること: 与えられたテーマについて、指定された数と条件で異なる案を出す。
同じ案の言い換えで数を水増ししない。案は実行可能な短い箇条書きにする。
""",
    schema=TEXT_SCHEMA,
    fields=(
        ActionField("topic", "考えたいテーマ", max_length=1000),
        ActionField("audience", "対象"),
        # どんな立場で案を出すか（ロール指定）。教材が聞いたときだけ入る
        ActionField("role", "考える立場", required=False),
        ActionField("constraints", "条件", required=False, max_length=500),
        ActionField("count", "案の数"),
        ActionField("instruction", "追加の条件", required=False),
    ),
    body_field="topic",
    build=lambda v: _compose(
        "次のテーマのアイデアを広げてください。",
        [
            ("対象", v["audience"]),
            ("考える立場", v.get("role", "")),
            ("条件", v.get("constraints", "")),
            ("案の数", v["count"]),
            ("追加の条件", v.get("instruction", "")),
        ],
        v["topic"],
    ),
    tutor_message="数と条件を伝えると、使える案に近づきます。似た案ばかりになっていないか見てみましょう。",
)

# --- 情報を整理する ------------------------------------------------------

ORGANIZE = Action(
    id="organize",
    lesson_ids=("organize_information", "organize_meeting", "organize_research"),
    system_prompt=BASE_RULES
    + """
やること: 与えられた情報を、指定された見出しと用途に合わせて整理する。
元の情報に無い担当者・期限・結論を補わない。不明な項目は「記載なし」とする。
""",
    schema=TEXT_SCHEMA,
    fields=(
        ActionField("original_text", "整理したい情報", max_length=5000),
        ActionField("purpose", "使う目的"),
        # 最初の1回は見出しを決めずに通す。分けると見やすくなることを
        # その差で見せる回なので、ここを必須にすると最初から分け済みになる。
        ActionField("categories", "分ける見出し", required=False, max_length=500),
        ActionField("format", "出力形式"),
        ActionField("instruction", "追加の条件", required=False),
    ),
    body_field="original_text",
    build=lambda v: _compose(
        "次の情報を整理してください。",
        [
            ("使う目的", v["purpose"]),
            ("分ける見出し", v.get("categories", "")),
            ("出力形式", v["format"]),
            ("追加の条件", v.get("instruction", "")),
        ],
        v["original_text"],
    ),
    tutor_message="見出しを先に決めると、抜けている情報にも気づきやすくなります。勝手に補われた内容がないか確認しましょう。",
)

# --- Lesson 6: 回答を改善する --------------------------------------------

#: AI を使うレッスン。改善はどのレッスンからも呼べる。
AI_LESSON_IDS = (
    "rewrite_text",
    "summarize_text",
    "explain_topic",
    "compare_options",
    "make_plan",
    "improve_answer",
    "final_challenge",
    "brainstorm_ideas",
    "organize_information",
    "organize_meeting",
    "work_email_chat",
    "extract_needed_info",
    "organize_research",
    "make_document_outline",
    "transcription_use",
)

IMPROVE = Action(
    id="improve",
    # 「もう少し直す」はどの教材にも入っている共通のステップ。
    # ここを絞ると、レッスンを1本足すたびに 400 になる（実際になった）。
    lesson_ids=AI_LESSON_IDS,
    system_prompt=BASE_RULES
    + """
やること: すでにある回答を、指定された方向に直す。

特に守ること:
- 直す方向として指定されたこと**だけ**を変える
- 元の回答に無い事実を足さない
- 「足りない情報を質問する」と指定されたときは、
  回答を書き直さず、確認したいことを箇条書きで返す
""",
    schema=TEXT_SCHEMA,
    fields=(
        ActionField("original_text", "元の回答", max_length=5000),
        ActionField("improvement", "直したい方向"),
        ActionField("instruction", "追加の条件", required=False),
    ),
    body_field="original_text",
    build=lambda v: _compose(
        "次の回答を直してください。",
        [
            ("直したい方向", v["improvement"]),
            ("追加の条件", v.get("instruction", "")),
        ],
        v["original_text"],
    ),
    tutor_message="一度で完成させる必要はありません。条件を足すたびに近づいていきます。",
    tutor_action="next",
)


ACTIONS: dict[str, Action] = {
    action.id: action
    for action in (
        REWRITE,
        SUMMARIZE,
        EXPLAIN,
        COMPARE,
        PLAN,
        BRAINSTORM,
        ORGANIZE,
        IMPROVE,
    )
}


def get_action(action_id: str) -> Action | None:
    return ACTIONS.get(action_id)


__all__ = [
    "ACTIONS",
    "Action",
    "ActionField",
    "BASE_RULES",
    "TEXT_SCHEMA",
    "get_action",
]
