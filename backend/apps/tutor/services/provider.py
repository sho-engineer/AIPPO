"""Anthropic Claude を使う AiProvider 実装。

- モデルは settings.AI_MODEL（既定 claude-opus-5）
- 構造化出力（output_config.format）で返却形式をスキーマレベルで拘束する
- 会話履歴は送らない。1回のフィードバックは1リクエストで完結させる
- ログに user_input の本文を残さない
- 利用料の記録用に model_name / token_usage を `_meta` で返す（§17）
"""

import json
import logging

from django.conf import settings

from apps.tutor.services.base import AiProvider, AiProviderError, AiTimeoutError

logger = logging.getLogger(__name__)


class AnthropicProvider(AiProvider):
    def __init__(self, client=None, model: str | None = None) -> None:
        self._client = client
        self._model = model or settings.AI_MODEL

    def _get_client(self):
        if self._client is None:
            import anthropic

            # ANTHROPIC_API_KEY を環境から解決する
            self._client = anthropic.Anthropic()
        return self._client

    def generate_json(
        self,
        *,
        system_prompt: str,
        user_content: str,
        schema: dict,
        timeout_seconds: float,
        max_retries: int,
    ) -> dict:
        import anthropic

        client = self._get_client().with_options(
            timeout=timeout_seconds,
            max_retries=max_retries,
        )

        try:
            response = client.messages.create(
                model=self._model,
                max_tokens=1024,
                system=system_prompt,
                # 短いフィードバック生成なので思考は浅くてよい
                output_config={
                    "effort": "low",
                    "format": {"type": "json_schema", "schema": schema},
                },
                messages=[{"role": "user", "content": user_content}],
            )
        except anthropic.APITimeoutError as exc:
            logger.warning("tutor.ai.timeout timeout=%ss", timeout_seconds)
            raise AiTimeoutError("AI request timed out") from exc
        except anthropic.APIError as exc:
            logger.warning("tutor.ai.error type=%s", type(exc).__name__)
            raise AiProviderError("AI request failed") from exc

        if response.stop_reason == "refusal":
            logger.warning("tutor.ai.refusal")
            raise AiProviderError("AI declined the request")

        text = next((b.text for b in response.content if b.type == "text"), "")
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            logger.warning("tutor.ai.malformed_json")
            raise AiProviderError("AI returned malformed JSON") from exc

        if not isinstance(payload, dict):
            raise AiProviderError("AI returned a non-object payload")

        payload["_meta"] = {
            "model_name": response.model,
            "token_usage": {
                "input": response.usage.input_tokens,
                "output": response.usage.output_tokens,
                "cache_read": getattr(response.usage, "cache_read_input_tokens", 0) or 0,
            },
        }
        return payload


def get_provider() -> AiProvider:
    """設定に応じてプロバイダを組み立てる。"""
    if settings.AI_PROVIDER == "anthropic":
        return AnthropicProvider()

    from apps.tutor.services.stub import StubProvider

    return StubProvider()
