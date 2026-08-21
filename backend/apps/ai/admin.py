"""AI利用ログを見るための管理画面。編集はしない（記録は書き換えない）。"""

from __future__ import annotations

from django.contrib import admin

from apps.ai.models import AiUsageLog


@admin.register(AiUsageLog)
class AiUsageLogAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "task_type",
        "provider",
        "model",
        "success",
        "credit_consumed",
        "estimated_cost_usd",
    )
    list_filter = ("task_type", "provider", "success", "created_at")
    search_fields = ("lesson_id", "recipe_id", "error_type")
    date_hierarchy = "created_at"
    readonly_fields = [f.name for f in AiUsageLog._meta.fields]

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False
