"""実証実験で集めたデータを見るための管理画面。

見たいのは「初心者が次に何をすればよいか迷わないか」（憲章 原則 I）。
そのため、1件ずつ眺めるより **集計** を先に出す。

学習者の本文（`Attempt.user_input` / `generated_output`）は読み取り専用にする。
検証に必要なのは傾向であって、個々の文章を編集することではない。
"""

from django.contrib import admin
from django.db.models import Avg, Count, Q, Sum
from django.utils.html import format_html

from apps.lessons.models import (
    AiUsageCounter,
    Attempt,
    LearningEvent,
    LearningSession,
    SavedArtifact,
    SkillProgress,
    Survey,
)
from apps.profiles.models import LearnerProfile


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
        "estimated_cost_usd",
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

        # 概算費用（Phase 10: AI Cost Tracking）。単価を設定していない
        # プロバイダの分は estimated_cost_usd が null なので、SUM は
        # 自然にそれらを飛ばす（0円として合算しない——分からない実行が
        # 混ざっているのに合計だけ出すと、その分過小に見えてしまう）。
        total_cost = attempts.aggregate(total=Sum("estimated_cost_usd"))["total"]
        priced_runs = attempts.filter(estimated_cost_usd__isnull=False).count()
        # 「1アクティブ学習者あたり」の目安（無料ユーザーの原価上限の確認用）。
        # アクティブ = 1回でもAIを実行したことがある学習者。
        active_learners = (
            sessions.filter(attempts__isnull=False).values("learner_key").distinct().count()
        )
        avg_cost_per_active_learner = (
            (total_cost / active_learners) if total_cost and active_learners else None
        )

        # 誰が来て、誰が完走したか。
        # 完了率だけでは、AIを使ったことがない人が離脱しているのか、
        # ふだん使う人が物足りなくて離脱しているのかを区別できない。
        completed_keys = set(
            sessions.filter(completed_at__isnull=False).values_list(
                "learner_key", flat=True
            )
        )
        by_experience: dict[str, dict[str, int]] = {}
        for profile in LearnerProfile.objects.all():
            row = by_experience.setdefault(
                profile.get_ai_experience_display(), {"came": 0, "completed": 0}
            )
            row["came"] += 1
            if profile.learner_key in completed_keys:
                row["completed"] += 1
        for row in by_experience.values():
            row["rate"] = (
                round(row["completed"] / row["came"] * 100, 1) if row["came"] else 0
            )

        pain_points: dict[str, int] = {}
        for pain in LearnerProfile.objects.values_list("pain_point", flat=True):
            pain_points[pain] = pain_points.get(pain, 0) + 1

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
                "total_cost_usd": total_cost,
                "priced_runs": priced_runs,
                "avg_cost_per_active_learner": avg_cost_per_active_learner,
                "survey_count": surveys.count(),
                "survey_tally": survey_tally,
                "by_experience": by_experience,
                "pain_points": sorted(
                    pain_points.items(), key=lambda kv: kv[1], reverse=True
                ),
                "profile_count": LearnerProfile.objects.count(),
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


@admin.register(SavedArtifact)
class SavedArtifactAdmin(admin.ModelAdmin):
    """見るだけ。本人の書いたものを、運営が書き換えない。

    中身は学習者が仕事で使う文章なので、一覧に本文そのものは出さない
    （見えるところを最小にする。開いた記録は操作記録に残る）。
    """

    list_display = ("created_at", "title", "lesson_id")
    list_filter = ("lesson_id",)
    search_fields = ("title", "lesson_id")
    readonly_fields = [f.name for f in SavedArtifact._meta.fields]
    date_hierarchy = "created_at"

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False
