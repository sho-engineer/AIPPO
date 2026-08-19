"""レッスン実行・セッション再開・アンケートのルーティング。"""

from django.urls import path

from apps.lessons.views import (
    RewriteTextGenerateView,
    SessionStateView,
    SurveyView,
)
from apps.lessons.views_history import HistoryView
from apps.lessons.views_stream import RewriteTextStreamView

urlpatterns = [
    path(
        "rewrite-text/generate/",
        RewriteTextGenerateView.as_view(),
        name="rewrite-text-generate",
    ),
    # 書けたところから流す経路。使えない環境では画面側が /generate/ へ倒す。
    path(
        "rewrite-text/stream/",
        RewriteTextStreamView.as_view(),
        name="rewrite-text-stream",
    ),
    # 学習の記録と、作ったものを見返す。
    # <str:lesson_id> より前に置くこと。後ろだと "history" が
    # 教材のidとして食われる
    path("history/", HistoryView.as_view(), name="lesson-history"),
    path("<str:lesson_id>/session/", SessionStateView.as_view(), name="lesson-session"),
    path("<str:lesson_id>/survey/", SurveyView.as_view(), name="lesson-survey"),
]
