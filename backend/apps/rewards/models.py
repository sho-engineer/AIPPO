"""Learning Path / Recipe / Stamp / Credit の土台。

一貫した学習体験を、この順で支える。

    Lesson → Learning Path → Applied Recipe → Stamp → Credit → 実際のAI利用

既存の `apps.catalog`（Course / Lesson / LessonStep）は変更しない。
`LearningPathLesson` は既存の Lesson を **参照するだけ** の中間テーブルで、
同じ Lesson を複数の Learning Path から使っても Lesson の行は複製されない
（設計方針の「Lesson dataをPathごとに複製しない」を、スキーマで守る）。

Stamp と Credit は別物として扱う。

    Stamp  … 達成の記録（1件ずつ、earn-once）。ゲストのままでも埋まる
    Credit … AI実行に使える内部通貨。**account が要る**（下記参照）

Credit を account 必須にした理由
---------------------------------
ゲストの learner_key は7日で切れ、複製・使い捨ても容易なため、
金銭的価値のある Credit をゲストへ配ると、際限のない取得を防げない。
スタンプ自体はゲストのままでも埋まるので、「スタンプは獲得しました。
Credit を受け取るには進捗を保存してください」という導線で account へ促す
（学習方針そのままの前向きな誘導で、達成を無かったことにはしない）。
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models

from apps.catalog.models import AccessType, AvailabilityStatus, Difficulty, Lesson, PublishStatus


class LearningPath(models.Model):
    """複数 Lesson を目的別に束ねる単位。Stamp Rally の単位でもある。"""

    slug = models.SlugField(max_length=80, unique=True, help_text="URLと保存に使う名前")
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    short_description = models.CharField(
        max_length=200, blank=True, help_text="一覧カードに出す1行説明"
    )
    category = models.CharField(max_length=60, blank=True)
    difficulty = models.CharField(
        max_length=20, choices=Difficulty.choices, default=Difficulty.BEGINNER
    )
    access_type = models.CharField(
        max_length=20, choices=AccessType.choices, default=AccessType.FREE
    )
    status = models.CharField(
        max_length=20, choices=PublishStatus.choices, default=PublishStatus.DRAFT
    )
    availability_status = models.CharField(
        max_length=20,
        choices=AvailabilityStatus.choices,
        default=AvailabilityStatus.COMING_SOON,
        verbose_name="利用可能状態",
    )
    sort_order = models.PositiveIntegerField(default=0)
    estimated_total_minutes = models.PositiveIntegerField(null=True, blank=True)
    badge_name = models.CharField(
        max_length=120, blank=True, help_text="完走したときの証の名前"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("sort_order", "id")
        verbose_name = "学習パス"
        verbose_name_plural = "学習パス"

    def __str__(self) -> str:
        return self.title

    @property
    def is_public(self) -> bool:
        return self.status == PublishStatus.PUBLISHED

    @property
    def is_startable(self) -> bool:
        return self.is_public and self.availability_status == AvailabilityStatus.AVAILABLE


class LearningPathLesson(models.Model):
    """Learning Path が、どの Lesson を・どの順で使うかの参照。

    Lesson 自体はここへ複製しない。同じ Lesson を複数の Path に
    足しても、Lesson の行も steps の行も増えない。
    """

    learning_path = models.ForeignKey(
        LearningPath, related_name="path_lessons", on_delete=models.CASCADE
    )
    lesson = models.ForeignKey(
        Lesson, related_name="path_memberships", on_delete=models.CASCADE
    )
    order = models.PositiveIntegerField(default=0)
    day_number = models.PositiveIntegerField(
        null=True, blank=True, help_text="「Day 3」のように出す。無ければ出さない"
    )
    is_required = models.BooleanField(default=True)
    stamp_eligible = models.BooleanField(
        default=True, help_text="このLessonを完了したとき、このPathのスタンプを埋めるか"
    )

    class Meta:
        ordering = ("order", "id")
        constraints = [
            models.UniqueConstraint(
                fields=["learning_path", "lesson"], name="uniq_path_lesson"
            )
        ]
        verbose_name = "パスのレッスン"
        verbose_name_plural = "パスのレッスン"

    def __str__(self) -> str:
        return f"{self.learning_path.slug} / {self.lesson.slug}"


class Recipe(models.Model):
    """複数Skillを組み合わせた実務応用。ユーザー向けには「こんな使い方もできます」。"""

    slug = models.SlugField(max_length=80, unique=True)
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=60, blank=True)
    access_type = models.CharField(
        max_length=20, choices=AccessType.choices, default=AccessType.FREE
    )
    status = models.CharField(
        max_length=20, choices=PublishStatus.choices, default=PublishStatus.DRAFT
    )
    availability_status = models.CharField(
        max_length=20,
        choices=AvailabilityStatus.choices,
        default=AvailabilityStatus.AVAILABLE,
        verbose_name="利用可能状態",
    )
    example_input = models.TextField(blank=True)
    example_output = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("sort_order", "id")
        verbose_name = "レシピ"
        verbose_name_plural = "レシピ（こんな使い方もできます）"

    def __str__(self) -> str:
        return self.title

    @property
    def is_public(self) -> bool:
        return self.status == PublishStatus.PUBLISHED


class RecipeRequiredLesson(models.Model):
    """このRecipeを使うのに必要なLesson（Skill）。"""

    recipe = models.ForeignKey(
        Recipe, related_name="required_lessons", on_delete=models.CASCADE
    )
    lesson = models.ForeignKey(
        Lesson, related_name="required_by_recipes", on_delete=models.CASCADE
    )
    order = models.PositiveIntegerField(default=0)
    required = models.BooleanField(
        default=True, help_text="False なら「あるとなお良い」程度の任意扱い"
    )

    class Meta:
        ordering = ("order", "id")
        constraints = [
            models.UniqueConstraint(
                fields=["recipe", "lesson"], name="uniq_recipe_lesson"
            )
        ]
        verbose_name = "レシピの必要スキル"
        verbose_name_plural = "レシピの必要スキル"

    def __str__(self) -> str:
        return f"{self.recipe.slug} / {self.lesson.slug}"


class RecipeLearningPath(models.Model):
    """同じRecipeを、複数のLearning Pathの完了画面に出すための紐付け。"""

    recipe = models.ForeignKey(
        Recipe, related_name="path_links", on_delete=models.CASCADE
    )
    learning_path = models.ForeignKey(
        LearningPath, related_name="recipe_links", on_delete=models.CASCADE
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["recipe", "learning_path"], name="uniq_recipe_path"
            )
        ]
        verbose_name = "レシピの掲載パス"
        verbose_name_plural = "レシピの掲載パス"

    def __str__(self) -> str:
        return f"{self.recipe.slug} @ {self.learning_path.slug}"


class StampType(models.TextChoices):
    """スタンプの獲得条件。同一達成での二重付与は防ぐ（下の UserStamp 参照）。"""

    LESSON = "lesson", "レッスン完了"
    PRACTICAL_TASK = "practical_task", "実践課題完了"
    RECIPE = "recipe", "レシピを試した"
    PATH_CHALLENGE = "path_challenge", "パスの課題完了"


class StampDefinition(models.Model):
    """Learning Pathの中の、スタンプ1個ぶんの定義。"""

    learning_path = models.ForeignKey(
        LearningPath, related_name="stamp_definitions", on_delete=models.CASCADE
    )
    stamp_type = models.CharField(max_length=20, choices=StampType.choices)
    #: stamp_type=lesson/practical_task のとき使う
    lesson = models.ForeignKey(
        Lesson, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    #: stamp_type=recipe のとき使う
    recipe = models.ForeignKey(
        Recipe, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    title = models.CharField(max_length=120)
    order = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("order", "id")
        verbose_name = "スタンプ定義"
        verbose_name_plural = "スタンプ定義"

    def __str__(self) -> str:
        return f"{self.learning_path.slug} / {self.title}"


class UserStamp(models.Model):
    """誰が・どのスタンプを・いつ埋めたか。

    account はまだ必須にしない。ゲストのままでもスタンプは埋まる
    （憲章 原則：登録なしでも学べる）。複数端末の集計は、他の学習記録と
    同じく `learner_key` の集合（apps.accounts.scope.readable_keys）で行う。
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    learner_key = models.UUIDField(db_index=True)
    stamp_definition = models.ForeignKey(
        StampDefinition, related_name="earned", on_delete=models.CASCADE
    )
    earned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["learner_key", "stamp_definition"], name="uniq_learner_stamp"
            )
        ]
        ordering = ["earned_at"]
        verbose_name = "獲得スタンプ"
        verbose_name_plural = "獲得スタンプ"


class PathRewardMilestone(models.Model):
    """スタンプが何個埋まったら、Creditをいくら渡すか。毎スタンプでは配らない。"""

    learning_path = models.ForeignKey(
        LearningPath, related_name="milestones", on_delete=models.CASCADE
    )
    required_stamp_count = models.PositiveIntegerField()
    reward_credits = models.PositiveIntegerField(default=0)
    badge_name = models.CharField(max_length=120, blank=True)
    order = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("required_stamp_count",)
        constraints = [
            models.UniqueConstraint(
                fields=["learning_path", "required_stamp_count"],
                name="uniq_path_milestone_count",
            )
        ]
        verbose_name = "節目の特典"
        verbose_name_plural = "節目の特典"

    def __str__(self) -> str:
        return (
            f"{self.learning_path.slug} / "
            f"{self.required_stamp_count}個で{self.reward_credits}Credit"
        )


class UserRewardClaim(models.Model):
    """この節目ぶんのCreditを、もう配ったか。ここが無いと二重に配ってしまう。

    account 必須（クラス docstring 参照）。
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="reward_claims", on_delete=models.CASCADE
    )
    milestone = models.ForeignKey(
        PathRewardMilestone, related_name="claims", on_delete=models.CASCADE
    )
    claimed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "milestone"], name="uniq_user_milestone_claim"
            )
        ]
        ordering = ["claimed_at"]
        verbose_name = "節目特典の受け取り"
        verbose_name_plural = "節目特典の受け取り"


class CreditWallet(models.Model):
    """account 1つにつき1つ。残高はここだけが真実（後述の ledger.py 経由でのみ書き換える）。"""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, related_name="credit_wallet", on_delete=models.CASCADE
    )
    balance = models.IntegerField(default=0)
    lifetime_earned = models.IntegerField(default=0)
    lifetime_spent = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Credit残高"
        verbose_name_plural = "Credit残高"

    def __str__(self) -> str:
        return f"{self.user} : {self.balance}"


class CreditTransactionType(models.TextChoices):
    REWARD = "reward", "報酬"
    CONSUME = "consume", "消費"
    ADJUSTMENT = "adjustment", "調整"
    PURCHASE = "purchase", "購入"


class CreditTransaction(models.Model):
    """残高の動きを1件ずつ記録する。balanceだけを直接更新しない（ledger方式）。"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="credit_transactions", on_delete=models.CASCADE
    )
    type = models.CharField(max_length=20, choices=CreditTransactionType.choices)
    #: reward/purchase/adjustment(増額)は正、consume/adjustment(減額)は負
    amount = models.IntegerField()
    reason = models.CharField(max_length=200, blank=True)
    #: 何がきっかけの動きか（"path_reward_milestone" / "ai_usage" など）
    source_type = models.CharField(max_length=40, blank=True)
    #: きっかけとなったレコードのid。二重処理を防ぐ鍵にも使う（下記 ledger.py）
    source_id = models.CharField(max_length=100, blank=True)
    balance_after = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name = "Creditの動き"
        verbose_name_plural = "Creditの動き"
        constraints = [
            # 同じきっかけ（source_type + source_id）からの動きは1回だけ。
            # AI送信の二重実行や、節目特典の連打で二重に付与・消費しない。
            models.UniqueConstraint(
                fields=["user", "source_type", "source_id"],
                condition=models.Q(source_type__gt="", source_id__gt=""),
                name="uniq_credit_source",
            )
        ]

    def __str__(self) -> str:
        return f"{self.user} {self.type} {self.amount}"


class AiTaskPricing(models.Model):
    """AI機能ごとのCredit消費量。コードへ数値を直書きしない。"""

    task_type = models.CharField(max_length=60, unique=True)
    credit_cost = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ("task_type",)
        verbose_name = "AI機能ごとのCredit消費量"
        verbose_name_plural = "AI機能ごとのCredit消費量"

    def __str__(self) -> str:
        return f"{self.task_type}: {self.credit_cost}"


class AiSkill(models.Model):
    """AI技。図鑑に並ぶ1つぶん。

    名前は**一般用語にする**。図鑑で覚えた言葉が、外の記事や他の道具で
    そのまま通じないと、学んだ意味が半分になる。AIPPO だけの造語は作らない。

    枠だけ先に並べない
    ------------------
    「12 / 48」のように集める余地を見せたくなるが、**中身の無い枠**を
    並べると、押しても何も無い項目ができる。ここに入れるのは
    「いまあるレッスンのどれかで実際に習得できるもの」だけにする
    （`lessons` が空の技は図鑑に出さない。下の `obtainable` 参照）。
    """

    slug = models.SlugField(
        max_length=60,
        unique=True,
        help_text="一般用語の英語。図鑑の並びと、獲得記録の照合に使う",
    )
    name = models.CharField(max_length=60, help_text="表示名（日本語）")
    one_line = models.CharField(max_length=80, help_text="一覧に出す1行")
    description = models.TextField(blank=True, help_text="もう少し詳しく")
    example = models.CharField(
        max_length=200, blank=True, help_text="「取引先向けに丁寧にして」のような実例"
    )
    order = models.PositiveIntegerField(default=0)

    lessons = models.ManyToManyField(
        Lesson,
        through="AiSkillLesson",
        related_name="ai_skills",
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("order", "slug")
        verbose_name = "AI技"
        verbose_name_plural = "AI技"

    def __str__(self) -> str:
        return f"{self.name}（{self.slug}）"


class AiSkillLesson(models.Model):
    """この技を、どのレッスンで習得できるか。

    1つの技を複数のレッスンで扱ってよい（最初に終えたところで獲得になる）。
    Lesson 側には何も足さない——教材の行は増やさず、参照だけをここへ持つ。
    """

    skill = models.ForeignKey(
        AiSkill, related_name="lesson_links", on_delete=models.CASCADE
    )
    lesson = models.ForeignKey(
        Lesson, related_name="skill_links", on_delete=models.CASCADE
    )
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("order", "id")
        constraints = [
            models.UniqueConstraint(fields=["skill", "lesson"], name="uniq_skill_lesson")
        ]
        verbose_name = "AI技のレッスン"
        verbose_name_plural = "AI技のレッスン"

    def __str__(self) -> str:
        return f"{self.skill.slug} / {self.lesson.slug}"


class XpKind(models.TextChoices):
    """XPが増えたきっかけ。"""

    LESSON_COMPLETED = "lesson_completed", "レッスン完了"
    AI_SKILL_ACQUIRED = "ai_skill_acquired", "AI技の習得"
    COURSE_CHECKPOINT = "course_checkpoint", "コースの節目"


class XpEvent(models.Model):
    """XPが増えた出来事を、1件ずつ残す。

    Credit とは別物
    ---------------
    ==========  ==========================  ========================
                XP                          Credit
    ==========  ==========================  ========================
    何を表すか  学んだ量                    使える残高
    減るか      **減らない**                使うと減る
    出どころ    学習だけ                    節目の特典
    誰が持つか  ゲストも持つ                account が要る
    ==========  ==========================  ========================

    **XPは絶対に減らさない。** 減る仕組みを入れると「失う恐怖で
    続けさせる」設計になる。順位も他人との比較も出さない方針と揃える。

    合計は SUM で出す。残高のカラムは作らない——2か所に持つと必ずずれる
    （Credit で同じ判断をしている。`CreditWallet` は ledger 経由でしか
    書き換えない、という縛りとセット）。

    ゲストも持つ
    ------------
    置き場所はスタンプと同じ `learner_key`。登録していない人にも
    手応えが要る（登録なしで最後まで進める、という方針と揃える）。
    登録時の引き継ぎは、他の学習記録と同じ経路に載る
    （`apps.accounts.migration`）。
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    learner_key = models.UUIDField(db_index=True)
    kind = models.CharField(max_length=30, choices=XpKind.choices)
    #: 何に対してのXPか。lesson.slug / ai_skill.slug / course.slug
    source_id = models.CharField(max_length=100)
    amount = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            # 同じ出来事では1回だけ。レッスンをやり直しても二重に増えない
            models.UniqueConstraint(
                fields=["learner_key", "kind", "source_id"], name="uniq_xp_source"
            )
        ]
        verbose_name = "XPの増加"
        verbose_name_plural = "XPの増加"

    def __str__(self) -> str:
        return f"{self.kind} {self.source_id} +{self.amount}"
