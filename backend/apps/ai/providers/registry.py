"""どのプロバイダを使うかを決める、唯一の場所。

View や教材データがプロバイダのクラスを直接 import しないこと。
ここを通すことで、差し替えが `AI_PROVIDER` の1行で済む。

将来のモデル比較コースでは、教材の LessonStep が provider と model を
指定できる。`get_provider(name, model)` はそのための入口でもある。
"""

from __future__ import annotations

import logging

from django.conf import settings

from apps.ai.providers.base import AIProvider
from apps.ai.providers.mock import MockProvider

logger = logging.getLogger(__name__)


class AIServiceNotConfigured(Exception):
    """AI を使う設定になっているのに、使えない。

    以前はここで黙って mock へ倒していた。それはやってはいけない。

    倒すと、利用者には**固定の偽の結果が本物の AI の答えとして出る**。
    学習者はそれを見て「AIはこう答えるのか」と覚える。運営側も、
    画面が動いているので鍵の入れ忘れに気づけない。気づくのは
    「なぜかいつも同じ答えが返る」と誰かが言い出したときになる。

    鍵が無いなら、はっきり失敗させる。
    """

    code = "AI_SERVICE_NOT_CONFIGURED"
    detail = "現在AI機能を利用できません。しばらくしてからもう一度お試しください。"

#: 名前 → 組み立て関数。実装が増えたらここに足す。
#: import は関数の中でする。SDK が入っていない環境でも
#: mock だけで動かせるようにしておきたい。
_BUILDERS: dict[str, str] = {
    "mock": "mock",
    # 既存の呼び名。stub と mock は同じものを指す
    "stub": "mock",
    "openai": "openai",
    "anthropic": "anthropic",
}

#: まだ実API を実装していないもの。名前だけ受け付けて mock へ倒す。
PLANNED = ("google",)


def available_providers() -> tuple[str, ...]:
    return tuple(sorted(set(_BUILDERS) | set(PLANNED)))


#: 鍵の要る先と、その設定名。
#: プロバイダを足したら、ここと config/settings.py の両方へ足す。
#: 片方だけだと「鍵を渡しているのに使えない」という失敗になり、
#: 原因がとても分かりにくい（tests/test_ai_providers.py が見張る）。
REQUIRED_KEYS: dict[str, str] = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}


def get_provider(name: str | None = None, model: str | None = None) -> AIProvider:
    """プロバイダを1つ返す。

    鍵が無いときは mock へ倒す。ここで落とすと、鍵を入れ忘れただけで
    アプリ全体が起動しないように見えてしまう。
    倒したことは警告に残す（黙って偽物を返すと事故になる）。
    """
    requested = (name or settings.AI_PROVIDER or "mock").strip().lower()

    if requested in PLANNED:
        # まだ実装していない先を指定された。黙って別の先へ回さない
        logger.error("ai.provider.not_implemented name=%s", requested)
        raise AIServiceNotConfigured(
            f"{requested} はまだ使えません（AI_PROVIDER を見直してください）"
        )

    resolved = _BUILDERS.get(requested)
    if resolved is None:
        logger.error("ai.provider.unknown name=%s", requested)
        raise AIServiceNotConfigured(
            f"AI_PROVIDER={requested} は知らない名前です"
        )

    if resolved == "openai":
        if not getattr(settings, REQUIRED_KEYS["openai"], ""):
            logger.error("ai.provider.missing_key name=openai")
            raise AIServiceNotConfigured(
                "AI_PROVIDER=openai ですが OPENAI_API_KEY が設定されていません"
            )
        from apps.ai.providers.openai_provider import OpenAIProvider

        return OpenAIProvider(model=model)

    if resolved == "anthropic":
        if not getattr(settings, REQUIRED_KEYS["anthropic"], ""):
            logger.error("ai.provider.missing_key name=anthropic")
            raise AIServiceNotConfigured(
                "AI_PROVIDER=anthropic ですが ANTHROPIC_API_KEY が設定されていません"
            )
        from apps.ai.providers.anthropic_provider import AnthropicChatProvider

        return AnthropicChatProvider(model=model)

    return MockProvider(model=model)


def check_configured() -> None:
    """設定が揃っているかを確かめる。揃っていなければ例外。

    ヘルスチェック（/health/ready）と起動時の検査から呼ぶ。
    実際に AI を呼ぶ前に、設定の抜けを見つけるための入口。
    """
    get_provider()
