"""学習パス・スタンプ・Credit のルーティング。"""

from django.urls import path

from apps.rewards.views import (
    ClaimRewardsView,
    CreditView,
    LearningPathView,
    StampView,
)

urlpatterns = [
    path("paths/", LearningPathView.as_view(), name="rewards-paths"),
    path("stamps/", StampView.as_view(), name="rewards-stamps"),
    path("credits/", CreditView.as_view(), name="rewards-credits"),
    path("claim/", ClaimRewardsView.as_view(), name="rewards-claim"),
]
