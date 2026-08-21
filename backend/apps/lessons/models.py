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
    # 教材データ側が step の id を決めるので、選択肢では縛らない。
    # 縛ると、レッスンを1本足すたびにマイグレーションが要る。
    current_step = models.CharField(max_length=50, default=LessonStep.INTRO)
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
    step = models.CharField(max_length=50)
    #: 何を頼んだか（rewrite / summarize / …）。apps/ai/actions.py の id。
    action = models.CharField(max_length=50, blank=True)

    # 入出力
    #
    # user_input は **既定では空**。AI_STORE_RAW_INPUT=true を明示した
    # ときだけ本文を入れる。学習者は会社の文章を貼るので、
    # 既定で溜め込むと、要らない責任を抱えることになる。
    user_input = models.TextField(blank=True)
    input_length = models.PositiveIntegerField(default=0)
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
    #: 失敗したときの種別（timeout / refused / malformed / provider_error）。
    #: 本文を残さない以上、あとから原因を追える手がかりはここだけ。
    error_kind = models.CharField(max_length=40, blank=True)

    # AI 利用料の記録（開発方針 §17）
    provider = models.CharField(max_length=40, blank=True)
    model_name = models.CharField(max_length=100, blank=True)
    token_usage = models.JSONField(default=dict, blank=True)
    latency_ms = models.PositiveIntegerField(null=True, blank=True)
    #: 概算費用（USD）。単価を設定していないプロバイダは null のまま
    #: （0円と「分からない」を混同しない。apps/ai/pricing.py 参照）。
    estimated_cost_usd = models.DecimalField(
        max_digits=10, decimal_places=6, null=True, blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["session", "sequence"], name="uniq_attempt_sequence")
        ]
        ordering = ["sequence"]


class LearningEventType(models.TextChoices):
    COURSE_STARTED = "course_started"
    COURSE_COMPLETED = "course_completed"
    STEP_VIEWED = "step_viewed"
    OPTION_SELECTED = "option_selected"
    TEXT_ENTERED = "text_entered"
    PROMPT_PREVIEW_OPENED = "prompt_preview_opened"
    AI_REQUEST_STARTED = "ai_request_started"
    AI_REQUEST_SUCCEEDED = "ai_request_succeeded"
    AI_REQUEST_FAILED = "ai_request_failed"
    HINT_OPENED = "hint_opened"
    REAL_TASK_STARTED = "real_task_started"
    REAL_TASK_SKIPPED = "real_task_skipped"
    PRIVACY_WARNING_SHOWN = "privacy_warning_shown"
    PRIVACY_WARNING_CANCELLED = "privacy_warning_cancelled"
    PRIVACY_WARNING_OVERRIDDEN = "privacy_warning_overridden"

    # 第一リリース（Closed Beta）で足したもの。
    # 登録までの落ち方と、引き継ぎの成否を見るために要る。
    DIAGNOSIS_STARTED = "diagnosis_started"
    DIAGNOSIS_COMPLETED = "diagnosis_completed"
    LESSON_VIEWED = "lesson_viewed"
    FIRST_RESULT_GENERATED = "first_result_generated"
    CONDITION_ADDED = "condition_added"
    IMPROVED_RESULT_GENERATED = "improved_result_generated"
    REAL_TASK_COMPLETED = "real_task_completed"
    SIGNUP_PROMPT_VIEWED = "signup_prompt_viewed"
    SIGNUP_STARTED = "signup_started"
    SIGNUP_COMPLETED = "signup_completed"
    GUEST_DATA_MIGRATION_STARTED = "guest_data_migration_started"
    GUEST_DATA_MIGRATION_COMPLETED = "guest_data_migration_completed"
    GUEST_DATA_MIGRATION_FAILED = "guest_data_migration_failed"
    LOGIN_COMPLETED = "login_completed"
    COMING_SOON_VIEWED = "coming_soon_viewed"

    # 成果物ファーストの各ステップ。
    #
    # 画面を作り直したときに足すのを忘れており、送られてくるのに 400 で
    # 捨てていた。捨てても画面は止まらない作りなので誰も気づかず、
    # **レッスンの前半だけ記録が空**という状態になっていた。
    # 詰まるのはたいてい前半なので、いちばん見たいところが欠けていた。
    OUTCOME_PREVIEW_VIEWED = "outcome_preview_viewed"
    QUICK_TRY_STARTED = "quick_try_started"
    RESULT_OBSERVATION_SUBMITTED = "result_observation_submitted"
    CONCEPT_CARD_VIEWED = "concept_card_viewed"
    CONCEPT_CARD_SKIPPED = "concept_card_skipped"

    # 旧レッスンから使っているもの。消すと過去のログが読めなくなる。
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

    # Learning Path / Recipe / Stamp / Credit（apps.rewards）
    LEARNING_PATH_STARTED = "learning_path_started"
    RECIPE_VIEWED = "recipe_viewed"
    RECIPE_STARTED = "recipe_started"
    RECIPE_COMPLETED = "recipe_completed"
    STAMP_EARNED = "stamp_earned"
    REWARD_CLAIMED = "reward_claimed"
    CREDIT_EARNED = "credit_earned"
    CREDIT_CONSUMED = "credit_consumed"
    CREDIT_INSUFFICIENT = "credit_insufficient"


class LearningEvent(models.Model):
    """操作ログ。

    Q-2 の判断により、ユーザー入力の本文は保存しない。
    文字数のみを記録し、本文は Attempt 側に置く。
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(LearningSession, on_delete=models.CASCADE, related_name="events")
    lesson_id = models.CharField(max_length=100, blank=True)
    step = models.CharField(max_length=50, blank=True)
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

    #: HMAC-SHA256 の16進表記は 64 文字。学習者ごとのものは
    #: `learner:` が付いて 72 文字になる。64 では入りきらない。
    #: SQLite は長さを無視して書けてしまうので、PostgreSQL で初めて落ちる。
    #: 印を足す余地も含めて広めに取る（`tests/test_ai_quota.py` が見張る）。
    scope = models.CharField(
        max_length=128, help_text="global、またはIP・学習者のHMAC"
    )
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


class Bookmark(models.Model):
    """あとで見返したい教材の目印。

    このアプリの教材は1本10分で、途中で抜けることが前提になっている。
    だが「気になったが、いまは時間が無い」を残す場所がどこにも無く、
    見つけた教材は次に開いたときには忘れられていた。

    復習（views_review）とは別のもの
    --------------------------------
    復習は**終えたもの**を、忘れる前に呼び戻す。
    こちらは**まだ始めていないもの**を、自分の意思で取っておく。
    片方だけだと「気になったが始めていない」教材が抜け落ちる。

    進捗と混ぜない
    --------------
    目印を付けただけで「始めた」ことにはしない。混ぜると、
    見た数だけ進んだように見えて、進捗の数字が信用できなくなる。

    消えてよい
    ----------
    ゲストの記録は 30日 で消える（prune_data）。目印もその一部として
    消える。取っておいたものが消えるのは惜しいが、
    「消しますと書いたものを消さない」ほうが問題になる。

    そもそも、目印を付けられるのは登録した人だけにした
    （views_bookmarks の `can_keep`）。ゲストの鍵は7日で切れるので、
    付けられても数日で本人から取り出せなくなるため。この表に
    ゲストの行が増えるのは、この作りより前の分だけ。
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    learner_key = models.UUIDField(db_index=True)
    lesson_id = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            # 二重に付けられると、一覧に同じものが並ぶ。
            # 付け外しは「ある／ない」の2状態しか無いので、
            # 数える必要はない
            models.UniqueConstraint(
                fields=["learner_key", "lesson_id"], name="uniq_bookmark_learner_lesson"
            )
        ]
        indexes = [models.Index(fields=["learner_key", "created_at"])]
        # 新しいものから見せる。取っておいた順より、
        # 最後に気になったものを上に置くほうが探しやすい
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.lesson_id} ({self.learner_key})"
