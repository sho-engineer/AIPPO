"""生成のあとにポーが言うこと。

ポーは自由会話の相手ではなく、教材の進行役（§5）。
だから発言は**教材の進み方から決まる**もので、AI に考えさせる必要が無い。

AI へ2回目の問い合わせをしないことで、次が同時に手に入る。

- 費用と待ち時間が半分になる
- 同じ場面では必ず同じことを言う（教材として説明しやすい）
- AI が落ちてもポーは黙らない

§11 のポー用の決まりは、ここで機械的に守る。

- 100文字以内
- 初心者を否定しない
- 良かった点を先に1つ
- 改善点は1つだけ
- 次に何をすればよいかを言う
- 専門用語を使わない
"""

from __future__ import annotations

from apps.ai.actions import Action

#: §11 の上限。超えたら切るのではなく、開発中に気づけるよう検証する。
MAX_TUTOR_LENGTH = 100

#: 生成に失敗したとき。黙らせない（憲章 原則 I: 行き止まりを作らない）。
FAILURE_MESSAGE = "うまく届かなかったようです。もう一度おくってみましょう。"

#: 事実確認が要るアクションで必ず添えること。
FACT_CHECK_NOTE = "数字と日付は、必ず自分で確かめましょう。"


def build_tutor(action: Action, *, is_retry: bool = False) -> dict:
    """成功したときのポーの発言。"""
    message = action.tutor_message
    if is_retry:
        message = "条件を変えると結果も変わります。前の結果と見比べてみましょう。"

    return {
        "message": _fit(message),
        "emotion": action.tutor_emotion,
        "action": action.tutor_action,
    }


def failure_tutor() -> dict:
    return {
        "message": FAILURE_MESSAGE,
        "emotion": "warning",
        "action": "retry",
    }


def limit_tutor(message: str) -> dict:
    return {"message": _fit(message), "emotion": "warning", "action": "wait"}


def _fit(message: str) -> str:
    """100文字に収める。

    切るのは最後の手段。教材側の文言を短く書くのが本筋なので、
    切らないと収まらない文言はテストで落とす（tests/test_ai_tutor.py）。
    """
    if len(message) <= MAX_TUTOR_LENGTH:
        return message
    return message[: MAX_TUTOR_LENGTH - 1] + "…"
