"""レッスン本体のAI文章生成（AIPPO 開発概要 §18 Phase 3）。

- AIプロバイダを画面から直接呼ばず、このサービスクラスを通す（§12）
- タイムアウト 30秒、リトライなし。待ち時間が倍増するより、
  失敗を早く伝えて再実行させるほうがよい
- 失敗時は例外を送出する。チューターのフィードバックと違い、
  ここは「AIの出力そのもの」が目的なので、固定文で代替できない
"""

import logging
import time
from collections.abc import Iterator
from dataclasses import dataclass, field

from django.conf import settings

from apps.tutor.services.base import (
    AiProvider,
    AiProviderError,
    AiTimeoutError,
    StreamingAiProvider,
)

logger = logging.getLogger(__name__)

REWRITE_SCHEMA: dict = {
    "type": "object",
    "properties": {"rewritten_text": {"type": "string"}},
    "required": ["rewritten_text"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """あなたは、日本語の文章を分かりやすく書き直す担当です。

守ること:
- 元の文章の意味を変えない
- 指定された相手・表現・長さに合わせる
- 事実を足さない。元の文章に無い情報を作らない
- 説明や前置きを付けず、書き直した文章だけを返す

出力:
指定されたJSON形式だけを返してください。
"""


@dataclass(frozen=True)
class GenerationResult:
    text: str
    model_name: str = ""
    token_usage: dict = field(default_factory=dict)
    latency_ms: int = 0


def build_instruction(
    *, original_text: str, audience: str, tone: str, length: str, instruction: str = ""
) -> str:
    """穴埋め入力から依頼内容を組み立てる（§10 Step 3）。"""
    lines = [
        f"次の文章を、{audience}に、{tone}で、{length}にしてください。",
    ]
    if instruction:
        lines.append(f"あわせて、{instruction}")
    lines.append("")
    lines.append("--- 元の文章 ---")
    lines.append(original_text)
    return "\n".join(lines)


def rewrite_text(
    *,
    original_text: str,
    audience: str,
    tone: str,
    length: str,
    instruction: str = "",
    provider: AiProvider,
) -> GenerationResult:
    """文章を書き直す。失敗時は AiProviderError を送出する。"""
    user_content = build_instruction(
        original_text=original_text,
        audience=audience,
        tone=tone,
        length=length,
        instruction=instruction,
    )

    started = time.monotonic()
    raw = provider.generate_json(
        system_prompt=SYSTEM_PROMPT,
        user_content=user_content,
        schema=REWRITE_SCHEMA,
        timeout_seconds=settings.LESSON_RUN_TIMEOUT_SECONDS,
        max_retries=0,
    )
    latency_ms = int((time.monotonic() - started) * 1000)

    meta = raw.pop("_meta", {}) if isinstance(raw, dict) else {}
    text = raw.get("rewritten_text") if isinstance(raw, dict) else None

    if not isinstance(text, str) or not text.strip():
        logger.warning("lesson.generate.empty_output")
        raise AiProviderError("AI returned empty text")

    return GenerationResult(
        text=text.strip(),
        model_name=meta.get("model_name", ""),
        token_usage=meta.get("token_usage", {}),
        latency_ms=latency_ms,
    )


def rewrite_text_stream(
    *,
    original_text: str,
    audience: str,
    tone: str,
    length: str,
    instruction: str = "",
    provider: AiProvider,
) -> Iterator[str | GenerationResult]:
    """文章を書き直しながら、書けたところから順に返す。

    学習者の待ち時間はほぼすべてAIの応答待ち。
    書き上がるまで黙って待たせるより、途中から見せたほうが体感が変わる。

    本文の断片を順に yield し、**最後に一度だけ** `GenerationResult` を返す。
    呼び出し側は型で区別すること。

    ストリーミングに対応していないプロバイダのときは `NotImplementedError`。
    呼び出し側は `rewrite_text()` へ倒す。
    """
    if not isinstance(provider, StreamingAiProvider):
        raise NotImplementedError("provider does not support streaming")

    user_content = build_instruction(
        original_text=original_text,
        audience=audience,
        tone=tone,
        length=length,
        instruction=instruction,
    )

    meta: dict = {}
    parts: list[str] = []
    started = time.monotonic()

    for chunk in provider.stream_text(
        system_prompt=SYSTEM_PROMPT,
        user_content=user_content,
        timeout_seconds=settings.LESSON_RUN_TIMEOUT_SECONDS,
        meta_out=meta,
    ):
        if chunk:
            parts.append(chunk)
            yield chunk

    latency_ms = int((time.monotonic() - started) * 1000)
    text = "".join(parts).strip()

    if not text:
        logger.warning("lesson.stream.empty_output")
        raise AiProviderError("AI returned empty text")

    yield GenerationResult(
        text=text,
        model_name=meta.get("model_name", ""),
        token_usage=meta.get("token_usage", {}),
        latency_ms=latency_ms,
    )


__all__ = [
    "AiProviderError",
    "AiTimeoutError",
    "GenerationResult",
    "REWRITE_SCHEMA",
    "build_instruction",
    "rewrite_text",
    "rewrite_text_stream",
]
