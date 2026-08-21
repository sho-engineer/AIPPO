"""AI利用ごとの原価ログ（Phase 10: AI Cost Tracking の拡張）。

`apps.lessons.models.Attempt` は「レッスンの1ステップの試行」という
文脈（session・step・tutorのフィードバック等）を持つ記録で、
レッスンの中の AI 呼び出しにしか使えない。

Recipe を実際に試す・画像を生成する、といった
**レッスンのステップに紐付かない** AI 呼び出しも将来増える見込みのため、
そういう文脈を持たない、AI呼び出し全般の原価・Credit消費だけを見る
軽量なログをここに別途持つ。Attempt を置き換えるものではない
（レッスンの試行としての記録は、引き続き Attempt が持つ）。
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class AiUsageLog(models.Model):
    """1回のAI呼び出し = 1レコード。誰が・何のために・いくらかかったか。"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    #: 登録済みの人。ゲストなら null（guest_id を見る）
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="ai_usage_logs",
    )
    #: ゲストの learner_key。登録済みでも、その回に使った端末の鍵を残す
    guest_id = models.UUIDField(null=True, blank=True, db_index=True)

    lesson_id = models.CharField(max_length=100, blank=True)
    recipe_id = models.CharField(max_length=100, blank=True)

    #: 抽象化した課題の種類（rewrite / summarize / image_generate など）。
    #: モデル名そのものはここに置かない（apps/ai/pricing.py と同じ考え方）
    task_type = models.CharField(max_length=60, blank=True)
    provider = models.CharField(max_length=40, blank=True)
    model = models.CharField(max_length=100, blank=True)

    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    image_count = models.PositiveIntegerField(default=0)

    estimated_cost_usd = models.DecimalField(
        max_digits=10, decimal_places=6, null=True, blank=True
    )
    credit_consumed = models.PositiveIntegerField(default=0)

    success = models.BooleanField(default=True)
    error_type = models.CharField(max_length=40, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["task_type", "created_at"]),
            models.Index(fields=["provider", "created_at"]),
        ]
        verbose_name = "AI利用ログ"
        verbose_name_plural = "AI利用ログ"

    def __str__(self) -> str:
        who = self.user_id or self.guest_id or "?"
        return f"{who} {self.task_type} {self.provider}"
