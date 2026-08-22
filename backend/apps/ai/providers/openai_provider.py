"""OpenAI を使うプロバイダ。MVP の本番用。

既定モデルは `AI_MODEL`（既定値 gpt-5-nano）。
モデル名をここに直書きしないこと。将来のモデル比較コースでは、
教材データ側が呼び出しごとに model を指定する。

返却形式は **Structured Outputs（JSON Schema）** で拘束する。
それでも形が崩れることはあるので、受け取った後に
呼び出し側（apps/ai/actions.py）で必ず検証する。

ログに本文を残さない。落ちた理由の種別だけを記録する。

例外の種別だけでは足りない
--------------------------
`openai.APIError` は「鍵が無効」「モデル名が違う」「使えないモデル」
「quota切れ」「rate limit」を**すべて同じ例外クラスの下位クラス**で表す
（`AuthenticationError` / `NotFoundError` / `RateLimitError` など、
どれも `APIStatusError` の子）。`type(exc).__name__` はその区別を
そのまま持っているので、ログには HTTP status と、OpenAI 自身が
返す短い分類コード（`exc.code` — 例: `invalid_api_key` /
`model_not_found` / `insufficient_quota`）も一緒に残す。
どちらも本文や鍵の値ではなく、OpenAI が「これは秘密ではない」前提で
用意している分類用の短い文字列（SDK の `_exceptions.py` 参照）。
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

    def _call(
        self,
        request: AIRequest,
        text_format: dict | None,
        max_output_tokens: int | None = None,
    ):
        import openai

        timeout = request.timeout_seconds or settings.AI_REQUEST_TIMEOUT_SECONDS
        client = self._get_client().with_options(timeout=timeout, max_retries=0)

        model = request.model or self._model
        kwargs: dict = {
            "model": model,
            "instructions": request.system_prompt,
            "input": request.user_content,
            "max_output_tokens": max_output_tokens
            or request.max_output_tokens
            or settings.AI_MAX_OUTPUT_TOKENS,
        }
        if model.startswith("gpt-5") and settings.AI_REASONING_EFFORT:
            kwargs["reasoning"] = {"effort": settings.AI_REASONING_EFFORT}
        if text_format is not None:
            kwargs["text"] = {"format": text_format}

        try:
            return client.responses.create(**kwargs)
        except openai.APITimeoutError as exc:
            logger.warning("ai.openai.timeout timeout=%ss", timeout)
            raise AITimeoutError("AI request timed out") from exc
        except openai.APIError as exc:
            logger.warning(
                "ai.openai.error type=%s status=%s code=%s",
                type(exc).__name__,
                getattr(exc, "status_code", None),
                getattr(exc, "code", None),
            )
            raise AIProviderError("AI request failed") from exc

    @staticmethod
    def _usage(responses, started: float, model: str) -> AIUsage:
        if not isinstance(responses, (list, tuple)):
            responses = [responses]
        last_response = responses[-1]
        return AIUsage(
            provider="openai",
            model=getattr(last_response, "model", "") or model,
            input_tokens=sum(
                getattr(getattr(response, "usage", None), "input_tokens", 0) or 0
                for response in responses
            ),
            output_tokens=sum(
                getattr(getattr(response, "usage", None), "output_tokens", 0) or 0
                for response in responses
            ),
            latency_ms=int((time.monotonic() - started) * 1000),
        )

    @staticmethod
    def _incomplete_reason(response) -> str | None:
        if getattr(response, "status", None) != "incomplete":
            return None
        return getattr(getattr(response, "incomplete_details", None), "reason", None)

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
        text_format = {
            "type": "json_schema",
            "name": "aippo_result",
            # strict を付けないと、必須項目が欠けたまま返ることがある
            "strict": True,
            "schema": response_schema,
        }
        initial_cap = request.max_output_tokens or settings.AI_MAX_OUTPUT_TOKENS
        response = self._call(request, text_format, max_output_tokens=initial_cap)
        responses = [response]

        reason = self._incomplete_reason(response)
        if reason in ("max_output_tokens", "max_tokens"):
            retry_cap = max(initial_cap * 4, 2400)
            logger.warning(
                "ai.openai.incomplete reason=%s retry_tokens=%s", reason, retry_cap
            )
            response = self._call(request, text_format, max_output_tokens=retry_cap)
            responses.append(response)

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
            usage=self._usage(responses, started, request.model or self._model),
        )
