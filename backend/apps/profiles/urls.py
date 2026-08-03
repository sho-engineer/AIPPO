"""AI活用診断のルーティング。"""

from django.urls import path

from apps.profiles.views import LearnerProfileView

urlpatterns = [
    path("", LearnerProfileView.as_view(), name="learner-profile"),
]
