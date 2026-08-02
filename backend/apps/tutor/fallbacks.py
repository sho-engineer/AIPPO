"""AIが使えないときのポーの固定ヒント。

AI障害・タイムアウト・形式不適合のいずれでも、ここの文言を返して
レッスンを前に進める（AIPPO 開発概要 §17）。

ヒントの段階は §8 の定義に従う。
1: 考える方向を示す / 2: 選択肢や穴埋め形式を示す / 3: 具体例を示す
"""

from apps.tutor.prompts import hint_level_for

#: (step, hint_level) -> message
FALLBACK_MESSAGES: dict[tuple[str, int], str] = {
    ("review_input", 1): "誰が読む文章なのかを伝えると、AIの回答が変わります。",
    ("review_input", 2): (
        "「【誰向け】に【どんな表現】で【どれくらいの長さ】に」の形で書いてみましょう。"
    ),
    ("review_input", 3): "例えば「社外のお客様向けに、丁寧に、3行で」と書いてみましょう。",
    ("review_result", 1): "元の文章と比べて、読みやすくなったところを一つ探してみましょう。",
    ("review_result", 2): "長さ・言葉づかい・元の意味、どれが変わったか見てみましょう。",
    ("review_result", 3): "例えば「1文が短くなった」のように、変わった点を一つ挙げてみましょう。",
    ("improve_input", 1): "直したいところを一つだけ選んでみましょう。",
    ("improve_input", 2): "「もっと短く」「もっと丁寧に」など、方向をひとつ決めてみましょう。",
    ("improve_input", 3): (
        "迷ったら「もっと短くしたい」を選んでみましょう。変化が分かりやすいです。"
    ),
    ("real_task", 1): "実際に使いたい文章を一つ入力してみましょう。",
    ("real_task", 2): "相手と長さも一緒に伝えると、結果が変わります。",
    ("real_task", 3): "例えば「上司向けに、簡潔に、2行で」と条件を添えてみましょう。",
}

DEFAULT_FALLBACK = "もう一度、伝えたいことを一つだけ足してみましょう。"

#: 個人情報・機密情報が含まれそうなときの注意（安全ルール §15）。
SAFETY_WARNING = "個人名や社外秘の内容は、消してから試してみましょう。"


def fallback_feedback(step: str, attempt_count: int) -> dict:
    """固定ヒントを、APIレスポンスと同じ形で返す。"""
    level = hint_level_for(attempt_count)
    message = FALLBACK_MESSAGES.get((step, level), DEFAULT_FALLBACK)
    return {
        "message": message,
        "emotion": "hint",
        "action": "retry",
        "hint_level": level,
        "completed": False,
    }


def safety_warning_feedback(hint_level: int = 0) -> dict:
    """個人情報の可能性を検知したときの注意。"""
    return {
        "message": SAFETY_WARNING,
        "emotion": "warning",
        "action": "retry",
        "hint_level": hint_level,
        "completed": False,
    }
