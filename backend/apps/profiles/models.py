"""AI活用診断の結果（AIPPO 開発概要 §11 / §14）。

Q-1 の判断により、MVP で埋めるのは3項目のみ。
残りのフィールドは定義だけ用意し、フェーズ3で使い始める。
先に精度を作り込むと、レッスン完成が遅れるうえ手戻りも大きい。

Q-3 の判断により User は持たず、匿名 learner_key に紐づける。
"""

import uuid

from django.db import models


class AiExperience(models.TextChoices):
    NONE = "none", "使ったことがない"
    TRIED = "tried", "数回だけ使った"
    OCCASIONAL = "occasional", "ときどき使う"
    REGULAR = "regular", "日常的に使う"


class DetailPreference(models.TextChoices):
    BRIEF = "brief", "みじかく"
    STANDARD = "standard", "ふつう"
    DETAILED = "detailed", "くわしく"


class LearnerProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    learner_key = models.UUIDField(unique=True)

    # --- MVP で使用する3項目（診断3問） ---
    ai_experience = models.CharField(max_length=20, choices=AiExperience.choices)
    job_category = models.CharField(max_length=100)
    pain_point = models.CharField(max_length=200)

    # --- 定義のみ。フェーズ3で使い始める ---
    learning_goal = models.CharField(max_length=200, blank=True)
    detail_preference = models.CharField(
        max_length=20, choices=DetailPreference.choices, blank=True
    )
    used_ai_services = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.job_category} / {self.ai_experience}"


class UseCaseRecommendation(models.Model):
    """診断結果 → おすすめ用途の静的マッピング（AIPPO 開発概要 §11）。

    MVP ではスコアリングを行わない。
    「後から変えたい」ため、フロントエンドの JSON ではなく DB に置く。
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job_category = models.CharField(max_length=100)
    pain_point = models.CharField(max_length=200)
    lesson_id = models.CharField(max_length=100)
    use_case_id = models.CharField(max_length=100)
    headline = models.CharField(max_length=100)
    priority = models.PositiveSmallIntegerField(default=0)

    class Meta:
        indexes = [models.Index(fields=["job_category", "pain_point"])]
        ordering = ["priority"]
