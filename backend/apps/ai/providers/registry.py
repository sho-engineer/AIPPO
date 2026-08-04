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


def get_provider(name: str | None = None, model: str | None = None) -> AIProvider:
    """プロバイダを1つ返す。

    鍵が無いときは mock へ倒す。ここで落とすと、鍵を入れ忘れただけで
    アプリ全体が起動しないように見えてしまう。
    倒したことは警告に残す（黙って偽物を返すと事故になる）。
    """
    requested = (name or settings.AI_PROVIDER or "mock").strip().lower()

    if requested in PLANNED:
        logger.warning("ai.provider.not_implemented name=%s falling_back=mock", requested)
        return MockProvider(model=model)

    resolved = _BUILDERS.get(requested)
    if resolved is None:
        logger.warning("ai.provider.unknown name=%s falling_back=mock", requested)
        return MockProvider(model=model)

    if resolved == "openai":
        if not settings.OPENAI_API_KEY:
            logger.warning("ai.provider.missing_key name=openai falling_back=mock")
            return MockProvider(model=model)
        from apps.ai.providers.openai_provider import OpenAIProvider

        return OpenAIProvider(model=model)

    if resolved == "anthropic":
        from apps.ai.providers.anthropic_provider import AnthropicChatProvider

        return AnthropicChatProvider(model=model)

    return MockProvider(model=model)
