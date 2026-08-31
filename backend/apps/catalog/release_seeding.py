"""第1リリースの2コースと追加Lessonを揃える。

教材本文はLessonに一度だけ持ち、複数コースでの再利用は
LearningPathLessonの参照で行う。何度実行しても同じ状態になる。
"""

from __future__ import annotations

from typing import Any

from apps.catalog.models import (
    AccessType,
    AvailabilityStatus,
    Course,
    Lesson,
    LessonStep,
    LessonTemplate,
    PublishStatus,
)

START_COURSE = "first_step_7days"
PRACTICAL_COURSE = "ai_practical"

#: AIスタートコースの STEP。
#:
#: 8本を平らに並べると、8回ぶんの一本道に見える。3つに束ねて名前を
#: 付けると「いま何をしている最中か」が言葉で分かる。
#:
#: 診断だけは別扱いにする。**コースの中の1日目ではない。**
#: 始める前に自分の現在地を見るもので、受けなくても Day1 から始められる。
#: Day として数に入れると、受けなかった人の進み具合が最初から欠ける。
STAGES = {
    "orientation": ("orientation", "現在地チェック"),
    "ask": ("ask", "AIに頼んでみる"),
    "think": ("think", "AIと考える"),
    "create": ("create", "AIで作る"),
}

#: AIスタートコースの並び。slug → (番号, 題, STEP)。
#:
#: 番号は画面の「Day n」。診断だけ 0 で、Day としては出さない。
#:
#: 「AIへの頼み方」(improve_answer) と「計画を立てる」(make_plan) は
#: ここから外した。**消してはいない**——本文も、それで覚えた技も
#: 残したまま AI活用コースへ移す（下の PRACTICAL_MOVED_IN）。
#: 消すと、終えた人の記録が行き先を失う。
START_CURRICULUM: dict[str, tuple[int, str, str]] = {
    "diagnosis": (0, "AI活用診断", "orientation"),
    "rewrite_text": (1, "文章を分かりやすくする", "ask"),
    "summarize_text": (2, "長い文章を短くまとめる", "ask"),
    "explain_topic": (3, "分からないことを説明してもらう", "ask"),
    "brainstorm_ideas": (4, "アイデアを広げる", "think"),
    "compare_options": (5, "選択肢を比較する", "think"),
    "organize_information": (6, "情報を整理して見やすくする", "think"),
    "image_generation": (7, "AIで画像を作る", "create"),
    "image_edit": (8, "画像を修正する", "create"),
}

#: AIスタートコースから AI活用コースへ移すもの。slug → (番号, 題)。
#:
#: 本文は完成していて、実務向けの並びには収まる。行き先ごと消すと、
#: 終えた人が自分の記録から開けなくなる。
PRACTICAL_MOVED_IN: dict[str, tuple[int, str]] = {
    "improve_answer": (7, "AIへの頼み方"),
    "make_plan": (8, "計画を立てる"),
}


def _lesson(
    slug: str,
    title: str,
    goal: str,
    action: str,
    source_key: str,
    source_text: str,
    quick_key: str,
    quick_options: list[dict[str, str]],
    defaults: dict[str, str],
    inputs: dict[str, str],
    *,
    thumbnail: str = "",
    minutes: int = 8,
    tags: list[str] | None = None,
    content: dict[str, Any] | None = None,
    step_rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """1本ぶんの取り込み内容。

    `content` を渡さない教材は、`_upsert_lesson` の共通の言い回しで通る。
    骨格が同じで本文だけ違う教材を何本も並べるための省き方で、
    **本気で書いた教材はここを埋める**（下の brainstorm_ideas）。

    `step_rows` は骨格が作らないステップ。教材だけの問いを
    「自分の課題」の直後へ差し込んだり、骨格の一歩を上書きしたりする。
    """
    return {
        "slug": slug,
        "title": title,
        "goal": goal,
        "action": action,
        "source_key": source_key,
        "sample_text": source_text,
        "quick_key": quick_key,
        "quick_options": quick_options,
        "quick_defaults": defaults,
        "inputs": inputs,
        "thumbnail": thumbnail,
        "minutes": minutes,
        "tags": tags or [],
        "content": content or {},
        "step_rows": step_rows or [],
    }


#: Day4「アイデアを広げる」で、自分のテーマに入ったあとに聞くこと。
#:
#: 技は、使う直前に出す
#: ------------------
#: 覚える技は4つ（発散・ロール指定・追加質問・反復）ある。骨格が続けて
#: 出せる解説は3枚までで、しかも**3枚続けると手を動かす前に解説を
#: 3画面読む**ことになる。だから発散だけを骨格に置き、残りは
#: それを実際に使う場面の直前へ移した。
#:
#: 解説を2枚続けて出さない。あいだに必ず手を動かす画面が入る:
#:
#:     【ロール指定】→ 立場を選ぶ → 【追加質問】→ 聞き返しを足す
#:     → 【反復】→ 送る
#:
#: 反復のあとに問いを置いていないのは、「一度で完璧を目指さなくていい」が
#: **送る直前にいちばん効く**ため（Day1 と同じ置き方）。
_BRAINSTORM_STEPS: list[dict[str, Any]] = [
    {
        # 骨格は「自分の文章」と言う。この回で入れるのは文章ではなく
        # **案を出したいテーマ**なので、言い換える。画面が文章と言い、
        # 教材の絵がアイデアと言う、というずれを残さない。
        #
        # 上書きは空でない項目だけが当たる（expand.py の `_assemble`）ので、
        # ここに書いていない注意書きや入力欄はそのまま残る。
        "placement": "override",
        "step_key": "real_task_intro",
        "title": "次は、自分のテーマで試してみましょう",
    },
    {
        "placement": "override",
        "step_key": "real_task",
        "title": "自分のテーマ",
    },
    {
        "placement": "override",
        "step_key": "real_task_result",
        "title": "自分のテーマの結果",
    },
    {
        "placement": "override",
        "step_key": "compare_results",
        "instruction": "最初の案・条件を足したあと、を見比べます。",
        "po_message": "数と方向を伝えると、案の幅そのものが変わります。",
    },
    {
        # 選択肢そのものは `condition_options`（下の content）で差し替える。
        # ここで直すのは言い回しだけ。
        "placement": "override",
        "step_key": "add_condition",
        "title": "案の数と方向性を足してみましょう",
        "instruction": "一度に一つだけ選ぶのがコツです。",
        "po_message": "数を増やすより、方向を散らすほうが効きます。",
        "po_emotion": "hint",
    },
    {
        "placement": "after_real_task",
        "step_key": "concept_role",
        "step_type": "concept_card",
        "phase": "own",
        "title": "ロール指定",
        "po_message": "どんな立場で考えてほしいかを伝えられます。",
        "po_emotion": "neutral",
        # 解説は必ず飛ばせる。読みたくない人を足止めしない
        "is_skippable": True,
        "card": {
            "title": "ロール指定",
            "body": (
                "「企画担当として」「現場の人として」と立場を伝えると、"
                "出てくる案が変わります。"
            ),
            "visual": "three_points",
            "points": ["企画担当", "現場の人", "はじめて来た人"],
            "reviewExample": {
                "body": "同じテーマでも、誰の目で見るかで気づくことが変わります。",
                "points": ["企画なら仕掛けから", "現場なら手間から", "新人なら分かりにくさから"],
            },
        },
    },
    {
        # 専用の `role` に置く。**`constraints` を流用しない。**
        # あちらは最初のお試しで既定値が入る欄で、そこへ立場を重ねると
        # 選ばなくても値が入っている状態になり、必須にしても素通りできる。
        "placement": "after_real_task",
        "step_key": "real_role",
        "step_type": "single_choice",
        "phase": "own",
        "title": "どんな立場で考えてもらいますか",
        "po_message": "立場を伝えると、出てくる案の向きが変わります。",
        "po_emotion": "question",
        "input_key": "role",
        "is_required": True,
        "options": [
            {"value": "企画担当として、仕掛けから考える", "label": "企画担当として"},
            {"value": "現場の人として、手間から考える", "label": "現場の人として"},
            {
                "value": "はじめて来た人として、分かりにくさから考える",
                "label": "はじめて来た人として",
            },
            {"value": "", "label": "そのほか", "free": True},
        ],
    },
    {
        "placement": "after_real_task",
        "step_key": "concept_followup",
        "step_type": "concept_card",
        "phase": "own",
        "title": "追加質問",
        "po_message": "出てきた案に、そのまま聞き返して大丈夫です。",
        "po_emotion": "hint",
        "is_skippable": True,
        "card": {
            "title": "追加質問",
            "body": "一度で決めなくても、聞き返しながら案を絞っていけます。",
            "visual": "simple_flow",
            "points": ["案を読む", "気になる所を言う", "もう一度もらう"],
            "reviewExample": {
                "body": "「もっと安く」「一つ詳しく」の一言で十分です。",
                "points": ["もっと安く", "一つ詳しく", "似た案は減らして"],
            },
        },
    },
    {
        # 答えなくても進める（required にしない）。聞き返しは送る前に
        # 添える形なので、無ければ依頼文に出ない（`_line` が空を落とす）。
        "placement": "after_real_task",
        "step_key": "real_followup",
        "step_type": "single_choice",
        "phase": "own",
        "title": "追加でお願いしたいことはありますか",
        "po_message": "無ければ「追加はしない」で進めます。",
        "po_emotion": "question",
        "input_key": "followup",
        "options": [
            {"value": "もっと費用のかからない案にして", "label": "もっと安く"},
            {"value": "気になる案を一つ詳しくして", "label": "一つ詳しく"},
            {"value": "似ている案は減らして", "label": "似た案は減らす"},
            {"value": "", "label": "追加はしない"},
        ],
    },
    {
        "placement": "after_real_task",
        "step_key": "concept_iteration",
        "step_type": "concept_card",
        "phase": "own",
        "title": "反復（Iteration）",
        "po_message": "一度で完璧を目指さなくて大丈夫です。",
        "po_emotion": "hint",
        "is_skippable": True,
        "card": {
            "title": "反復（Iteration）",
            "body": "結果を見てから足すほうが、はじめから細かく書くより近づきます。",
            "visual": "simple_flow",
            "points": ["まず送る", "案を見る", "条件を足す"],
            "reviewExample": {
                "body": "使えそうな案が一つ出れば、そこから広げ直せます。",
                "points": ["いいものを選ぶ", "その方向で増やす", "また選ぶ"],
            },
        },
    },
]


#: Day6「情報を整理して見やすくする」で、自分のメモに入ったあとに聞くこと。
#:
#: 覚える技は3つ（情報整理・分類・出力形式の指定）。情報整理だけを骨格に
#: 置き、残り2つは使う場面の直前へ移した。**技は、使う直前に出す。**
#:
#:     【分類】→ 分け方を選ぶ → 【出力形式の指定】→ 形を選ぶ → 送る
#:
#: 解説を2枚続けて出さない。あいだに必ず手を動かす画面が入る。
_ORGANIZE_STEPS: list[dict[str, Any]] = [
    {
        # 骨格は「自分の文章」と言う。この回で入れるのは文章ではなく
        # **散らかったメモ**なので、言い換える。画面が文章と言い、
        # 教材の絵がメモと言う、というずれを残さない。
        "placement": "override",
        "step_key": "real_task_intro",
        "title": "次は、自分のメモで試してみましょう",
    },
    {
        "placement": "override",
        "step_key": "real_task",
        "title": "自分のメモ",
    },
    {
        "placement": "override",
        "step_key": "real_task_result",
        "title": "自分のメモの結果",
    },
    {
        # 選択肢そのものは `condition_options` で差し替える。
        # ここで直すのは言い回しだけ。
        "placement": "override",
        "step_key": "add_condition",
        "title": "分け方を足してみましょう",
        "instruction": "一度に一つだけ選ぶのがコツです。",
        "po_message": "情報を減らさなくても、分けるだけで見やすくなります。",
        "po_emotion": "hint",
    },
    {
        "placement": "override",
        "step_key": "compare_results",
        "instruction": "整理前・1回目・分けたあと、の3つを見比べます。",
        "po_message": "情報の数は同じままです。変わったのは見つけやすさ。",
    },
    {
        "placement": "after_real_task",
        "step_key": "concept_classification",
        "step_type": "concept_card",
        "phase": "own",
        "title": "分類",
        "po_message": "似ているものをまとめると、全体が見えます。",
        "po_emotion": "neutral",
        # 解説は必ず飛ばせる。読みたくない人を足止めしない
        "is_skippable": True,
        "card": {
            "title": "分類",
            "body": "似ている情報をグループに分けると、全体が見えやすくなります。",
            "visual": "three_points",
            "points": ["仕事", "生活", "そのほか"],
            "reviewExample": {
                "body": "分け方は一つではありません。何を探したいかで決めます。",
                "points": ["急ぎ／あとで", "自分／人に頼む", "決まった／未定"],
            },
        },
    },
    {
        # 専用の `categories` に置く。最初のお試しでは埋めていないので
        # （見出しを決めずに通す回）、ここが素通りになることはない。
        "placement": "after_real_task",
        "step_key": "real_categories",
        "step_type": "single_choice",
        "phase": "own",
        "title": "どう分けますか",
        "po_message": "何を探したいかで、分け方を決めてください。",
        "po_emotion": "question",
        "input_key": "categories",
        "is_required": True,
        "options": [
            {"value": "仕事と生活", "label": "仕事／生活"},
            {"value": "急ぎとあとで", "label": "急ぎ／あとで"},
            {"value": "自分がやることと人に頼むこと", "label": "自分／人に頼む"},
            {"value": "決まったこととまだ決まっていないこと", "label": "決定／未定"},
            {"value": "", "label": "そのほか", "free": True},
        ],
    },
    {
        "placement": "after_real_task",
        "step_key": "concept_output_format",
        "step_type": "concept_card",
        "phase": "own",
        "title": "出力形式の指定",
        "po_message": "答え方も指定できます。",
        "po_emotion": "hint",
        "is_skippable": True,
        "card": {
            "title": "出力形式の指定",
            "body": "何を答えるかだけでなく、どう答えるかも指定できます。",
            "visual": "three_points",
            "points": ["3行で", "箇条書きで", "表で"],
            "reviewExample": {
                "body": "同じ中身でも、貼る先に合う形にするとそのまま使えます。",
                "points": ["共有なら箇条書き", "比べるなら表", "報告なら3行"],
            },
        },
    },
    {
        "placement": "after_real_task",
        "step_key": "real_format",
        "step_type": "single_choice",
        "phase": "own",
        "title": "どの形にしますか",
        "po_message": "これで最後の質問です。",
        "po_emotion": "question",
        "input_key": "format",
        "is_required": True,
        "options": [
            {"value": "見出しと箇条書き", "label": "見出しと箇条書き"},
            {"value": "表", "label": "表"},
            {"value": "番号つきの手順", "label": "番号つきの手順"},
            {"value": "3行のまとめ", "label": "3行のまとめ"},
        ],
    },
]


#: Day7「AIで画像を作る」で、自分の作りたい画像に入ったあとに聞くこと。
#:
#: 覚える技は4つ（画像プロンプト・スタイル指定・構図指定・反復）。
#: 画像プロンプトだけを骨格に置き、残りは使う場面の直前へ移した。
#:
#:     【スタイル指定】→ スタイルを選ぶ → 【構図指定】→ 構図を選ぶ
#:     → 【反復】→ 送る
#:
#: 反復のあとに問いを置いていないのは、「一度で完璧を目指さなくていい」が
#: 送る直前にいちばん効くため（Day1・Day4 と同じ置き方）。
_IMAGE_STEPS: list[dict[str, Any]] = [
    {
        # 骨格は「自分の文章」と言う。この回で入れるのは文章ではなく
        # **作りたい画像**なので、言い換える。
        "placement": "override",
        "step_key": "real_task_intro",
        "title": "次は、自分の作りたい画像で試してみましょう",
    },
    {
        "placement": "override",
        "step_key": "real_task",
        "title": "作りたい画像",
    },
    {
        "placement": "override",
        "step_key": "real_task_result",
        "title": "作りたい画像の結果",
    },
    {
        # 選択肢そのものは `condition_options` で差し替える。
        # ここで直すのは言い回しだけ。
        "placement": "override",
        "step_key": "add_condition",
        "title": "条件を一つ足してみましょう",
        "instruction": "一度に一つだけ選ぶのがコツです。",
        "po_message": "具体的に伝えるほど、欲しいイメージに近づきます。",
        "po_emotion": "hint",
    },
    {
        "placement": "override",
        "step_key": "compare_results",
        "instruction": "最初の1枚・条件を足したあと、を見比べます。",
        "po_message": "被写体の具体さと、構図・スタイルで変わります。",
    },
    {
        "placement": "after_real_task",
        "step_key": "concept_style",
        "step_type": "concept_card",
        "phase": "own",
        "title": "スタイル指定",
        "po_message": "同じ内容でも、スタイルで印象が大きく変わります。",
        "po_emotion": "neutral",
        # 解説は必ず飛ばせる。読みたくない人を足止めしない
        "is_skippable": True,
        "card": {
            "title": "スタイル指定",
            "body": "画像の見た目や雰囲気を決められます。",
            "visual": "three_points",
            "points": ["写真風", "イラスト風", "水彩風"],
            "reviewExample": {
                "body": "同じ場所でも、スタイルを変えると別の伝わり方になります。",
                "points": ["写真風は現実感", "イラスト風は親しみ", "水彩風はやわらかさ"],
            },
        },
    },
    {
        "placement": "after_real_task",
        "step_key": "real_style",
        "step_type": "single_choice",
        "phase": "own",
        "title": "どのスタイルにしますか",
        "po_message": "迷ったら写真風で大丈夫です。あとから変えられます。",
        "po_emotion": "question",
        "input_key": "style",
        "is_required": True,
        "options": [
            {"value": "写真風", "label": "写真風"},
            {"value": "イラスト風", "label": "イラスト風"},
            {"value": "水彩風", "label": "水彩風"},
            {"value": "", "label": "そのほか", "free": True},
        ],
    },
    {
        "placement": "after_real_task",
        "step_key": "concept_composition",
        "step_type": "concept_card",
        "phase": "own",
        "title": "構図指定",
        "po_message": "見せ方まで伝えると、欲しい画像に近づきます。",
        "po_emotion": "hint",
        "is_skippable": True,
        "card": {
            "title": "構図指定",
            "body": "何を、どこから、どの大きさで見せるかを決められます。",
            "visual": "three_points",
            "points": ["正面", "俯瞰", "クローズアップ"],
            "reviewExample": {
                "body": "同じ被写体でも、どこから見るかで伝わることが変わります。",
                "points": ["正面は全体", "俯瞰は並び", "クローズアップは質感"],
            },
        },
    },
    {
        "placement": "after_real_task",
        "step_key": "real_composition",
        "step_type": "single_choice",
        "phase": "own",
        "title": "どの構図にしますか",
        "po_message": "これで最後の質問です。",
        "po_emotion": "question",
        "input_key": "composition",
        "is_required": True,
        "options": [
            {"value": "正面から", "label": "正面から"},
            {"value": "真上から（俯瞰）", "label": "俯瞰"},
            {"value": "近くに寄って（クローズアップ）", "label": "クローズアップ"},
            {"value": "", "label": "そのほか", "free": True},
        ],
    },
    {
        "placement": "after_real_task",
        "step_key": "concept_iteration",
        "step_type": "concept_card",
        "phase": "own",
        "title": "反復（Iteration）",
        "po_message": "一度で完璧を目指さなくて大丈夫です。",
        "po_emotion": "hint",
        "is_skippable": True,
        "card": {
            "title": "反復（Iteration）",
            "body": "結果を見てから足すほうが、はじめから細かく書くより近づきます。",
            "visual": "simple_flow",
            "points": ["まず作る", "見てみる", "条件を足す"],
            "reviewExample": {
                "body": "画像はとくに、1枚目を見てからのほうが言葉にしやすくなります。",
                "points": ["1枚目を見る", "違う所を言う", "もう一度作る"],
            },
        },
    },
]


#: Day7「AIで画像を作る」。**まだ開けない。**
#:
#: 本文とステップは揃えてある。足りないのは画像を作る口だけで、
#: それは費用の見通しを立ててから開ける（docs/image-lessons.md）。
#: 画像1枚は文章1回の数十倍かかり、レッスン1本で最低2枚生成する。
#:
#: `action` を空にしてあるのは、**無い口の名前を書かない**ため。
#: それらしい名前を置くと「あるのに動かない」に見え、公開の検査
#: （catalog/validation.py）も素通りする。空なら検査が
#: 「AIへの頼み方がありません」と名指しで止める——残りの仕事はそれ1つ。
IMAGE_GENERATION = _lesson(
    "image_generation",
    "AIで画像を作る",
    "作りたいものを言葉で伝えて、思ったイメージへ近づけられるようになる",
    "",
    "subject",
    "カフェ",
    "subject",
    [
        {"value": "カフェ", "label": "カフェ"},
        {"value": "部屋", "label": "部屋"},
        {"value": "食べ物", "label": "食べ物"},
    ],
    {"style": "写真風", "composition": "正面から"},
    {},
    thumbnail="/assets/final-thumbnails/start_07.webp",
    tags=["image"],
    content={
        "availability_status": AvailabilityStatus.COMING_SOON,
        "coming_soon_message": "画像を作る仕組みを準備しています",
        "outcome_title": "欲しいイメージを言葉で伝えて、画像を作る",
        "outcome_description": "被写体・場所・雰囲気・スタイルを足して近づけます。",
        "before_example": "カフェの画像",
        "after_example": (
            "青空の下にある、白い外壁の小さなカフェ。正面構図。明るい写真風。"
        ),
        "learned_skills": ["画像プロンプト", "スタイル指定", "構図指定", "反復"],
        "outcomes": ["言葉から画像を作れる", "修正してイメージへ近づけられる"],
        "quick_title": "何の画像を作りますか？",
        "quick_instruction": "ひとつ選ぶと、短い言葉のまま1枚作ります。",
        "working": "言葉から画像を作っています。",
        # 共通の選択肢（もっと短く・もっと丁寧に）は文章を直す言い回しで、
        # 画像には当たらない。被写体・場所・雰囲気・スタイルに差し替える。
        "condition_options": [
            {"value": "白い外壁の小さな建物にして", "label": "被写体をくわしく"},
            {"value": "青空の下、海の見える場所にして", "label": "場所を足す"},
            {"value": "明るく開放的な雰囲気にして", "label": "雰囲気を足す"},
            {"value": "明るい写真風にして", "label": "スタイルを足す"},
            {"value": "", "label": "自分で条件を追加", "free": True},
        ],
        "observation_options": [
            {"value": "イメージに近づいた", "label": "イメージに近づいた"},
            {"value": "雰囲気が変わった", "label": "雰囲気が変わった"},
            {"value": "見せ方が変わった", "label": "見せ方が変わった"},
            {"value": "まだ違う", "label": "まだ違う"},
            {"value": "よく分からない", "label": "よく分からない"},
        ],
        # 骨格が続けて出す解説は1枚だけ。残り3つは使う直前へ移した
        # （上の _IMAGE_STEPS）。
        "concept_cards": [
            {
                "title": "画像プロンプト",
                "body": "頭の中のイメージを、具体的な言葉にして渡します。",
                "visual": "three_points",
                "points": ["被写体", "場所", "雰囲気"],
                "reviewExample": {
                    "body": "足りない言葉があるほど、AIは一般的な絵を返します。",
                    "points": ["何を", "どこで", "どんな空気で"],
                },
            },
        ],
        "review_points": [
            "思っていたものと、どこが違うか",
            "足りない言葉はどれか",
            "人の顔や商標が入っていないか",
        ],
        "real_task_label": "作りたい画像を、ひとつ言葉にしてみましょう。",
        "real_task_placeholder": "例）資料の表紙に使う、机の上の写真",
        "takeaway": (
            "具体的に伝えるほど、欲しいイメージに近づくことを"
            "確かめられましたね。"
        ),
        "next_suggestion": "次は「画像を修正する」で、出てきた画像を直してみましょう。",
    },
    step_rows=_IMAGE_STEPS,
)


#: Day8「画像を修正する」で、直したい画像に入ったあとに聞くこと。
#:
#: この回だけ、比べる図が2枚ある
#: --------------------------
#: 骨格が作る比べる画面（compare_results）は1つだけ。2枚目
#: （compare_15「直す場所を絞ると、他を残せる」）は、部分修正を
#: 使ったすぐ後に置きたいので、解説の一歩として差し込む。
#:
#: そのままだと反復の解説と隣り合うので、あいだに「どう変えますか」を
#: 置いた。絵の中の流れ（①画像を選ぶ ②箇所を示す ③変更を伝える
#: ④確認する）とも合う——**箇所と変更は別のこと**として聞く。
#:
#:     【部分修正】→ どこを直す → 【他は残せる】→ どう変える
#:     → 【反復】→ 送る
_IMAGE_EDIT_STEPS: list[dict[str, Any]] = [
    {
        "placement": "override",
        "step_key": "real_task_intro",
        "title": "次は、自分の直したい画像で試してみましょう",
    },
    {
        "placement": "override",
        "step_key": "real_task",
        "title": "直したい画像",
    },
    {
        "placement": "override",
        "step_key": "real_task_result",
        "title": "直したい画像の結果",
    },
    {
        # 選択肢そのものは `condition_options` で差し替える。
        # ここで直すのは言い回しだけ。
        "placement": "override",
        "step_key": "add_condition",
        "title": "直したいことを一つ伝えてみましょう",
        "instruction": "一度に一つだけ選ぶのがコツです。",
        "po_message": "全部を作り直さなくても、変えたい所だけ直せます。",
        "po_emotion": "hint",
    },
    {
        "placement": "override",
        "step_key": "compare_results",
        "instruction": "元画像・1回目・直したあと、を見比べます。",
        "po_message": "変えたい所だけが変わって、ほかは残っているか見てみましょう。",
    },
    {
        "placement": "after_real_task",
        "step_key": "concept_partial",
        "step_type": "concept_card",
        "phase": "own",
        "title": "部分修正",
        "po_message": "画像の特定の部分だけを選んで変えられます。",
        "po_emotion": "neutral",
        # 解説は必ず飛ばせる。読みたくない人を足止めしない
        "is_skippable": True,
        "card": {
            "title": "部分修正",
            "body": "全部を変えず、必要な場所だけを直せます。",
            "visual": "three_points",
            "points": ["空", "人物", "背景"],
            "reviewExample": {
                "body": "場所を言えるほど、ほかを触られずに済みます。",
                "points": ["空だけ", "人物だけ", "看板の文字だけ"],
            },
        },
    },
    {
        "placement": "after_real_task",
        "step_key": "real_area",
        "step_type": "single_choice",
        "phase": "own",
        "title": "どこを直しますか",
        "po_message": "場所を先に決めます。変え方は次に聞きます。",
        "po_emotion": "question",
        "input_key": "area",
        "is_required": True,
        "options": [
            {"value": "空", "label": "空"},
            {"value": "背景", "label": "背景"},
            {"value": "写っている人", "label": "写っている人"},
            {"value": "色みぜんたい", "label": "色みぜんたい"},
            {"value": "", "label": "そのほか", "free": True},
        ],
    },
    {
        # 比べる図の2枚目。骨格の比べる画面は1つしか無いので、
        # 部分修正を使ったすぐ後に、解説の一歩として置く。
        "placement": "after_real_task",
        "step_key": "concept_partial_result",
        "step_type": "concept_card",
        "phase": "own",
        "title": "ほかは残せる",
        "po_message": "直す場所を絞ると、それ以外はそのまま残ります。",
        "po_emotion": "talking",
        "is_skippable": True,
        "card": {
            "title": "ほかは残せる",
            "body": "直したい場所を絞ると、他を残したまま修正できます。",
            "visual": "before_after",
            "before": "全部を作り直す（雰囲気も構図も変わってしまう）",
            "after": "人物だけ消す（背景・色・構図はそのまま）",
            "reviewExample": {
                "body": "変わっていない所を確かめると、指示が効いたか分かります。",
                "before": "どこが変わったか分からない",
                "after": "変えた所だけが変わっている",
            },
        },
    },
    {
        "placement": "after_real_task",
        "step_key": "real_instruction",
        "step_type": "single_choice",
        "phase": "own",
        "title": "どう変えますか",
        "po_message": "選んだ場所を、どうしたいかを伝えます。",
        "po_emotion": "question",
        "input_key": "instruction",
        "is_required": True,
        "options": [
            {"value": "夕焼けに変えて", "label": "夕焼けに変える"},
            {"value": "消して", "label": "消す"},
            {"value": "明るくして", "label": "明るくする"},
            {"value": "落ち着いた色にして", "label": "落ち着いた色にする"},
            {"value": "", "label": "そのほか", "free": True},
        ],
    },
    {
        "placement": "after_real_task",
        "step_key": "concept_iteration",
        "step_type": "concept_card",
        "phase": "own",
        "title": "反復（Iteration）",
        "po_message": "一度で完璧を目指さなくて大丈夫です。",
        "po_emotion": "hint",
        "is_skippable": True,
        "card": {
            "title": "反復（Iteration）",
            "body": "結果を見てから足すほうが、はじめから細かく書くより近づきます。",
            "visual": "simple_flow",
            "points": ["まず直す", "見てみる", "もう一つ直す"],
            "reviewExample": {
                "body": "一度に何か所も頼むと、どれが効いたか分からなくなります。",
                "points": ["1か所ずつ", "見て確かめる", "また1か所"],
            },
        },
    },
]


#: Day8「画像を修正する」。**まだ開けない。**
#:
#: Day7 と同じ理由（docs/image-lessons.md）。`action` を空にしてある
#: のも同じで、無い口の名前を書かないため。残っている仕事を
#: 公開の検査に名指しさせる。
IMAGE_EDIT = _lesson(
    "image_edit",
    "画像を修正する",
    "変えたい部分だけをAIへ伝えて、画像を直せるようになる",
    "",
    "source_image",
    "湖のほとりのカフェの写真",
    # 最初のお試しで選んだ場所は、あとの `real_area` へそのまま持ち越す
    # （Day1 の「誰が読みますか」と同じ形）。別のキーにすると、
    # 一度選んだのにもう一度ゼロから聞かれる。
    "area",
    [
        {"value": "空", "label": "空を変える"},
        {"value": "背景", "label": "背景を変える"},
        {"value": "写っている人", "label": "人を消す"},
    ],
    {"instruction": "夕焼けに変えて"},
    {},
    thumbnail="/assets/final-thumbnails/start_08.webp",
    tags=["image"],
    content={
        "availability_status": AvailabilityStatus.COMING_SOON,
        "coming_soon_message": "画像を作る仕組みを準備しています",
        "outcome_title": "変えたい部分だけをAIへ伝えて、画像を直す",
        "outcome_description": "全部を作り直さず、直したい所だけを言葉で伝えます。",
        "before_example": "湖のほとりのカフェの写真（青空）",
        "after_example": "空だけ夕焼けに変えた写真（カフェも人もそのまま）",
        "learned_skills": ["画像編集指示", "部分修正", "反復"],
        "outcomes": [
            "画像を作り直さず修正できる",
            "指示を重ねて完成形へ近づけられる",
        ],
        "quick_title": "どこを直してみますか？",
        "quick_instruction": "ひとつ選ぶと、すぐにAIが直します。",
        "working": "指定された所だけを直しています。",
        # 共通の選択肢（もっと短く・もっと丁寧に）は文章を直す言い回しで、
        # 画像には当たらない。画像への直し方に差し替える。
        "condition_options": [
            {"value": "空だけ夕焼けに変えて", "label": "空を夕焼けに"},
            {"value": "写っている人を消して", "label": "人を消す"},
            {"value": "全体を明るくして", "label": "明るくする"},
            {"value": "落ち着いた色みにして", "label": "色を落ち着かせる"},
            {"value": "", "label": "自分で直し方を追加", "free": True},
        ],
        "observation_options": [
            {"value": "頼んだ所だけ変わった", "label": "頼んだ所だけ変わった"},
            {"value": "ほかも変わってしまった", "label": "ほかも変わった"},
            {"value": "イメージに近づいた", "label": "イメージに近づいた"},
            {"value": "まだ違う", "label": "まだ違う"},
            {"value": "よく分からない", "label": "よく分からない"},
        ],
        # 骨格が続けて出す解説は1枚だけ。残りは使う直前へ移した
        # （上の _IMAGE_EDIT_STEPS）。
        "concept_cards": [
            {
                "title": "画像編集指示",
                "body": "画像全体を作り直さず、変えたいことだけを伝えます。",
                "visual": "before_after",
                "before": "もう一度、いい感じに作って",
                "after": "空を夕焼けに変えて",
                "reviewExample": {
                    "body": "作り直すと、気に入っていた所まで変わってしまいます。",
                    "before": "全部作り直す",
                    "after": "変えたい所だけ言う",
                },
            },
        ],
        "review_points": [
            "頼んでいない所まで変わっていないか",
            "変えたい所が本当に変わったか",
            "人の顔や商標が入っていないか",
        ],
        "real_task_label": "直したい画像について、どこをどうしたいか書いてみましょう。",
        "real_task_placeholder": "例）先週撮った店の写真の、曇り空が気になる",
        "takeaway": (
            "全部を作り直さなくても、変えたい部分だけ直せることを"
            "確かめられましたね。"
        ),
        "next_suggestion": "コースはここまでです。作ったものはマイ成果物から見返せます。",
    },
    step_rows=_IMAGE_EDIT_STEPS,
)


ADDED_LESSONS = (
    _lesson(
        "brainstorm_ideas",
        "アイデアを広げる",
        "数と方向性を伝えて、自分では出ない案まで広げられるようになる",
        "brainstorm",
        "topic",
        "社内の交流を増やす小さな企画",
        "audience",
        [
            {"value": "同じ部署の人", "label": "同じ部署"},
            {"value": "会社全体", "label": "会社全体"},
            {"value": "お客様", "label": "お客様"},
        ],
        # 立場（role）はここに入れない。入れると、あとで必ず答える
        # 質問に既定値が先に入り、選ばずに進めてしまう。
        {"constraints": "費用をかけず、30分以内", "count": "5個"},
        {
            "source_text": "topic",
            "audience": "audience",
            "role": "role",
            "constraints": "constraints",
            "count": "count",
            "followup": "instruction",
        },
        thumbnail="/assets/final-thumbnails/start_04.webp",
        tags=["ideas", "planning"],
        minutes=8,
        content={
            "outcome_title": "1つのアイデアから、複数の案を広げる",
            "outcome_description": "数と方向性を伝えて、自分だけでは出ない案まで出します。",
            "before_example": "社内の交流を増やす小さな企画",
            "after_example": (
                "・昼休みの15分お茶会\n"
                "・部署をまたいだ雑談チャンネル\n"
                "・仕事の道具を紹介し合う会\n"
                "・入社月が同じ人の集まり\n"
                "・失敗談を共有する短い会"
            ),
            "learned_skills": ["発散", "ロール指定", "追加質問", "反復"],
            "outcomes": [
                "自分だけでは思いつかない案を出せる",
                "アイデアを複数の方向へ広げられる",
            ],
            "quick_title": "誰に向けた企画にしますか？",
            "quick_instruction": "ひとつ選ぶと、すぐにAIが案を出します。",
            "working": "いろいろな方向の案を出しています。",
            # 共通の選択肢（もっと短く・もっと丁寧に）は文章を直す言い回しで、
            # 案の束には当たらない。数と方向性を足す一歩に差し替える。
            "condition_options": [
                {"value": "方向性が違う案を10個出して", "label": "方向を散らして10個"},
                {"value": "費用をかけない案を増やして", "label": "費用をかけない案"},
                {"value": "すぐ試せる小さい案にして", "label": "すぐ試せる小さい案"},
                {"value": "ふだん出ないような案も混ぜて", "label": "変わった案も混ぜる"},
                {"value": "", "label": "自分で条件を追加", "free": True},
            ],
            "observation_options": [
                {"value": "案が増えた", "label": "案が増えた"},
                {"value": "方向がばらけた", "label": "方向がばらけた"},
                {"value": "自分では出ない案があった", "label": "自分では出ない案"},
                {"value": "似た案が多い", "label": "似た案が多い"},
                {"value": "よく分からない", "label": "よく分からない"},
            ],
            # 骨格が続けて出す解説は1枚だけ。残り3つは使う直前へ移した
            # （上の _BRAINSTORM_STEPS）。
            "concept_cards": [
                {
                    "title": "発散",
                    "body": "最初から正解を探さず、まず選択肢を増やします。",
                    "visual": "three_points",
                    "points": ["数を出す", "方向を散らす", "選ぶのは後"],
                    "reviewExample": {
                        "body": "選ぶ前に広げておくと、選べる幅そのものが変わります。",
                        "points": ["10個出す", "違う方向で", "そこから選ぶ"],
                    },
                },
            ],
            "review_points": [
                "似た案の言い換えになっていないか",
                "自分では出なかった方向があるか",
                "そのまま試せる大きさか",
            ],
            "real_task_label": "いま案を出したいことを、ひとつ入れてみましょう。",
            "real_task_placeholder": "例）チームの朝会をもう少し役に立つものにしたい",
            "takeaway": (
                "数と方向を伝えると、自分だけでは出ない案まで届くことを"
                "確かめられましたね。"
            ),
            "next_suggestion": "次は「選択肢を比較する」で、広げた案から選んでみましょう。",
        },
        step_rows=_BRAINSTORM_STEPS,
    ),
    _lesson(
        "organize_information",
        "情報を整理する",
        "バラバラな情報を、分けて見やすい形に変えられるようになる",
        "organize",
        "original_text",
        "来週会議。資料修正。ホテル予約。見積確認。旅行予定。メール返信。",
        "purpose",
        [
            {"value": "チームで共有する", "label": "チームで共有"},
            {"value": "自分のやることを見渡す", "label": "やることを見渡す"},
            {"value": "抜けが無いか確かめる", "label": "抜けを確かめる"},
        ],
        # 見出し（categories）はここに入れない。**最初の1回は分けずに通す。**
        # 分けると見やすくなることを、その差で見せる回なので、先に
        # 埋めてしまうと次の一歩で何も変わらない。
        {"format": "見出しと箇条書き"},
        {
            "source_text": "original_text",
            "purpose": "purpose",
            "categories": "categories",
            "format": "format",
        },
        thumbnail="/assets/final-thumbnails/start_06.webp",
        tags=["organizing", "research"],
        content={
            "outcome_title": "バラバラなメモを、パッと分かる形に変える",
            "outcome_description": "似ているものをまとめて、見たい形で並べ直します。",
            "before_example": (
                "来週会議。資料修正。ホテル予約。見積確認。旅行予定。メール返信。"
            ),
            "after_example": (
                "【仕事】\n"
                "・来週会議\n"
                "・資料修正\n"
                "・見積確認\n"
                "・メール返信\n"
                "【生活】\n"
                "・ホテル予約\n"
                "・旅行予定"
            ),
            "learned_skills": ["情報整理", "分類", "出力形式の指定"],
            "outcomes": ["情報を構造化できる", "パッと見て分かる形に変えられる"],
            "quick_title": "この情報を何に使いますか？",
            "quick_instruction": "ひとつ選ぶと、すぐにAIが整理します。",
            "working": "情報を並べ直しています。",
            # 共通の選択肢（もっと短く・もっと丁寧に）は文章を直す言い回しで、
            # バラバラのメモには当たらない。分け方を足す一歩に差し替える。
            "condition_options": [
                {"value": "仕事と生活のカテゴリーに分けて", "label": "仕事／生活で分ける"},
                {"value": "急ぎとあとでのカテゴリーに分けて", "label": "急ぎ／あとで分ける"},
                {"value": "自分がやることと人に頼むことに分けて", "label": "自分／人で分ける"},
                {"value": "", "label": "自分で分け方を追加", "free": True},
            ],
            "observation_options": [
                {"value": "見つけやすくなった", "label": "見つけやすくなった"},
                {"value": "同じ仲間がまとまった", "label": "仲間がまとまった"},
                {"value": "抜けに気づいた", "label": "抜けに気づいた"},
                {"value": "情報の数は同じ", "label": "情報の数は同じ"},
                {"value": "よく分からない", "label": "よく分からない"},
            ],
            # 骨格が続けて出す解説は1枚だけ。残り2つは使う直前へ移した
            # （下の _ORGANIZE_STEPS）。
            "concept_cards": [
                {
                    "title": "情報整理",
                    "body": "情報を減らさなくても、並べ直すだけで分かりやすくなります。",
                    "visual": "three_points",
                    "points": ["集める", "並べ直す", "見やすくなる"],
                    "reviewExample": {
                        "body": "捨てるのではなく、置き場所を決めるのが整理です。",
                        "points": ["情報の数は同じ", "置き場所が決まる", "探せるようになる"],
                    },
                },
            ],
            "review_points": [
                "元に無い内容が足されていないか",
                "どの見出しにも入らないものが残っていないか",
                "あとから探せる形になっているか",
            ],
            "real_task_label": "いま散らかっているメモを、そのまま入れてみましょう。",
            "real_task_placeholder": "例）思いついた順に書いたやることリスト",
            "takeaway": (
                "分けるだけで、情報を減らさずに見やすくできることを"
                "確かめられましたね。"
            ),
            "next_suggestion": "次は「AIで画像を作る」に進みましょう。",
        },
        step_rows=_ORGANIZE_STEPS,
    ),
    _lesson(
        "organize_meeting",
        "会議の内容を整理する",
        "会議メモを、決定事項・担当・期限に整理できるようになる",
        "organize",
        "original_text",
        "来月の展示会。田中さんが会場へ確認。資料は金曜までに佐藤さんが初稿を作る。予算は次回確認。",
        "purpose",
        [
            {"value": "参加者へ共有する", "label": "参加者へ共有"},
            {"value": "上司へ報告する", "label": "上司へ報告"},
            {"value": "自分のタスクを確認する", "label": "自分のタスク"},
        ],
        {"categories": "決定事項・担当・期限・未決事項", "format": "箇条書き"},
        {
            "source_text": "original_text",
            "purpose": "purpose",
            "categories": "categories",
            "format": "format",
        },
        tags=["meeting", "organizing"],
        thumbnail="/assets/final-thumbnails/practical_03.webp",
    ),
    _lesson(
        "work_email_chat",
        "メールやチャットを作る",
        "相手と目的を伝え、そのまま送れる文章を作れるようになる",
        "rewrite",
        "original_text",
        "来週の打ち合わせを火曜か水曜に変更したい。都合を確認したい。",
        "audience",
        [
            {"value": "上司", "label": "上司"},
            {"value": "同僚", "label": "同僚"},
            {"value": "顧客", "label": "顧客"},
        ],
        {"tone": "ていねいに", "length": "短め"},
        {
            "source_text": "original_text",
            "audience": "audience",
            "tone": "tone",
            "length": "length",
        },
        thumbnail="/assets/final-thumbnails/practical_02.webp",
        tags=["writing", "email"],
    ),
    _lesson(
        "extract_needed_info",
        "長い資料から必要な情報を抜き出す",
        "立場と目的を指定し、必要な情報だけを取り出せるようになる",
        "summarize",
        "original_text",
        "新制度は10月開始。申請は各部署の責任者が月末までに行う。対象は正社員と契約社員。詳しい操作説明会は9月15日。",
        "purpose",
        [
            {"value": "自分がやることを知るため", "label": "自分の作業"},
            {"value": "上司へ共有するため", "label": "上司へ共有"},
            {"value": "日付だけ確認するため", "label": "日付を確認"},
        ],
        {"format": "必要な点を箇条書き", "length": "5行以内"},
        {
            "source_text": "original_text",
            "purpose": "purpose",
            "format": "format",
            "length": "length",
        },
        thumbnail="/assets/final-thumbnails/practical_04.webp",
        tags=["summarizing", "documents"],
    ),
    _lesson(
        "organize_research",
        "リサーチ結果を整理する",
        "集めた情報を観点別に整理し、不明点を残せるようになる",
        "organize",
        "original_text",
        "A案は導入が早い。B案は費用が低い。A案の保守費は未確認。利用者からは操作性を重視する声が多い。",
        "purpose",
        [
            {"value": "比較材料にする", "label": "比較材料"},
            {"value": "報告書にする", "label": "報告書"},
            {"value": "追加調査を決める", "label": "追加調査"},
        ],
        {"categories": "分かったこと・未確認・次に調べること", "format": "見出しと箇条書き"},
        {
            "source_text": "original_text",
            "purpose": "purpose",
            "categories": "categories",
            "format": "format",
        },
        tags=["research", "organizing"],
        thumbnail="/assets/final-thumbnails/practical_05.webp",
    ),
    _lesson(
        "make_document_outline",
        "資料の構成を作る",
        "目的と期限から、資料作成の順番と構成を作れるようになる",
        "plan",
        "goal",
        "新しい社内制度を5分で説明する資料を作る",
        "deadline",
        [
            {"value": "今日中", "label": "今日中"},
            {"value": "今週中", "label": "今週中"},
            {"value": "1か月", "label": "1か月"},
        ],
        {"available_time": "1日30分", "avoid": "専門用語を増やさない"},
        {
            "source_text": "goal",
            "deadline": "deadline",
            "available_time": "available_time",
            "avoid": "avoid",
        },
        thumbnail="/assets/final-thumbnails/practical_10.webp",
        tags=["planning", "documents"],
    ),
    _lesson(
        "transcription_use",
        "文字起こしを活用する",
        "文字起こし結果から、要点と次の行動をまとめられるようになる",
        "summarize",
        "original_text",
        "ええと、次回は木曜で。資料は前日までに共有します。担当は私です。あと会場はまだ決まっていません。",
        "purpose",
        [
            {"value": "議事録にするため", "label": "議事録"},
            {"value": "タスクを確認するため", "label": "タスク確認"},
            {"value": "人へ共有するため", "label": "共有文"},
        ],
        {"format": "決定・担当・期限・未決を箇条書き", "length": "8行以内"},
        {
            "source_text": "original_text",
            "purpose": "purpose",
            "format": "format",
            "length": "length",
        },
        tags=["meeting", "summarizing"],
        thumbnail="/assets/final-thumbnails/start_09.webp",
    ),
)


def _upsert_lesson(course: Course, number: int, entry: dict[str, Any]) -> Lesson:
    """1本を DB へ。`content` を書いた教材は、共通の言い回しをそこで上書きする。

    共通の言い回しは「骨格が同じで本文だけ違う教材」を並べるための
    埋め草で、そのままでは全レッスンが同じ解説を出す。書いた教材は
    `content` を持ち、こちらが後から当たる。
    """
    content: dict[str, Any] = entry.get("content") or {}
    lesson, _ = Lesson.objects.update_or_create(
        slug=entry["slug"],
        defaults={
            "course": course,
            "number": number,
            "title": entry["title"],
            "goal": entry["goal"],
            "template": LessonTemplate.OUTCOME_FIRST,
            "outcome_title": entry["title"],
            "outcome_description": entry["goal"],
            "estimated_minutes": entry["minutes"],
            "before_example": entry["sample_text"],
            "after_example": "目的に合わせて、読みやすい形に整理された結果",
            "learned_skills": [entry["goal"]],
            "outcomes": [entry["goal"]],
            "tags": entry["tags"],
            "thumbnail": entry["thumbnail"],
            "uses_ai": True,
            "ai_action": {"action": entry["action"], "inputs": entry["inputs"]},
            "sample_text": entry["sample_text"],
            "quick_title": "まず、使う場面を1つ選びます",
            "quick_instruction": "いちばん近いものを選んでください。",
            "quick_key": entry["quick_key"],
            "quick_options": entry["quick_options"],
            "quick_defaults": entry["quick_defaults"],
            "working": "条件に合わせて、AIが結果を作っています。",
            "observation_options": [
                {"value": "見やすくなった", "label": "見やすくなった"},
                {"value": "要点が分かった", "label": "要点が分かった"},
                {"value": "まだ直したい", "label": "まだ直したい"},
            ],
            "concept_cards": [
                {
                    "title": "目的を先に伝える",
                    "body": "同じ情報でも、誰が何に使うかで必要な形は変わります。",
                    "visual": "highlight",
                    "highlight": "何に使うか",
                },
                {
                    "title": "形も指定する",
                    "body": "見出しや箇条書きを指定すると、そのまま確認しやすくなります。",
                    "visual": "text",
                },
            ],
            "review_points": ["元にない内容が足されていない", "目的に合う形になっている"],
            "real_task_label": "自分の内容を入れて試してください。",
            "real_task_placeholder": "ここに自分の内容を入力",
            "takeaway": "目的・相手・出力の形を伝えると、仕事で使える結果に近づきます。",
            "next_suggestion": "できました。次のLessonでも同じ考え方を使えます。",
            "status": PublishStatus.PUBLISHED,
            "availability_status": AvailabilityStatus.AVAILABLE,
            "sort_order": number,
            **content,
        },
    )
    if lesson.published_at is None:
        lesson.mark_published()
        lesson.save(update_fields=["published_at"])

    _sync_step_rows(lesson, entry.get("step_rows") or [])
    return lesson


def _sync_step_rows(lesson: Lesson, rows: list[dict[str, Any]]) -> None:
    """骨格が作らないステップを、この教材の行として置き直す。

    毎回まるごと入れ替える。差分で当てると、行を1つ減らしたときに
    前の実行で作った行が残り、**教材から消したはずの画面が出続ける。**
    """
    lesson.steps.all().delete()
    for order, row in enumerate(rows):
        LessonStep.objects.create(
            lesson=lesson,
            sort_order=order,
            placement=row["placement"],
            step_key=row["step_key"],
            step_type=row.get("step_type", ""),
            phase=row.get("phase", ""),
            title=row.get("title", ""),
            instruction=row.get("instruction", ""),
            po_message=row.get("po_message", ""),
            po_emotion=row.get("po_emotion", ""),
            input_key=row.get("input_key", ""),
            options=row.get("options", []),
            card=row.get("card", {}),
            meta=row.get("meta", {}),
            is_required=row.get("is_required"),
            is_skippable=row.get("is_skippable"),
        )


def seed_first_release(*, only_new: bool = False) -> tuple[Course, Course]:
    if only_new:
        return (
            Course.objects.get(slug=START_COURSE),
            Course.objects.get(slug=PRACTICAL_COURSE),
        )
    start = Course.objects.get(slug=START_COURSE)
    start.title = "AIスタートコース"
    start.description = "AIを仕事や日常で使う基本を、1日ひとつずつ身につけます。"
    start.outcome = (
        "文章・要約・整理・比較・画像まで、AIを仕事や日常で使う基本が身につきます。"
    )
    start.access_type = AccessType.FREE
    start.status = PublishStatus.PUBLISHED
    start.availability_status = AvailabilityStatus.AVAILABLE
    start.sort_order = 0
    start.save()

    start_thumbnails = {
        "rewrite_text": "/assets/final-thumbnails/start_01.webp",
        "summarize_text": "/assets/final-thumbnails/start_02.webp",
        "explain_topic": "/assets/final-thumbnails/start_03.webp",
        "compare_options": "/assets/final-thumbnails/start_05.webp",
    }
    for slug, thumbnail in start_thumbnails.items():
        Lesson.objects.filter(slug=slug).update(thumbnail=thumbnail)
    legacy, _ = Course.objects.get_or_create(
        slug="foundation_legacy",
        defaults={
            "title": "旧スタート教材",
            "description": "過去の進捗を保持するための非公開教材",
            "status": PublishStatus.ARCHIVED,
            "availability_status": AvailabilityStatus.COMING_SOON,
            "sort_order": 99,
        },
    )
    Lesson.objects.filter(slug__in=("use_ai_safely", "final_challenge")).update(
        course=legacy, status=PublishStatus.ARCHIVED
    )
    _upsert_lesson(start, 4, ADDED_LESSONS[0])
    _upsert_lesson(start, 6, ADDED_LESSONS[1])

    practical, _ = Course.objects.update_or_create(
        slug=PRACTICAL_COURSE,
        defaults={
            "title": "AI活用コース",
            "description": "基本スキルを、会議・メール・資料づくりなど実際の仕事へ組み合わせます。",
            "outcome": "会議・メール・資料づくりなど、日々の仕事にAIを組み込めるようになります。",
            "difficulty": "intermediate",
            "access_type": AccessType.FREE,
            "status": PublishStatus.PUBLISHED,
            "availability_status": AvailabilityStatus.AVAILABLE,
            "sort_order": 1,
        },
    )
    for number, entry in enumerate(ADDED_LESSONS[2:], start=1):
        _upsert_lesson(practical, number, entry)

    Lesson.objects.update_or_create(
        slug="combine_ai_skills",
        defaults={
            "course": practical,
            "number": 9,
            "title": "複数のAIスキルを組み合わせる",
            "goal": "要約・整理・文章作成を順番に使う考え方を身につける",
            "template": LessonTemplate.CUSTOM,
            "estimated_minutes": 9,
            "outcomes": ["作業を小さく分けられる", "適切なLessonを順番に使える"],
            "tags": ["workflow", "recipe"],
            "uses_ai": False,
            "status": PublishStatus.PUBLISHED,
            "availability_status": AvailabilityStatus.COMING_SOON,
            "coming_soon_message": "実務Recipeと一緒に準備しています",
            "thumbnail": "/assets/final-thumbnails/practical_12.webp",
            "sort_order": 9,
        },
    )
    Lesson.objects.update_or_create(
        slug="practical_recipe",
        defaults={
            "course": practical,
            "number": 10,
            "title": "実務Recipeを使う",
            "goal": "複数Lessonを組み合わせた手順を仕事で使う",
            "template": LessonTemplate.CUSTOM,
            "estimated_minutes": 8,
            "outcomes": ["Recipeから必要なスキルへ戻れる"],
            "tags": ["recipe"],
            "uses_ai": False,
            "status": PublishStatus.PUBLISHED,
            "availability_status": AvailabilityStatus.COMING_SOON,
            "coming_soon_message": "実務Recipeを準備しています",
            "thumbnail": "/assets/final-thumbnails/practical_01.webp",
            "sort_order": 10,
        },
    )
    """
    STEP 3「AIで作る」の2本。

    どちらも**まだ開けない**。仕組みが無いからではなく、費用の
    見通しを先に立てるため（docs/image-lessons.md）。画像1枚は文章1回の
    数十倍かかり、レッスン1本で最低2枚生成する。

    それでも一覧には出す。コースが「文章で終わる」のか
    「画像まで行く」のかは、始める前に知りたいことで、
    出さずにおくと**あとから足された別物**に見える。
    """
    _upsert_lesson(start, 7, IMAGE_GENERATION)
    _upsert_lesson(start, 8, IMAGE_EDIT)

    # AIスタートコースから外した2本を、実務側で引き取る。
    # 本文も、それで覚えた技も、終えた記録もそのまま生きる。
    for slug, (number, title) in PRACTICAL_MOVED_IN.items():
        Lesson.objects.filter(slug=slug).update(
            course=practical,
            number=number,
            title=title,
            sort_order=number,
            stage_key="",
            stage_title="",
        )

    """
    並びと STEP は、最後にまとめて当てる。

    上の `_upsert_lesson` / `update_or_create` はそれぞれ自分の番号と題を
    書くので、**あとから当てないと上書きされる**。カリキュラムの姿を
    決めるのは1か所（START_CURRICULUM）だけにする。
    """
    for slug, (number, title, stage) in START_CURRICULUM.items():
        key, stage_title = STAGES[stage]
        Lesson.objects.filter(slug=slug).update(
            course=start,
            number=number,
            title=title,
            sort_order=number,
            stage_key=key,
            stage_title=stage_title,
        )

    # 第1リリースでは主役を2本に絞る。過去の予告コースは削除せず非表示にする。
    Course.objects.exclude(slug__in=(START_COURSE, PRACTICAL_COURSE)).update(
        status=PublishStatus.ARCHIVED
    )
    return start, practical
