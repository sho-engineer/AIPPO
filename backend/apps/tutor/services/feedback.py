"""ポーのフィードバック生成のオーケストレーション。

責務:
1. attempt_count から hint_level を決める（AIの自己申告は採用しない）
2. AI を呼ぶ
3. 返ってきた JSON を Serializer で検証する
4. 失敗・不適合ならフォールバックへ差し替える

AI が全面停止していてもレッスンが止まらないことが要件（AIPPO 開発概要 §17）。
"""

import logging
from dataclasses import dataclass, field

from django.conf import settings

from apps.tutor.fallbacks import fallback_feedback
from apps.tutor.prompts import build_system_prompt, hint_level_for
from apps.tutor.serializers import TUTOR_RESPONSE_SCHEMA, TutorFeedbackResponseSerializer
from apps.tutor.services.base import AiProvider, AiProviderError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FeedbackResult:
    payload: dict
    origin: str  # "ai" | "fallback"
    model_name: str = ""
    token_usage: dict = field(default_factory=dict)


def generate_feedback(
    *,
    step: str,
    user_input: str,
    attempt_count: int,
    provider: AiProvider,
) -> FeedbackResult:
    system_prompt = build_system_prompt(step, attempt_count)
    hint_level = hint_level_for(attempt_count)

    try:
        raw = provider.generate_json(
            system_prompt=system_prompt,
            user_content=user_input,
            schema=TUTOR_RESPONSE_SCHEMA,
            timeout_seconds=settings.TUTOR_TIMEOUT_SECONDS,
            max_retries=settings.TUTOR_MAX_RETRIES,
        )
    except AiProviderError:
        # 例外の種類は provider 側でログ済み。本文は残さない。
        return FeedbackResult(fallback_feedback(step, attempt_count), origin="fallback")

    # 利用料の記録用メタデータ（AIPPO 開発概要 §17）。応答本体からは分離する。
    meta = raw.pop("_meta", {}) if isinstance(raw, dict) else {}

    serializer = TutorFeedbackResponseSerializer(
        data=raw, context={"hint_level": hint_level}
    )
    if not serializer.is_valid():
        logger.warning("tutor.response.invalid fields=%s", sorted(serializer.errors))
        return FeedbackResult(fallback_feedback(step, attempt_count), origin="fallback")

    payload = dict(serializer.validated_data)
    # hint_level はサーバー側が決める。AI の申告は採用しない。
    payload["hint_level"] = hint_level
    return FeedbackResult(
        payload,
        origin="ai",
        model_name=meta.get("model_name", ""),
        token_usage=meta.get("token_usage", {}),
    )
