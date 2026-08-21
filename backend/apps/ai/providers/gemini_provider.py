"""Google Gemini を使うプロバイダ。

費用と無料枠（開発時）の都合で、Phase 8 以降はこれを既定にする
（`config/settings.py` の `AI_PROVIDER` 既定値）。ただしこれは
**開発・MVP 前提の既定**であり、本番でユーザーの入力（仕事の文章・
機密情報・個人情報を含みうる）を扱うときは必ず Paid Tier の鍵を使うこと。

  Free Tier … 入力が学習に使われうる契約。開発・検証専用
  Paid Tier … 学習利用しない契約条件を選べる。本番はこちら

このファイル自身は、渡された鍵がどちらの契約かを検知できない
（Gemini API はそれを返さない）。運用側（.env・デプロイ設定・
契約時の確認）で必ず守ること。README/docs 側にも明記する。

既定モデルは `AI_MODEL_GEMINI`（既定値 gemini-2.5-flash）。
モデル名をここに直書きしないこと。将来のモデル比較コースでは、
教材データ側が呼び出しごとに model を指定する（他プロバイダと同じ形）。

返却形式は `response_json_schema` で拘束する。それでも形が崩れる
ことはあるので、受け取った後に呼び出し側（apps/ai/actions.py）で
必ず検証する。

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

#: 詰まった／届かなかった系のステータス。タイムアウト扱いにする。
_TIMEOUT_CODES = frozenset({408, 504})

#: 内容を理由に止まった側の finish_reason。拒否として扱う。
_REFUSAL_FINISH_REASONS = frozenset({"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "RECITATION"})


class GeminiProvider(AIProvider):
    name = "gemini"

    def __init__(self, client=None, model: str | None = None) -> None:
        self._client = client
        self._model = model or settings.AI_MODEL_GEMINI

    def _get_client(self):
        if self._client is None:
            from google import genai

            # GEMINI_API_KEY を環境から解決する
            self._client = genai.Client(api_key=settings.GEMINI_API_KEY or None)
        return self._client

    def _call(self, request: AIRequest, *, response_json_schema: dict | None):
        from google.genai import errors, types

        timeout = request.timeout_seconds or settings.AI_REQUEST_TIMEOUT_SECONDS
        config = types.GenerateContentConfig(
            system_instruction=request.system_prompt,
            max_output_tokens=(
                request.max_output_tokens or settings.AI_MAX_OUTPUT_TOKENS
            ),
            http_options=types.HttpOptions(timeout=int(timeout * 1000)),
        )
        if response_json_schema is not None:
            config.response_mime_type = "application/json"
            config.response_json_schema = response_json_schema

        try:
            return self._get_client().models.generate_content(
                model=request.model or self._model,
                contents=request.user_content,
                config=config,
            )
        except TimeoutError as exc:
            logger.warning("ai.gemini.timeout timeout=%ss", timeout)
            raise AITimeoutError("AI request timed out") from exc
        except errors.APIError as exc:
            if exc.code in _TIMEOUT_CODES:
                logger.warning("ai.gemini.timeout timeout=%ss", timeout)
                raise AITimeoutError("AI request timed out") from exc
            logger.warning("ai.gemini.error code=%s", exc.code)
            raise AIProviderError("AI request failed") from exc

    @staticmethod
    def _finish_reason(response) -> str:
        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            return ""
        reason = getattr(candidates[0], "finish_reason", "") or ""
        return getattr(reason, "name", reason) if not isinstance(reason, str) else reason

    def _raise_if_refused(self, response) -> None:
        reason = self._finish_reason(response)
        if reason in _REFUSAL_FINISH_REASONS:
            logger.warning("ai.gemini.refusal reason=%s", reason)
            raise AIRefusedError("AI declined the request")

    @staticmethod
    def _usage(response, started: float, model: str) -> AIUsage:
        meta = getattr(response, "usage_metadata", None)
        return AIUsage(
            provider="gemini",
            model=getattr(response, "model_version", "") or model,
            input_tokens=getattr(meta, "prompt_token_count", 0) or 0,
            output_tokens=getattr(meta, "candidates_token_count", 0) or 0,
            latency_ms=int((time.monotonic() - started) * 1000),
        )

    def generate_text(self, request: AIRequest) -> AIResult:
        started = time.monotonic()
        response = self._call(request, response_json_schema=None)
        self._raise_if_refused(response)

        text = (getattr(response, "text", None) or "").strip()
        if not text:
            logger.warning("ai.gemini.empty_output")
            raise AIMalformedError("AI returned empty text")

        return AIResult(
            text=text,
            usage=self._usage(response, started, request.model or self._model),
        )

    def generate_structured(self, request: AIRequest, response_schema: dict) -> AIResult:
        started = time.monotonic()
        response = self._call(request, response_json_schema=response_schema)
        self._raise_if_refused(response)

        raw = getattr(response, "text", None) or ""
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.warning("ai.gemini.malformed_json")
            raise AIMalformedError("AI returned malformed JSON") from exc

        if not isinstance(payload, dict):
            raise AIMalformedError("AI returned a non-object payload")

        return AIResult(
            text=payload.get("result", "") if isinstance(payload.get("result"), str) else "",
            data=payload,
            usage=self._usage(response, started, request.model or self._model),
        )
