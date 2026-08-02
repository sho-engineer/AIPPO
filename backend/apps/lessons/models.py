"""学習セッション・試行・学習イベント・習得記録・アンケート。

設計判断（docs/aippo-mvp-design.md）:
- Q-2: LearningEvent は本文を持たない。文字数のみ記録する
- Q-3: MVP は User を持たず、匿名 learner_key で識別する
- Q-5: AiRun と TutorFeedback を Attempt へ統合する（AIPPO 開発概要 §14）

ユーザーが入力した本文が入るのは Attempt と LearningSession のみ。
"""

import uuid

from django.db import models


class LessonStep(models.TextChoices):
    """AIPPO 開発概要 §9 の学習状態。"""

    INTRO = "INTRO"
    SELECT_USE_CASE = "SELECT_USE_CASE"
    FIRST_INPUT = "FIRST_INPUT"
    GENERATING = "GENERATING"
    REVIEW_RESULT = "REVIEW_RESULT"
    IMPROVE_INPUT = "IMPROVE_INPUT"
    REAL_TASK = "REAL_TASK"
    REFLECTION = "REFLECTION"
    COMPLETE = "COMPLETE"


class LearningSession(models.Model):
    """1人の学習者による1回のレッスン挑戦。"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    learner_key = models.UUIDField(db_index=True)
    lesson_id = models.CharField(max_length=100)
    current_step = models.CharField(
        max_length=50, choices=LessonStep.choices, default=LessonStep.INTRO
    )
    use_case_id = models.CharField(max_length=100, blank=True)
    fill_in_values = models.JSONField(default=dict)
    real_task_text = models.TextField(blank=True)
    attempt_count = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["learner_key", "lesson_id"]),
            models.Index(fields=["completed_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.lesson_id} / {self.current_step}"


class AttemptStatus(models.TextChoices):
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    TIMEOUT = "timeout"


class TutorEmotion(models.TextChoices):
    """ポーの表示状態（AIPPO 開発概要 §7）。"""

    NEUTRAL = "neutral"
    QUESTION = "question"
    THINKING = "thinking"
    HINT = "hint"
    WARNING = "warning"
    CELEBRATE = "celebrate"


class TutorAction(models.TextChoices):
    WAIT = "wait"
    RETRY = "retry"
    NEXT = "next"
    SHOW_HINT = "show_hint"
    COMPLETE = "complete"


class TutorOrigin(models.TextChoices):
    """ポーの発言が AI 生成か固定文かの区別（開発方針 §17）。"""

    AI = "ai"
    FALLBACK = "fallback"


class Attempt(models.Model):
    """1回のユーザー操作。AI生成とポーのフィードバックを1レコードに持つ。

    AIPPO 開発概要 §14 に合わせ、旧 AiRun / TutorFeedback を統合したもの。
    1操作＝1レコードなのでログ分析が単純になり、
    利用料（model_name / token_usage）の記録先も明確になる。
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        LearningSession, on_delete=models.CASCADE, related_name="attempts"
    )
    sequence = models.PositiveIntegerField()
    lesson_id = models.CharField(max_length=100)
    step = models.CharField(max_length=50, choices=LessonStep.choices)

    # 入出力（本文はここに置く）
    user_input = models.TextField(blank=True)
    conditions = models.JSONField(default=dict)
    generated_output = models.TextField(blank=True)

    # ポーのフィードバック
    tutor_message = models.CharField(max_length=150, blank=True)
    tutor_emotion = models.CharField(max_length=20, choices=TutorEmotion.choices, blank=True)
    tutor_action = models.CharField(max_length=20, choices=TutorAction.choices, blank=True)
    tutor_origin = models.CharField(max_length=20, choices=TutorOrigin.choices, blank=True)
    hint_level = models.PositiveSmallIntegerField(default=0)

    completed = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=AttemptStatus.choices)

    # AI 利用料の記録（開発方針 §17）
    model_name = models.CharField(max_length=100, blank=True)
    token_usage = models.JSONField(default=dict, blank=True)
    latency_ms = models.PositiveIntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["session", "sequence"], name="uniq_attempt_sequence")
        ]
        ordering = ["sequence"]


class LearningEventType(models.TextChoices):
    LESSON_STARTED = "lesson_started"
    USE_CASE_SELECTED = "use_case_selected"
    STEP_ENTERED = "step_entered"
    INPUT_SUBMITTED = "input_submitted"
    AI_RUN_REQUESTED = "ai_run_requested"
    AI_RUN_SUCCEEDED = "ai_run_succeeded"
    AI_RUN_FAILED = "ai_run_failed"
    HINT_SHOWN = "hint_shown"
    IMPROVEMENT_SELECTED = "improvement_selected"
    REAL_TASK_SUBMITTED = "real_task_submitted"
    LESSON_COMPLETED = "lesson_completed"
    LESSON_ABANDONED = "lesson_abandoned"
    TUTOR_FALLBACK_USED = "tutor_fallback_used"


class LearningEvent(models.Model):
    """操作ログ。

    Q-2 の判断により、ユーザー入力の本文は保存しない。
    文字数のみを記録し、本文は Attempt 側に置く。
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(LearningSession, on_delete=models.CASCADE, related_name="events")
    lesson_id = models.CharField(max_length=100, blank=True)
    step = models.CharField(max_length=50, choices=LessonStep.choices, blank=True)
    event_type = models.CharField(max_length=50, choices=LearningEventType.choices, db_index=True)
    input_length = models.PositiveIntegerField(default=0)
    hint_count = models.PositiveIntegerField(default=0)
    retry_count = models.PositiveIntegerField(default=0)
    completed = models.BooleanField(default=False)
    duration_ms = models.PositiveIntegerField(null=True, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["session", "occurred_at"])]
        ordering = ["occurred_at"]


class SkillProgress(models.Model):
    """できるようになったこと（AIPPO 開発概要 §3 step 8 / §14）。"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    learner_key = models.UUIDField(db_index=True)
    skill_key = models.CharField(max_length=100)
    lesson_id = models.CharField(max_length=100)
    acquired_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["learner_key", "skill_key"], name="uniq_learner_skill"
            )
        ]
        ordering = ["acquired_at"]


class AiUsageCounter(models.Model):
    """AI実行回数の日次カウンタ（AI利用料の暴走を止めるため）。

    セッション単位の上限だけでは、Cookie を消すたびに新しいセッションになり
    いくらでも実行できてしまう。公開すると利用料が青天井になるため、
    **接続元単位** と **全体** の1日あたり上限をここで数える。

    憲章 原則 VI（個人データは最小限）に従い、**IPアドレスそのものは保存しない**。
    SECRET_KEY を鍵にした HMAC の値だけを持つ。
    元のIPは復元できず、同じIPかどうかの判定にだけ使える。
    """

    #: 全体の上限に使う固定スコープ。
    GLOBAL_SCOPE = "global"

    scope = models.CharField(max_length=64, help_text="global、またはIPのHMAC")
    date = models.DateField()
    count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["scope", "date"], name="uniq_ai_usage_scope_date")
        ]
        indexes = [models.Index(fields=["date"])]

    def __str__(self) -> str:
        return f"{self.date} {self.scope[:12]} = {self.count}"


class Survey(models.Model):
    """完了時の簡易アンケート（AIPPO 開発概要 §11）。

    MVP の検証項目のうち、アプリ内イベントでは測れない
    「7日以内の再利用」「有料利用の意向」をここで取得する。
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.OneToOneField(
        LearningSession, on_delete=models.CASCADE, related_name="survey"
    )
    answers = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
