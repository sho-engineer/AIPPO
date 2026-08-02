"""実証実験で集めたデータを見るための管理画面。

見たいのは「初心者が次に何をすればよいか迷わないか」（憲章 原則 I）。
そのため、1件ずつ眺めるより **集計** を先に出す。

学習者の本文（`Attempt.user_input` / `generated_output`）は読み取り専用にする。
検証に必要なのは傾向であって、個々の文章を編集することではない。
"""

from django.contrib import admin
from django.db.models import Avg, Count, Q
from django.utils.html import format_html

from apps.lessons.models import (
    AiUsageCounter,
    Attempt,
    LearningEvent,
    LearningSession,
    SkillProgress,
    Survey,
)


class SurveyInline(admin.TabularInline):
    model = Survey
    extra = 0
    readonly_fields = ("answers", "created_at")
    can_delete = False


class AttemptInline(admin.TabularInline):
    model = Attempt
    extra = 0
    can_delete = False
    fields = ("sequence", "step", "status", "hint_level", "tutor_origin", "created_at")
    readonly_fields = fields
    show_change_link = True


@admin.register(LearningSession)
class LearningSessionAdmin(admin.ModelAdmin):
    list_display = (
        "short_key",
        "lesson_id",
        "current_step",
        "attempt_count",
        "is_completed",
        "started_at",
    )
    list_filter = ("lesson_id", "current_step", "started_at")
    search_fields = ("learner_key",)
    date_hierarchy = "started_at"
    readonly_fields = [f.name for f in LearningSession._meta.fields]
    inlines = [AttemptInline, SurveyInline]

    @admin.display(description="学習者")
    def short_key(self, obj: LearningSession) -> str:
        return str(obj.learner_key)[:8]

    @admin.display(description="完了", boolean=True)
    def is_completed(self, obj: LearningSession) -> bool:
        return obj.completed_at is not None


@admin.register(Attempt)
class AttemptAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "lesson_id",
        "step",
        "sequence",
        "status",
        "hint_level",
        "tutor_origin",
        "model_name",
        "total_tokens",
        "latency_ms",
    )
    list_filter = ("status", "step", "tutor_origin", "model_name", "created_at")
    date_hierarchy = "created_at"
    # 本文は見るだけ。検証に必要なのは傾向であって編集ではない。
    readonly_fields = [f.name for f in Attempt._meta.fields]

    @admin.display(description="トークン")
    def total_tokens(self, obj: Attempt) -> int:
        usage = obj.token_usage or {}
        return sum(v for v in usage.values() if isinstance(v, int))


@admin.register(LearningEvent)
class LearningEventAdmin(admin.ModelAdmin):
    list_display = (
        "occurred_at",
        "event_type",
        "step",
        "input_length",
        "hint_count",
        "retry_count",
    )
    list_filter = ("event_type", "step", "occurred_at")
    date_hierarchy = "occurred_at"
    readonly_fields = [f.name for f in LearningEvent._meta.fields]


@admin.register(Survey)
class SurveyAdmin(admin.ModelAdmin):
    list_display = ("created_at", "answer_summary")
    date_hierarchy = "created_at"
    readonly_fields = ("session", "answers", "created_at")

    @admin.display(description="回答")
    def answer_summary(self, obj: Survey) -> str:
        return "、".join(f"{k}={v}" for k, v in (obj.answers or {}).items())


@admin.register(SkillProgress)
class SkillProgressAdmin(admin.ModelAdmin):
    list_display = ("acquired_at", "skill_key", "lesson_id")
    list_filter = ("skill_key", "lesson_id")
    readonly_fields = [f.name for f in SkillProgress._meta.fields]


@admin.register(AiUsageCounter)
class AiUsageCounterAdmin(admin.ModelAdmin):
    """AI実行回数の日次カウンタ。

    `scope` は IP の HMAC なので、元のIPは復元できない（憲章 原則 VI）。
    """

    list_display = ("date", "kind", "count")
    list_filter = ("date",)
    readonly_fields = ("scope", "date", "count")

    @admin.display(description="対象")
    def kind(self, obj: AiUsageCounter) -> str:
        if obj.scope == AiUsageCounter.GLOBAL_SCOPE:
            return "全体"
        return format_html("接続元 <code>{}…</code>", obj.scope[:8])


class VerificationSummary(LearningSession):
    """検証したい6項目を1画面で見るための、集計専用の見た目。

    実体は LearningSession。テーブルは増やさない。
    """

    class Meta:
        proxy = True
        verbose_name = "検証サマリー"
        verbose_name_plural = "検証サマリー"


@admin.register(VerificationSummary)
class VerificationSummaryAdmin(admin.ModelAdmin):
    """一覧ではなく、集計だけを見せる。"""

    change_list_template = "admin/verification_summary.html"

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False

    def changelist_view(self, request, extra_context=None):
        sessions = LearningSession.objects.all()
        total = sessions.count()
        completed = sessions.filter(completed_at__isnull=False).count()

        attempts = Attempt.objects.all()
        tokens = attempts.aggregate(
            runs=Count("id"),
            fallbacks=Count("id", filter=Q(tutor_origin="fallback")),
            failures=Count("id", filter=~Q(status="succeeded")),
            avg_latency=Avg("latency_ms"),
        )

        # トークン数は JSON の中なので、Python 側で足す。
        # 実証実験の規模（数百件）ではこれで十分速い。
        input_tokens = 0
        output_tokens = 0
        for usage in attempts.values_list("token_usage", flat=True):
            if isinstance(usage, dict):
                input_tokens += usage.get("input", 0) or 0
                output_tokens += usage.get("output", 0) or 0

        surveys = Survey.objects.all()
        survey_tally: dict[str, dict[str, int]] = {}
        for answers in surveys.values_list("answers", flat=True):
            for question, answer in (answers or {}).items():
                survey_tally.setdefault(question, {})
                survey_tally[question][answer] = (
                    survey_tally[question].get(answer, 0) + 1
                )

        extra_context = extra_context or {}
        extra_context.update(
            {
                "total_sessions": total,
                "completed_sessions": completed,
                "completion_rate": round(completed / total * 100, 1) if total else 0,
                "ai_runs": tokens["runs"],
                "ai_failures": tokens["failures"],
                "poe_fallbacks": tokens["fallbacks"],
                "avg_latency_ms": round(tokens["avg_latency"] or 0),
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "survey_count": surveys.count(),
                "survey_tally": survey_tally,
                "skills_acquired": SkillProgress.objects.aggregate(n=Count("id"))["n"],
                "usage_today": AiUsageCounter.objects.filter(
                    scope=AiUsageCounter.GLOBAL_SCOPE
                )
                .order_by("-date")
                .values_list("count", flat=True)
                .first()
                or 0,
                "abandoned_steps": list(
                    sessions.filter(completed_at__isnull=True)
                    .values("current_step")
                    .annotate(n=Count("id"))
                    .order_by("-n")
                ),
                "title": "検証サマリー",
            }
        )
        return super().changelist_view(request, extra_context=extra_context)


admin.site.site_header = "AIPPO 管理"
admin.site.site_title = "AIPPO"
admin.site.index_title = "実証実験のデータ"
