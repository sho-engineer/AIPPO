from django.urls import include, path

from apps.lessons.views import LearningEventView

urlpatterns = [
    path("api/tutor/", include("apps.tutor.urls")),
    path("api/lessons/", include("apps.lessons.urls")),
    # AIPPO 開発概要 §13 の指定どおり、操作ログはトップレベルに置く
    path("api/learning-events/", LearningEventView.as_view(), name="learning-events"),
]
