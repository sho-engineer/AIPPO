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
    #: 学習として使えるものが返ってきたか（apps/ai/quality.py）。
    #:
    #: 空 = 一発で通った。値が入っている = **一度落ちた**——
    #: `copy`（元の文章をそのまま返した）、`not_shorter`（短くならなかった）
    #: など、どの検査で落ちたかの名前。
    #:
    #: 通ったかどうかは `status` が持つので、ここは「何が起きていたか」
    #: 専用。作り直して通った回もこの名前が残る——**残さないと、
    #: 直った回と最初から問題が無かった回を区別できず、
    #: どれだけ救えているのかが分からなくなる。**
    quality_kind = models.CharField(max_length=40, blank=True)

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
    # 無料枠の出入り。予約と結末を別々に数えないと、
    # 「送ったのに結果が返らなかった」回が見えない
    AI_ACTION_RESERVED = "ai_action_reserved"
    AI_ACTION_COMPLETED = "ai_action_completed"
    AI_ACTION_RELEASED = "ai_action_released"
    # 無料枠を足した場面
    GUEST_INITIAL_CREDIT_GRANTED = "guest_initial_credit_granted"
    DAILY_TEXT_CREDIT_GRANTED = "daily_text_credit_granted"
    REGISTRATION_TEXT_BONUS_GRANTED = "registration_text_bonus_granted"
    REGISTRATION_IMAGE_BONUS_GRANTED = "registration_image_bonus_granted"
    DAY7_IMAGE_CREDIT_GRANTED = "day7_image_credit_granted"
    DAY8_IMAGE_EDIT_CREDIT_GRANTED = "day8_image_edit_credit_granted"
    # 使い切ったところと、そこからどちらへ進んだか
    GUEST_TEXT_LIMIT_REACHED = "guest_text_limit_reached"
    REGISTER_NOW_CLICKED = "register_now_clicked"
    WAIT_TOMORROW_CLICKED = "wait_tomorrow_clicked"

    """
    詰まった人を、どう救えたか。

    見たいのは「何人登録したか」ではなく、**何人が最初の成功体験まで
    行けたか**。そこへ行けなかった人が、どこで、どう詰まって、
    何をして抜けたのか（あるいは抜けられなかったのか）を数える。

    品質まわりの4つは**サーバーが送る**。判定しているのがサーバーなので、
    画面からも送ると二重に数える。
    """
    GENERATION_QUALITY_FAILED = "generation_quality_failed"
    INTERNAL_RETRY_STARTED = "internal_retry_started"
    INTERNAL_RETRY_SUCCESS = "internal_retry_success"
    FALLBACK_RESULT_USED = "fallback_result_used"
    #: 詰まった人へ出した助け。押されたかどうかは別の名前で数える
    INPUT_ASSIST_SHOWN = "input_assist_shown"
    SAMPLE_FALLBACK_USED = "sample_fallback_used"
    #: **いちばん重い1本。** レッスンの主要な成功体験を通ったか。
    #: 最後の画面に着いたこと（`lesson_completed`）とは別に数える——
    #: AIを一度も成功させずに最後まで押し進むことができてしまうので。
    LEARNING_SUCCESS_REACHED = "learning_success_reached"
    #: 続きから戻ってきた道のり
    LESSON_RESUMED = "lesson_resumed"
    RETURNED_NEXT_DAY = "returned_next_day"
    NEXT_DAY_RESUME_CLICKED = "next_day_resume_clicked"
    #: 次の1本へ渡せたか
    NEXT_LESSON_PREVIEWED = "next_lesson_previewed"
    NEXT_LESSON_STARTED = "next_lesson_started"
    #: 覚えた技を、学習の外で使いに行ったか
    PRACTICAL_REUSE_CLICKED = "practical_reuse_clicked"
    ARTIFACT_REUSED = "artifact_reused"
    # 登録・ログインの入口で、どの道を押したか。
    # 押した先は外部（Google）や OS の画面なので、戻ってこなかった人は
    # この1件だけが記録に残る——どこで落ちたかは、ここでしか見えない
    AUTH_GOOGLE_CLICKED = "auth_google_clicked"
    AUTH_PASSKEY_CLICKED = "auth_passkey_clicked"
    # 認証を終えて、元のレッスンへ戻れた回。
    # ここまで来て初めて「登録して続きができた」と言える
    RETURNED_TO_LESSON = "returned_to_lesson"
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

    """ホームを作り直したあと、効いたかどうかを見るための4本。

    見たい問いは1つだけ。**開いた人のうち、何人がその日の1本を
    始めたか。** ホームの並びを変えた（今日やることを記録より上へ、
    浮いた面を10枚から1枚へ）のは、この率を上げるためだった。

        home_opened            … 分母。開いた回
        continue_lesson_clicked… 分子。今日の1本を押した回

    もう1つは、レッスンの山。**条件を足すと変わる**を見た回で、
    ここまで来れば続くと見ている場所。前は `step_viewed` に
    混ざっていて、通ったかどうかが分からなかった。

        compare_viewed … 比べる画面に着いた

    足さなかったもの
    ----------------
    `choice_selected` は `option_selected`、`progress_advanced` は
    `step_viewed`、`ai_result_viewed` は `first_result_generated`、
    `lesson_overview_viewed` は `outcome_preview_viewed` と
    ほぼ同じ出来事になる。**同じ出来事に2つ名前を作らない**——
    作ると、どちらを数えるかで結果が変わり、後から見た人は
    どちらが本当か決められない。
    """
    HOME_OPENED = "home_opened"
    CONTINUE_LESSON_CLICKED = "continue_lesson_clicked"
    COMPARE_VIEWED = "compare_viewed"

    """第一リリースの見張り（Analytics 14種）。

    足りていなかったのは、**詰まる場所と、続く理由**の両方。

      - 登録の途中で何に当たって落ちたか（Google・パスキー・再設定）
      - 学習の中でどこまで進んだか（区切り・技・XP・節目）
      - 作ったものを取っておいたか

    どれも画面は止まらずに進むので、記録が無いと気づけない。
    """
    GOOGLE_AUTH_FAILED = "google_auth_failed"
    PASSKEY_REGISTRATION_FAILED = "passkey_registration_failed"
    PASSWORD_RESET_REQUESTED = "password_reset_requested"
    PASSWORD_RESET_SENT = "password_reset_sent"
    MISSION_COMPLETED = "mission_completed"
    AI_SKILL_ACQUIRED = "ai_skill_acquired"
    XP_EARNED = "xp_earned"
    ARTIFACT_SAVED = "artifact_saved"
    SKILL_DICTIONARY_OPENED = "skill_dictionary_opened"
    COURSE_CHECKPOINT_COMPLETED = "course_checkpoint_completed"

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
    """
    どのレッスンの中の出来事か。**アカウントまわりの記録には無い。**

    登録・パスワード再設定・図鑑を開いた、はレッスンの外で起きる。
    そのために架空のセッションを作ると、学習の数え上げ（何本進めたか）に
    中身の無いセッションが混ざる。ここは空にできるようにして、
    誰のことかは下の `learner_key` で持つ。
    """
    session = models.ForeignKey(
        LearningSession,
        on_delete=models.CASCADE,
        related_name="events",
        null=True,
        blank=True,
    )
    #: セッションが無い記録の持ち主。ある記録では session 側が持っている
    learner_key = models.UUIDField(null=True, blank=True, db_index=True)
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


class AiActionType(models.TextChoices):
    """何を1回作ったか。**枠を分けて数える。**

    文章と画像を同じ「AI利用回数」にしない。画像1枚は文章1回の数十倍
    かかるので、同じ枠にすると文章の目安で決めた回数がそのまま画像の
    枚数を許してしまう。

    費用だけの話でもない。混ぜると、画像を数枚作った人がその日の
    **文章のレッスンまで使えなくなる**。逆も同じ。片方の使いすぎで
    もう片方が止まるのは、学習者から見て理由が分からない。

    画像を作るのと直すのも分ける。Day7 と Day8 で別々に1回ずつ渡すので、
    ひとつの枠にすると片方で使い切れてしまう。
    """

    TEXT = "text", "文章"
    IMAGE_GENERATION = "image_generation", "画像を作る"
    IMAGE_EDIT = "image_edit", "画像を直す"


class AiCreditGrantReason(models.TextChoices):
    """なぜ足したか。**同じ理由では二度足さない**（一意制約）。"""

    GUEST_INITIAL = "guest_initial", "登録前の最初の持ち出し"
    REGISTRATION_BONUS = "registration_bonus", "登録したとき"
    DAILY = "daily", "日が変わったとき"
    DAY7_LESSON = "day7_lesson", "Day7 に初めて着いたとき"
    DAY8_LESSON = "day8_lesson", "Day8 に初めて着いたとき"


class AiCreditGrant(models.Model):
    """足した記録。**二度足さないための鍵**でもある。

    「登録の特典を2回もらう」「Day7 を開き直すたびに画像が増える」を、
    アプリ側の判定ではなく**一意制約**で止める。判定で止めると、
    同時に2本来たときにすり抜ける。

    日次の分だけは日付も鍵に入れる（毎日1回ずつ足すため）。
    それ以外は日付を空にして、一生に一度にする。
    """

    learner_key = models.UUIDField(db_index=True)
    action_type = models.CharField(max_length=20, choices=AiActionType.choices)
    reason = models.CharField(max_length=30, choices=AiCreditGrantReason.choices)
    #: 日次のときだけ入れる。それ以外は空（＝一生に一度）
    on_date = models.DateField(null=True, blank=True)
    amount = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        """
        一意制約を**2本に分ける**。

        1本にまとめて `on_date` を含めると、日付の入らない付与
        （登録の特典、最初の持ち出し、レッスンの1回）が
        **まったく重複を止めない**。SQL では `NULL` どうしを
        「違う値」として扱うので、`(鍵, text, guest_initial, NULL)` が
        何行でも入る。

        実際そうなっていて、1回押すたびに最初の10がもう一度配られていた。
        気づいたのは、残りが減るはずの検査で**増えていた**から。

        日付が入るもの（毎日のぶん）と、入らないもの（一生に一度）で
        条件を分ければ、どちらも正しく止まる。
        """

        constraints = [
            models.UniqueConstraint(
                fields=["learner_key", "action_type", "reason", "on_date"],
                condition=models.Q(on_date__isnull=False),
                name="uniq_ai_credit_grant_daily",
            ),
            models.UniqueConstraint(
                fields=["learner_key", "action_type", "reason"],
                condition=models.Q(on_date__isnull=True),
                name="uniq_ai_credit_grant_once",
            ),
        ]
        verbose_name = "AI無料枠の付与"
        verbose_name_plural = "AI無料枠の付与"

    def __str__(self) -> str:
        return f"{self.action_type} +{self.amount} ({self.reason})"


class AiCreditBalance(models.Model):
    """その人の持ち分。**残高はここだけが本当**。

    `available` と `reserved` を分けて持つ。送る前に available から
    reserved へ動かし、結果が返ってから consumed へ動かすか、
    available へ戻す。こうしないと「送った瞬間に減って、失敗しても
    戻らない」——いま実際にそうなっている（`AiUsageCounter` は
    失敗しても戻さない）。

    書き換えは `services/credits.py` を通してのみ行う。
    """

    learner_key = models.UUIDField(db_index=True)
    action_type = models.CharField(max_length=20, choices=AiActionType.choices)
    available = models.PositiveIntegerField(default=0)
    #: 送っている最中のぶん。結果が返るまでここに置く
    reserved = models.PositiveIntegerField(default=0)
    #: これまでに使い切ったぶん。数え上げのためだけに持つ
    consumed = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["learner_key", "action_type"], name="uniq_ai_credit_balance"
            )
        ]
        verbose_name = "AI無料枠の残り"
        verbose_name_plural = "AI無料枠の残り"

    def __str__(self) -> str:
        return f"{self.action_type}: {self.available}（予約 {self.reserved}）"


class AiCreditStatus(models.TextChoices):
    RESERVED = "reserved", "送っている最中"
    CONSUMED = "consumed", "使った"
    RELEASED = "released", "戻した"


class AiCreditLedger(models.Model):
    """1回ぶんの出入り。**request_id で二重を止める。**

    残高だけでは、失敗して戻したのか最初から使っていないのかが
    分からない。ここに1行ずつ残せば、あとから数え直せる。

    `request_id` は画面が作る。同じ id で二度来たときは
    **新しく予約しない**——連打、通信の切れた再送、途中で戻る操作、
    どれでも1回として扱う。生成が成功したあとに切れた場合は、
    その id の結果をそのまま返せる（`attempt` を指してある）。
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    learner_key = models.UUIDField(db_index=True)
    action_type = models.CharField(max_length=20, choices=AiActionType.choices)
    status = models.CharField(max_length=10, choices=AiCreditStatus.choices)
    #: 画面が作る、この操作の名前。同じ操作の送り直しは同じ id
    request_id = models.UUIDField(db_index=True)
    lesson_id = models.CharField(max_length=60, blank=True)
    #: 成功したときだけ入る。切れたあとの問い合わせで結果を返すため
    attempt = models.ForeignKey(
        "lessons.Attempt",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="credit_entries",
    )
    #: 戻したときの理由（provider_error / timeout / expired など）
    note = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["learner_key", "action_type", "request_id"],
                name="uniq_ai_credit_request",
            )
        ]
        indexes = [models.Index(fields=["status", "created_at"])]
        verbose_name = "AI無料枠の出入り"
        verbose_name_plural = "AI無料枠の出入り"

    def __str__(self) -> str:
        return f"{self.action_type} {self.status} {self.request_id}"


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


class SavedArtifact(models.Model):
    """取っておいた成果物。

    「作ったもの」（`views_history` が `Attempt` から組み立てるもの）とは
    別に、**本人が取っておくと決めたもの**をここに持つ。

    なぜ本文を写すのか
    ------------------
    `Attempt` への参照だけにすると、`prune_data` が古いセッションを
    消したときに一緒に消える。取っておくと言った以上、元が消えても
    残らなければ意味がない。だから本文を写す。

    二重保存の防ぎ方
    ----------------
    同じ教材で、同じ出力を、何度でも取っておけるようにはしない。
    やり直すと似た文が並び、あとから探せなくなる。
    弾く単位は **(鍵, 教材, 出力のハッシュ)**。

      - 同じ条件で作り直した物 … 同じ出力になるので増えない
      - 違う条件で作った物     … 別物として残る

    「教材ごとに1つ」にしなかったのは、条件を変えて作り分けたものが
    上書きで消えるため。消えるほうが取り違えやすい。

    取っておけるのは登録した人だけ
    ------------------------------
    ゲストの鍵は7日で切れる（`apps/accounts/scope.py` の `can_keep`）。
    残らないものを取っておかせて黙って消すより、**取っておくには
    登録が要る**とその場で言うほうがよい。目印・修了証と同じ線。

    学ぶこと自体は止めない。ゲストのままでも教材は最後まで通るし、
    作ったものは「作ったもの」の一覧から取り出せる。
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    learner_key = models.UUIDField(db_index=True)
    #: 教材表とは外部キーで繋がない（教材を消しても記録が消えないように）
    lesson_id = models.CharField(max_length=100)
    title = models.CharField(
        max_length=120, help_text="既定は「{教材名}で作ったもの」。あとから直せる"
    )
    #: AIが作ったもの。元の `Attempt` が消えても、ここは残る
    output = models.TextField()
    #: そのとき指定した条件。なぜその結果になったかが後から分かる
    conditions = models.JSONField(default=dict, blank=True)
    #: 使ったAI技の slug。図鑑から「この技で作ったもの」を辿るため
    skills = models.JSONField(default=list, blank=True)
    #: `output` の sha256。二重保存を弾くためだけに使う
    output_hash = models.CharField(max_length=64)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["learner_key", "lesson_id", "output_hash"],
                name="uniq_saved_artifact",
            )
        ]
        indexes = [models.Index(fields=["learner_key", "-created_at"])]
        verbose_name = "取っておいた成果物"
        verbose_name_plural = "取っておいた成果物"

    def __str__(self) -> str:
        return self.title


class TimezoneSource(models.TextChoices):
    """どこから分かったか。**優先順位そのもの**（上ほど強い）。

    弱い出どころが、強い出どころを上書きしないための札。
    たとえば Cloudflare の国から推した席が、本人のブラウザが
    言った席を押しのけると、旅行中に席が毎日入れ替わる。
    """

    BROWSER = "browser", "ブラウザが言ってきた"
    GEO = "geo", "接続元から推した"
    DEFAULT = "default", "既定（Asia/Tokyo）"


class LearnerTimezone(models.Model):
    """その人が住んでいる暦。**毎日のぶんを配る境目を決める。**

    なぜ要るか
    ----------
    毎日のぶんは「最後に使ってから24時間後」ではなく、
    **その人の 00:00** に配る。サーバーの時計（Asia/Tokyo）で切ると、
    クアラルンプールの人は毎日 23:00 に日が変わることになる。
    夜に少しだけ触る人は、1日ぶんを丸ごと落とす。

    保存するのは席の名前だけ
    ------------------------
    ずれの分数（+09:00）ではなく IANA の名前（Asia/Tokyo）を持つ。
    夏時間のある地域では、ずれが年に2回変わる。名前で持てば、
    変換のたびに正しいずれが選ばれる。

    DBの時刻はぜんぶ UTC のまま
    ---------------------------
    ここは**判定のときだけ**使う。保存する時刻の意味を地域ごとに
    変えると、あとから集計できなくなる。

    毎回は推し直さない
    ------------------
    一度決めたら、**より強い出どころが来たときだけ**入れ替える
    （`TimezoneSource` の順）。要求のたびに接続元から推し直すと、
    VPN を切り替えるだけで席が動く。席が動くと日付が動き、
    日付が動くと毎日のぶんがもう一度配られる。
    """

    learner_key = models.UUIDField(unique=True)
    #: IANA の名前（Asia/Tokyo）。ずれの分数では持たない
    name = models.CharField(max_length=64)
    source = models.CharField(max_length=10, choices=TimezoneSource.choices)
    """最後に毎日のぶんを配った、その人の暦の日付。

    **戻らない**ための控え。席が西へ動くと、その人の「今日」は
    昨日へ戻りうる（東京の 9/1 朝は、ホノルルではまだ 8/31）。
    戻ったところで配ると、`(鍵, 種類, daily, 日付)` の鍵が変わるので、
    同じ1日に2回配られてしまう。ここより前の日付では配らない。
    """
    last_daily_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "学習者のタイムゾーン"
        verbose_name_plural = "学習者のタイムゾーン"

    def __str__(self) -> str:
        return f"{self.name} ({self.source})"
