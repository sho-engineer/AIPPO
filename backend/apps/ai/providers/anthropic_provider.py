"""Anthropic を使うプロバイダ。

MVP では既定にしない。将来のモデル比較コースで、
同じ課題を複数のモデルへ送るときのために口だけ用意してある。

中身は `apps/tutor/services/provider.py` の実装を使い回す。
同じ SDK 呼び出しを2か所に書くと、片方だけ直す事故が起きる。
"""

from __future__ import annotations

import time

from django.conf import settings

from apps.ai.providers.base import (
    AIMalformedError,
    AIProvider,
    AIRequest,
    AIResult,
    AIUsage,
)

#: 素のテキストを1件返すときのスキーマ。
#: Anthropic 側の実装が JSON 前提なので、テキストもこれで包む。
_TEXT_SCHEMA = {
    "type": "object",
    "properties": {"result": {"type": "string"}},
    "required": ["result"],
    "additionalProperties": False,
}


class AnthropicChatProvider(AIProvider):
    name = "anthropic"

    def __init__(self, model: str | None = None) -> None:
        self._model = model or settings.AI_MODEL

    def _inner(self):
        from apps.tutor.services.provider import AnthropicProvider

        return AnthropicProvider(model=self._model)

    def _call(self, request: AIRequest, schema: dict) -> tuple[dict, AIUsage]:
        from apps.ai.providers.base import AIProviderError, AITimeoutError
        from apps.tutor.services.base import AiProviderError as LegacyError
        from apps.tutor.services.base import AiTimeoutError as LegacyTimeout

        started = time.monotonic()
        try:
            payload = self._inner().generate_json(
                system_prompt=request.system_prompt,
                user_content=request.user_content,
                schema=schema,
                timeout_seconds=(
                    request.timeout_seconds or settings.AI_REQUEST_TIMEOUT_SECONDS
                ),
                max_retries=0,
            )
        except LegacyTimeout as exc:
            raise AITimeoutError(str(exc)) from exc
        except LegacyError as exc:
            raise AIProviderError(str(exc)) from exc

        meta = payload.pop("_meta", {}) if isinstance(payload, dict) else {}
        tokens = meta.get("token_usage", {}) or {}
        usage = AIUsage(
            provider=self.name,
            model=meta.get("model_name", "") or self._model,
            input_tokens=tokens.get("input", 0) or 0,
            output_tokens=tokens.get("output", 0) or 0,
            latency_ms=int((time.monotonic() - started) * 1000),
        )
        return payload, usage

    def generate_text(self, request: AIRequest) -> AIResult:
        payload, usage = self._call(request, _TEXT_SCHEMA)
        text = payload.get("result", "")
        if not isinstance(text, str) or not text.strip():
            raise AIMalformedError("AI returned empty text")
        return AIResult(text=text.strip(), usage=usage)

    def generate_structured(self, request: AIRequest, response_schema: dict) -> AIResult:
        payload, usage = self._call(request, response_schema)
        return AIResult(
            text=payload.get("result", "") if isinstance(payload.get("result"), str) else "",
            data=payload,
            usage=usage,
        )
