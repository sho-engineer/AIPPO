from django.urls import path

from apps.tutor.views import TutorFeedbackView

urlpatterns = [
    path("feedback/", TutorFeedbackView.as_view(), name="tutor-feedback"),
]
