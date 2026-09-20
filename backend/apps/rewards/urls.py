"""学習パス・スタンプ・Credit のルーティング。"""

from django.urls import path

from apps.rewards.views import (
    ClaimRewardsView,
    CreditView,
    DiagnosisLevelView,
    LearningPathView,
    LevelMapView,
    RankUpChallengeView,
    SkillDexView,
    StampView,
)

urlpatterns = [
    path("paths/", LearningPathView.as_view(), name="rewards-paths"),
    path("stamps/", StampView.as_view(), name="rewards-stamps"),
    path("credits/", CreditView.as_view(), name="rewards-credits"),
    path("claim/", ClaimRewardsView.as_view(), name="rewards-claim"),
    path("skills/", SkillDexView.as_view(), name="rewards-skills"),
    path("map/", LevelMapView.as_view(), name="rewards-map"),
    path("level/", DiagnosisLevelView.as_view(), name="rewards-level"),
    path(
        "challenge/<int:level>/",
        RankUpChallengeView.as_view(),
        name="rewards-challenge",
    ),
]
