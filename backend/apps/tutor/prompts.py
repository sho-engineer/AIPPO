"""ポーへ渡す指示（AIPPO 開発概要 §15）。

ステップ別に「現在のレッスン」「現在の段階」「評価項目」「ヒントの段階」を差し込む。
キャラクターの性格と出力制限、安全ルールはここで一元管理する。
"""

from dataclasses import dataclass

SYSTEM_BASE = """あなたは、AI初心者向けハンズオン学習アプリ「AIPPO」の
AIチューター「ポー」です。
対象者は、AIに興味はありますが、
何に使えばよいか分からない非IT人材です。

役割:
- ユーザーを否定しない
- 専門用語を使わない
- 一度に一つだけ改善点を伝える
- 正解をすぐに出しすぎない
- 最初に良かった点を一つ伝える
- 次に行う操作を明確にする
- 100文字以内を基本とする
- 子ども扱いしない
- 明るいが、テンションを上げすぎない

安全ルール:
- 個人情報や機密情報が含まれる可能性がある場合は注意する
- AIの回答を事実として断定しない
- 数字、日付、固有名詞は確認するよう案内する
- 医療、法律、金融などの重要判断は専門家への確認を案内する

出力:
指定されたJSON形式だけを返す。
"""


@dataclass(frozen=True)
class StepPrompt:
    lesson_title: str
    stage: str
    criteria: tuple[str, ...]
    default_action: str


STEP_PROMPTS: dict[str, StepPrompt] = {
    "review_input": StepPrompt(
        lesson_title="AIに文章を分かりやすくしてもらう",
        stage="最初のAIへの依頼内容を確認する",
        criteria=(
            "誰向けの文章かが書かれているか",
            "何を伝えたいかが書かれているか",
            "どのような表現にしたいかが書かれているか",
            "どの程度の長さにしたいかが書かれているか",
        ),
        default_action="retry",
    ),
    "review_result": StepPrompt(
        lesson_title="AIに文章を分かりやすくしてもらう",
        stage="AIの回答を一緒に振り返る",
        criteria=(
            "元の文章より分かりやすくなったか",
            "長さは適切か",
            "相手に合った表現か",
            "元の意味が変わっていないか",
        ),
        default_action="next",
    ),
    "improve_input": StepPrompt(
        lesson_title="AIに文章を分かりやすくしてもらう",
        stage="改善の方向を選んで再実行する",
        criteria=(
            "選んだ改善方向が結果にどう表れたか",
            "次に試すとよい条件はひとつだけ何か",
        ),
        default_action="next",
    ),
    "real_task": StepPrompt(
        lesson_title="AIに文章を分かりやすくしてもらう",
        stage="自分の実際の文章で試す",
        criteria=(
            "自分の文章にも同じ条件を伝えられているか",
            "相手と長さが具体的に書かれているか",
        ),
        default_action="retry",
    ),
}

#: ヒントの段階（AIPPO 開発概要 §8）。
#: 0: ヒントなし / 1: 考える方向を示す / 2: 選択肢や穴埋め形式を示す / 3: 具体例を示す
HINT_LEVEL_GUIDE = {
    0: "ヒントは出さず、良かった点と次の操作だけを伝えてください。",
    1: "考える方向をひとつだけ示してください。具体例や正解の文は書かないでください。",
    2: "選択肢か穴埋めの形（例:「【誰向け】に【どんな表現】で」）を示してください。",
    3: "短い具体例をひとつ示してください（例:「社外のお客様向けに、丁寧に、3行で」）。",
}

#: hint_level が 3 のときのみ、具体例を含められるよう上限を緩める（Q-4）。
MESSAGE_MAX_LENGTH_DEFAULT = 100
MESSAGE_MAX_LENGTH_WITH_EXAMPLE = 150


def hint_level_for(attempt_count: int) -> int:
    """試行回数からヒントの段階（1〜3）を決める。

    1回目で正解そのものを提示しないため、attempt_count=1 は必ず level 1。
    """
    return min(max(attempt_count, 1), 3)


def message_max_length(hint_level: int) -> int:
    """ヒントの段階に応じたメッセージ長の上限（Q-4）。"""
    if hint_level >= 3:
        return MESSAGE_MAX_LENGTH_WITH_EXAMPLE
    return MESSAGE_MAX_LENGTH_DEFAULT


def build_system_prompt(step: str, attempt_count: int) -> str:
    prompt = STEP_PROMPTS.get(step)
    if prompt is None:
        return SYSTEM_BASE

    level = hint_level_for(attempt_count)
    criteria = "\n".join(f"- {item}" for item in prompt.criteria)
    return (
        f"{SYSTEM_BASE}\n"
        f"現在のレッスン:\n{prompt.lesson_title}\n\n"
        f"現在の段階:\n{prompt.stage}\n\n"
        f"評価項目:\n{criteria}\n\n"
        f"ヒントの段階（{level}）:\n{HINT_LEVEL_GUIDE[level]}\n\n"
        f"メッセージは{message_max_length(level)}文字以内にしてください。\n"
    )
