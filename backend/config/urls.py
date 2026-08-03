from django.contrib import admin
from django.urls import include, path

from apps.health.views import healthz, readyz
from apps.lessons.views import LearningEventView

urlpatterns = [
    path("api/tutor/", include("apps.tutor.urls")),
    path("api/lessons/", include("apps.lessons.urls")),
    # AI活用診断の回答。誰が来たかを実証実験で見るために要る
    path("api/profile/", include("apps.profiles.urls")),
    # AIPPO 開発概要 §13 の指定どおり、操作ログはトップレベルに置く
    path("api/learning-events/", LearningEventView.as_view(), name="learning-events"),
    # 死活監視。DBを見る／見ないで分けてある（apps/health/views.py 参照）
    path("healthz", healthz, name="healthz"),
    path("readyz", readyz, name="readyz"),
    # 実証実験で集めたデータを見るための管理画面
    path("admin/", admin.site.urls),
]
