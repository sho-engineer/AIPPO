"""レッスン実行・セッション再開・アンケートのルーティング。"""

from django.urls import path

from apps.lessons.views import (
    RewriteTextGenerateView,
    SessionStateView,
    SurveyView,
)

urlpatterns = [
    path(
        "rewrite-text/generate/",
        RewriteTextGenerateView.as_view(),
        name="rewrite-text-generate",
    ),
    path("<str:lesson_id>/session/", SessionStateView.as_view(), name="lesson-session"),
    path("<str:lesson_id>/survey/", SurveyView.as_view(), name="lesson-survey"),
]
