from django.urls import include, path

urlpatterns = [
    path("api/tutor/", include("apps.tutor.urls")),
    path("api/lessons/", include("apps.lessons.urls")),
]
