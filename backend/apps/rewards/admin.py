"""Learning Path / Recipe / Stamp / Credit を、コードを触らずに運用する。

方針は apps/catalog/admin.py と同じ: 一覧で「出ていることと始められること」を
両方見せ、行の親子関係は inline で並び替えられるようにする。
"""

from __future__ import annotations

from django.contrib import admin

from apps.rewards.models import (
    AiSkill,
    AiSkillLesson,
    AiTaskPricing,
    CreditTransaction,
    CreditWallet,
    LearningPath,
    LearningPathLesson,
    PathRewardMilestone,
    Recipe,
    RecipeLearningPath,
    RecipeRequiredLesson,
    StampDefinition,
    UserRewardClaim,
    UserStamp,
    XpEvent,
)


class LearningPathLessonInline(admin.TabularInline):
    model = LearningPathLesson
    extra = 0
    fields = ("lesson", "order", "day_number", "is_required", "stamp_eligible")
    ordering = ("order",)
    autocomplete_fields = ("lesson",)


class StampDefinitionInline(admin.TabularInline):
    model = StampDefinition
    extra = 0
    fields = ("stamp_type", "lesson", "recipe", "title", "order", "active")
    ordering = ("order",)


class PathRewardMilestoneInline(admin.TabularInline):
    model = PathRewardMilestone
    extra = 0
    fields = ("required_stamp_count", "reward_credits", "badge_name", "order", "active")
    ordering = ("required_stamp_count",)


class RecipeLearningPathInline(admin.TabularInline):
    model = RecipeLearningPath
    extra = 0


@admin.register(LearningPath)
class LearningPathAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "slug",
        "category",
        "difficulty",
        "access_type",
        "status",
        "availability_status",
        "lesson_count",
        "sort_order",
    )
    list_filter = ("status", "availability_status", "difficulty", "access_type", "category")
    search_fields = ("title", "slug")
    prepopulated_fields = {"slug": ("title",)}
    inlines = (LearningPathLessonInline, StampDefinitionInline, PathRewardMilestoneInline)

    @admin.display(description="レッスン数")
    def lesson_count(self, obj: LearningPath) -> int:
        return obj.path_lessons.count()


@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "slug",
        "category",
        "access_type",
        "status",
        "availability_status",
        "required_skill_count",
        "sort_order",
    )
    list_filter = ("status", "availability_status", "access_type", "category")
    search_fields = ("title", "slug", "description")
    prepopulated_fields = {"slug": ("title",)}

    class RequiredLessonInline(admin.TabularInline):
        model = RecipeRequiredLesson
        extra = 0
        fields = ("lesson", "order", "required")
        ordering = ("order",)
        autocomplete_fields = ("lesson",)

    inlines = (RequiredLessonInline, RecipeLearningPathInline)

    @admin.display(description="必要スキル数")
    def required_skill_count(self, obj: Recipe) -> int:
        return obj.required_lessons.count()


@admin.register(UserStamp)
class UserStampAdmin(admin.ModelAdmin):
    list_display = ("earned_at", "learner_key", "stamp_definition")
    list_filter = ("stamp_definition__learning_path", "stamp_definition__stamp_type")
    readonly_fields = [f.name for f in UserStamp._meta.fields]
    date_hierarchy = "earned_at"


@admin.register(CreditWallet)
class CreditWalletAdmin(admin.ModelAdmin):
    list_display = ("user", "balance", "lifetime_earned", "lifetime_spent", "updated_at")
    search_fields = ("user__username", "user__email")
    readonly_fields = ("balance", "lifetime_earned", "lifetime_spent", "updated_at")


@admin.register(CreditTransaction)
class CreditTransactionAdmin(admin.ModelAdmin):
    """残高の動きは見るだけ。編集はしない（ledger.py 以外で書き換えない）。"""

    list_display = (
        "created_at",
        "user",
        "type",
        "amount",
        "balance_after",
        "source_type",
        "reason",
    )
    list_filter = ("type", "source_type", "created_at")
    search_fields = ("user__username", "user__email", "reason", "source_id")
    date_hierarchy = "created_at"
    readonly_fields = [f.name for f in CreditTransaction._meta.fields]

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False


@admin.register(UserRewardClaim)
class UserRewardClaimAdmin(admin.ModelAdmin):
    list_display = ("claimed_at", "user", "milestone")
    list_filter = ("milestone__learning_path",)
    readonly_fields = [f.name for f in UserRewardClaim._meta.fields]
    date_hierarchy = "claimed_at"


@admin.register(AiTaskPricing)
class AiTaskPricingAdmin(admin.ModelAdmin):
    list_display = ("task_type", "credit_cost", "active", "note")
    list_editable = ("credit_cost", "active")
    search_fields = ("task_type",)


class AiSkillLessonInline(admin.TabularInline):
    """どのレッスンで習得できるか。**技だけ足して繋ぎ忘れる**のを防ぐ。

    繋がっていない技は図鑑に出さない作りなので、忘れても画面は壊れない。
    壊れないぶん気づけないので、技の編集画面から一緒に触れるようにする。
    """

    model = AiSkillLesson
    extra = 1
    autocomplete_fields = ("lesson",)


@admin.register(AiSkill)
class AiSkillAdmin(admin.ModelAdmin):
    list_display = ("order", "slug", "name", "one_line", "lesson_count")
    list_editable = ("name", "one_line")
    search_fields = ("slug", "name")
    ordering = ("order", "slug")
    inlines = [AiSkillLessonInline]

    @admin.display(description="習得できるレッスン数")
    def lesson_count(self, obj: AiSkill) -> int:
        return obj.lesson_links.count()


@admin.register(XpEvent)
class XpEventAdmin(admin.ModelAdmin):
    """見るだけ。XPは減らさないし、手で足しもしない。

    手で触れるようにすると、「学んだ量」が学習以外の理由で動く。
    数の意味が変わるので、ここは読み取り専用にしておく。
    """

    list_display = ("created_at", "kind", "source_id", "amount")
    list_filter = ("kind",)
    readonly_fields = [f.name for f in XpEvent._meta.fields]
    date_hierarchy = "created_at"

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False
