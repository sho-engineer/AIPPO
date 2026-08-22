"""OpenAI を使うプロバイダ。MVP の本番用。

既定モデルは `AI_MODEL`（既定値 gpt-5-nano）。
モデル名をここに直書きしないこと。将来のモデル比較コースでは、
教材データ側が呼び出しごとに model を指定する。

返却形式は **Structured Outputs（JSON Schema）** で拘束する。
それでも形が崩れることはあるので、受け取った後に
呼び出し側（apps/ai/actions.py）で必ず検証する。

ログに本文を残さない。落ちた理由の種別だけを記録する。
"""

from __future__ import annotations

import json
import logging
import time

from django.conf import settings

from apps.ai.providers.base import (
    AIMalformedError,
    AIProvider,
    AIProviderError,
    AIRefusedError,
    AIRequest,
    AIResult,
    AITimeoutError,
    AIUsage,
)

logger = logging.getLogger(__name__)


class OpenAIProvider(AIProvider):
    name = "openai"

    def __init__(self, client=None, model: str | None = None) -> None:
        self._client = client
        self._model = model or settings.AI_MODEL

    def _get_client(self):
        if self._client is None:
            from openai import OpenAI

            # OPENAI_API_KEY を環境から解決する
            self._client = OpenAI(api_key=settings.OPENAI_API_KEY or None)
        return self._client

    def _call(self, request: AIRequest, text_format: dict | None):
        import openai

        timeout = request.timeout_seconds or settings.AI_REQUEST_TIMEOUT_SECONDS
        client = self._get_client().with_options(timeout=timeout, max_retries=0)

        kwargs: dict = {
            "model": request.model or self._model,
            "instructions": request.system_prompt,
            "input": request.user_content,
            "max_output_tokens": (
                request.max_output_tokens or settings.AI_MAX_OUTPUT_TOKENS
            ),
        }
        if text_format is not None:
            kwargs["text"] = {"format": text_format}

        try:
            return client.responses.create(**kwargs)
        except openai.APITimeoutError as exc:
            logger.warning("ai.openai.timeout timeout=%ss", timeout)
            raise AITimeoutError("AI request timed out") from exc
        except openai.APIError as exc:
            logger.warning("ai.openai.error type=%s", type(exc).__name__)
            raise AIProviderError("AI request failed") from exc

    @staticmethod
    def _usage(response, started: float, model: str) -> AIUsage:
        usage = getattr(response, "usage", None)
        return AIUsage(
            provider="openai",
            model=getattr(response, "model", "") or model,
            input_tokens=getattr(usage, "input_tokens", 0) or 0,
            output_tokens=getattr(usage, "output_tokens", 0) or 0,
            latency_ms=int((time.monotonic() - started) * 1000),
        )

    @staticmethod
    def _text_of(response) -> str:
        """本文を取り出す。

        `output_text` は SDK が用意している近道だが、
        無い場合に備えて output からも拾えるようにしておく。
        """
        text = getattr(response, "output_text", None)
        if isinstance(text, str) and text.strip():
            return text

        parts: list[str] = []
        for item in getattr(response, "output", []) or []:
            for block in getattr(item, "content", []) or []:
                if getattr(block, "type", "") in ("output_text", "text"):
                    parts.append(getattr(block, "text", "") or "")
        return "".join(parts)

    @staticmethod
    def _raise_if_refused(response) -> None:
        for item in getattr(response, "output", []) or []:
            for block in getattr(item, "content", []) or []:
                if getattr(block, "type", "") == "refusal":
                    logger.warning("ai.openai.refusal")
                    raise AIRefusedError("AI declined the request")

    def generate_text(self, request: AIRequest) -> AIResult:
        started = time.monotonic()
        response = self._call(request, text_format=None)
        self._raise_if_refused(response)

        text = self._text_of(response).strip()
        if not text:
            logger.warning("ai.openai.empty_output")
            raise AIMalformedError("AI returned empty text")

        return AIResult(
            text=text,
            usage=self._usage(response, started, request.model or self._model),
        )

    def generate_structured(self, request: AIRequest, response_schema: dict) -> AIResult:
        started = time.monotonic()
        response = self._call(
            request,
            text_format={
                "type": "json_schema",
                "name": "aippo_result",
                # strict を付けないと、必須項目が欠けたまま返ることがある
                "strict": True,
                "schema": response_schema,
            },
        )
        self._raise_if_refused(response)

        raw = self._text_of(response)
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.warning("ai.openai.malformed_json")
            raise AIMalformedError("AI returned malformed JSON") from exc

        if not isinstance(payload, dict):
            raise AIMalformedError("AI returned a non-object payload")

        return AIResult(
            text=payload.get("result", "") if isinstance(payload.get("result"), str) else "",
            data=payload,
            usage=self._usage(response, started, request.model or self._model),
        )
