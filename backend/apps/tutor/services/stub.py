"""開発・テスト用のスタブプロバイダ。

AI_PROVIDER=stub のままレッスンを完走できることが、
AIPPO 開発概要 §17 とプロジェクト憲章 原則 III の要件。
"""

from apps.tutor.fallbacks import fallback_feedback
from apps.tutor.services.base import AiProvider


class StubProvider(AiProvider):
    def generate_json(
        self,
        *,
        system_prompt: str,
        user_content: str,
        schema: dict,
        timeout_seconds: float,
        max_retries: int,
    ) -> dict:
        # 固定ヒントと同じ内容を返す。スタブは決定論的であればよい。
        payload = fallback_feedback("review_input", 1)
        payload["_meta"] = {"model_name": "stub", "token_usage": {}}
        return payload
