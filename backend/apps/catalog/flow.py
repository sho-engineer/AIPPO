"""成果物ファーストのレッスン骨格。

順番はこうと決めている。

    成果物を見る → サンプルで一度試す → 変化を観察する → 短い解説
    → 条件を一つ足す → 前後を比べる → 自分の課題で試す → できたことを確認

なぜこの順番か
--------------
先に説明してから操作させると、初心者は説明の途中で離れる。
「何のためにこれを覚えるのか」が分からないまま読まされるため。

先に**小さな成功**を作ってから原理を出すと、
解説が「さっき起きたことの説明」になり、読む理由ができる。

だから最初の1回は、選ばせるのを**1つだけ**にする。
相手・表現・長さ・形式を全部聞いてからでは、最初の結果まで遠すぎる。

ここに置いた理由
----------------
もとは画面側（frontend/src/course/shared.ts）にあった。
教材を管理画面から足せるようにするなら、骨格もサーバーに無いと、
教材を1本足すたびにフロントの作り直しと配信が要る。

**出す形は画面の型に合わせる。** 鍵の名前は camelCase のままにしてある
（poMessage など）。ここで snake_case にすると、受け取る側が
詰め替えることになり、food違いの事故が起きる場所が1つ増える。
"""

from __future__ import annotations

from typing import Any

#: 条件を1つだけ足すときの選択肢。
CONDITION_OPTIONS: list[dict[str, Any]] = [
    {"value": "もっと短く", "label": "もっと短く", "icon": "scissors"},
    {"value": "もっと丁寧に", "label": "もっと丁寧に", "icon": "heart"},
    {"value": "やわらかく", "label": "やわらかく", "icon": "smile"},
    {"value": "要点を先に", "label": "要点を先に", "icon": "list-ordered"},
    {"value": "箇条書きにする", "label": "箇条書きにする", "icon": "list-bullet"},
    {"value": "", "label": "自分で条件を追加", "free": True, "icon": "plus"},
]

#: 長さの選択肢。自分の課題のときに使う。
LENGTH_OPTIONS: list[dict[str, Any]] = [
    {"value": "1行", "label": "1行"},
    {"value": "3行くらい", "label": "3行くらい"},
    {"value": "半分の長さ", "label": "半分の長さ"},
    {"value": "今のままの長さ", "label": "今のままの長さ"},
    {"value": "", "label": "そのほか", "free": True},
]

#: 誰向けか。最初の1回は3つに絞る。多いと選べない。
AUDIENCE_OPTIONS: list[dict[str, Any]] = [
    {"value": "上司", "label": "上司", "icon": "person"},
    {"value": "同僚", "label": "同僚", "icon": "people"},
    {"value": "顧客", "label": "顧客", "icon": "building"},
]

#: 「どこが変わったと思いますか」の選択肢。
#: 正誤を強く付けない。「よく分からない」でも進めるのが肝心で、
#: ここで間違い扱いされると、次から選ばずに飛ばすようになる。
OBSERVATION_OPTIONS: list[dict[str, Any]] = [
    {"value": "短くなった", "label": "短くなった"},
    {"value": "丁寧になった", "label": "丁寧になった"},
    {"value": "要点が先に来た", "label": "要点が先に来た"},
    {"value": "相手に合った表現になった", "label": "相手に合った表現"},
    {"value": "よく分からない", "label": "よく分からない"},
]

#: 解説カードは3枚まで。増えた時点で講義に戻っている。
MAX_CONCEPT_CARDS = 3


def _concept_steps(
    cards: list[dict[str, Any]], skills: list[str] | None = None
) -> list[dict[str, Any]]:
    steps = []
    for index, card in enumerate(cards[:MAX_CONCEPT_CARDS], start=1):
        steps.append(
            {
                "id": f"concept_{index}",
                "type": "concept_card",
                # 比べたあとに出るので、区切りは「比べる」に属する。
                # try のままだと、比べる画面の直後で帯が1つ戻って見える
                "phase": "compare",
                "title": card.get("title", ""),
                "poMessage": card.get("body", ""),
                "poEmotion": "neutral",
                # 解説は必ず飛ばせる。読みたくない人を足止めしない
                "skippable": True,
                # その解説で覚える技の名前（「ターゲット指定」）。
                # カードの見出しはやさしい言い方（「誰向けかを伝える」）で、
                # 画面は名前を先に、言い換えを下に出す
                "skill": (skills or [])[index - 1]
                if skills and index <= len(skills)
                else "",
                "card": card,
            }
        )
    return steps


def build_lesson_flow(options: dict[str, Any]) -> list[dict[str, Any]]:
    """骨格から、1本ぶんのステップの並びを組み立てる。

    `options` の中身は Lesson の「骨格のパラメータ」。
    足りない項目は空で通す。ここで例外を投げると、書きかけの教材を
    管理画面で開いただけで500になる（公開前の検査は validation.py が持つ）。
    """
    ai_action = options.get("aiAction") or {}
    review = {
        "reviewPoints": options.get("reviewPoints") or [],
        "factCheck": bool(options.get("factCheck", False)),
    }
    improve_action = {**ai_action, "action": "improve", "inputs": {}}

    steps: list[dict[str, Any]] = [
        {
            "id": "outcome_preview",
            "type": "outcome_preview",
            "phase": "try",
            "title": "今日つくるもの",
            "poMessage": "まず、できあがりを見てみましょう。",
            "poEmotion": "neutral",
        },
        {
            # 選ぶのは1つだけ。ここを増やすと最初の結果が遠くなる
            "id": "quick_try",
            "type": "quick_try",
            "phase": "try",
            "title": options.get("quickTitle", ""),
            "instruction": options.get("quickInstruction", ""),
            "poMessage": "ひとつ選ぶだけで、すぐ結果が見られます。",
            "poEmotion": "question",
            "key": options.get("quickKey", ""),
            "required": True,
            "options": options.get("quickOptions") or [],
            "aiAction": ai_action,
            "meta": {
                "sampleText": options.get("sampleText", ""),
                "defaults": options.get("quickDefaults") or {},
            },
        },
        {
            "id": "generate_first",
            "type": "ai_generate",
            "phase": "try",
            "title": "AIに送っています",
            "instruction": options.get("working", ""),
            "poMessage": "送っています。少しだけ待ってください。",
            "poEmotion": "thinking",
            "aiAction": ai_action,
        },
        {
            "id": "observe_result",
            "type": "observation",
            "phase": "try",
            "title": "どこが変わったと思いますか",
            "instruction": "当てはまると思うものを選んでください。いくつでも大丈夫です。",
            "poMessage": "正解を当てる問題ではありません。気づいたことを選んでください。",
            "poEmotion": "question",
            "key": "observation",
            "options": options.get("observationOptions") or OBSERVATION_OPTIONS,
            "meta": review,
        },
        {
            "id": "add_condition",
            "type": "condition_choice",
            "phase": "compare",
            "title": "条件を一つ足してみましょう",
            "instruction": "一度に一つだけ選ぶのがコツです。",
            "poMessage": "一度で完成させなくて大丈夫です。足すたびに近づきます。",
            "poEmotion": "hint",
            "key": "condition",
            "required": True,
            "options": options.get("conditionOptions") or CONDITION_OPTIONS,
            "aiAction": improve_action,
        },
        {
            "id": "generate_improved",
            "type": "ai_generate",
            "phase": "compare",
            "title": "AIに送っています",
            "instruction": "足した条件だけを直してもらっています。",
            "poMessage": "送っています。少しだけ待ってください。",
            "poEmotion": "thinking",
            "aiAction": improve_action,
        },
        {
            "id": "compare_results",
            "type": "result_compare",
            "phase": "compare",
            "title": "変わり方を見比べる",
            "instruction": "元の文章・1回目・条件を足したあと、の3つを比べます。",
            "poMessage": "「誰向けか」と「どうしたいか」を伝えると、結果を調整できます。",
            "poEmotion": "talking",
            "meta": {**review, "threeWay": True},
        },
        # AI技の名前は、**使って、違いを見たあと**に出す。
        #
        # 前はここが observe_result の直後——条件を足す前・比べる前に
        # あった。「出力形式の指定とは」を、それが何の役に立つのか
        # 分からないまま読ませていたことになる。
        #
        # いまは順がこうなる:
        #
        #     条件を足す → 結果が変わる → 見比べる → 「今のが〜です」
        #
        # 名前が、たったいま自分で起こした変化に貼り付く。
        # 歩数は変わっていない。**入れ替えただけ**。
        *_concept_steps(
            options.get("conceptCards") or [],
            options.get("conceptSkills") or [],
        ),
        # ここが**主導線の終わり**。この先は任意。
        #
        # 前はこの手前に「技を深める回」が並び、そのあと自分の文章が
        # 続いて、**全部通らないと終われなかった**。19画面で7〜9分。
        # 仕事終わりに開ける長さではない。
        #
        # いまはここまでの9画面で1つの技が身についている
        # （送る → 変わる → 見比べる → 名前を知る）。そこで一度
        # 終われるようにする。続けたい人だけが下へ進む。
        #
        # 深める回を**消したのではない**。位置を変えただけ。
        {
            "id": "real_task_intro",
            "type": "safety_check",
            "phase": "own",
            "title": "自分の文章でも試す？",
            # 注意はここでは出さない。**まだ何も書いていない。**
            # 入力欄のところで出るので、書く直前にちょうど届く。
            "poMessage": "自分の仕事のことで試すと、そのまま使えます。",
            "poEmotion": "hint",
            "key": "real_task_choice",
            "options": [
                {"value": "自分で入力する", "label": "自分の文章で試す"},
                {"value": "別のサンプルを試す", "label": "別の例で試す"},
            ],
        },
        {
            "id": "real_task",
            "type": "real_task",
            "phase": "own",
            # 次に何が来るかで言うことが変わる。あとに何も挟まなければ
            # 次は送る内容の確認なので、そう書ける。挟むときは
            # `expand.py` の `_assemble` がここを外す
            "primaryLabel": "AIに送る内容を見る",
            "title": "自分の文章",
            "instruction": options.get("realTaskLabel", ""),
            "poMessage": "自分の仕事のことで試すと、そのまま使えるようになります。",
            "poEmotion": "hint",
            "key": "real_task_text",
            "placeholder": options.get("realTaskPlaceholder", ""),
            # 詰まった人へのヒント。**答えを全部は言わない**——次に試す
            # 条件を1つだけ示す。仕組み（showHint と「ヒントを見る」）は
            # 前からあったが、どの教材も1つも持っていなかったので、
            # ボタンごと出ていなかった。逃げ道が、あるのに閉じていた
            "hints": options.get("realTaskHints", []),
            # 空のままでは進めない。短いだけなら止めず提案にとどめる
            "required": True,
            "validationRules": {"suggestLength": 20, "maxLength": 5000},
        },
        {
            # 自分で条件を組み立てた回だけ、送る前に依頼内容を見せる。
            # 最初の1回で挟むと、成功までが遠くなって離脱する。
            "id": "prompt_preview",
            "type": "prompt_preview",
            "phase": "own",
            "title": "AIにはこう伝えます",
            "instruction": "送る前に、どう伝わるかを確かめましょう。",
            "poMessage": "この内容でお願いします。直したいところがあれば戻れます。",
            "poEmotion": "talking",
            "aiAction": ai_action,
        },
        {
            "id": "generate_real",
            "type": "ai_generate",
            "phase": "own",
            "title": "AIに送っています",
            "instruction": options.get("working", ""),
            "poMessage": "送っています。少しだけ待ってください。",
            "poEmotion": "thinking",
            "aiAction": ai_action,
        },
        {
            "id": "real_task_result",
            "type": "result_compare",
            "phase": "own",
            "title": "自分の文章の結果",
            "instruction": "そのまま使える形になっているか見てみましょう。",
            "poMessage": "使えそうなら、そのまま今日の仕事に持っていけます。",
            "poEmotion": "celebrate",
            "meta": review,
        },
        {
            "id": "reflection",
            "type": "reflection",
            "phase": "own",
            "title": "ふりかえり",
            "instruction": "今日おぼえたことを確認しましょう。",
            "poMessage": options.get("takeaway", ""),
            "poEmotion": "neutral",
        },
        {
            "id": "completion",
            "type": "completion",
            "phase": "own",
            "title": "できるようになりました",
            "poMessage": options.get("nextSuggestion", ""),
            "poEmotion": "celebrate",
        },
    ]

    return steps
