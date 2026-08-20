"""操作記録の見え方。

**読むだけにする。** 触った記録を触った人が消せるなら、
記録が無いのと変わらない。追加・変更・削除の口を全部塞ぐ。

`has_delete_permission` を False にしても、保存期間の削除
（`prune_data`）は動く。あれは管理画面を通らないため。
"""

from __future__ import annotations

from django.contrib import admin

from apps.ops.models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("at", "actor", "action", "target_model", "target_id", "ip")
    list_filter = ("action", "target_model")
    search_fields = ("actor", "target_id")
    date_hierarchy = "at"

    # 並べ替え以外に触らせない
    readonly_fields = ("id", "at", "action", "actor", "target_model", "target_id", "ip", "detail")

    def has_add_permission(self, request, obj=None) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False
