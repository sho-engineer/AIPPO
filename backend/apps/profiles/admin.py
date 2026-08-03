"""AI活用診断の回答を見る。

見たいのは「どんな人が来て、どんな人が完走したか」。
氏名・連絡先は持っていないので、属性の傾向だけが分かる。
"""

from django.contrib import admin

from apps.profiles.models import LearnerProfile, UseCaseRecommendation


@admin.register(LearnerProfile)
class LearnerProfileAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "short_key",
        "ai_experience",
        "job_category",
        "pain_point",
    )
    list_filter = ("ai_experience", "job_category", "pain_point", "created_at")
    date_hierarchy = "created_at"
    readonly_fields = [f.name for f in LearnerProfile._meta.fields]

    @admin.display(description="学習者")
    def short_key(self, obj: LearnerProfile) -> str:
        return str(obj.learner_key)[:8]


@admin.register(UseCaseRecommendation)
class UseCaseRecommendationAdmin(admin.ModelAdmin):
    """診断結果 → おすすめ用途の対応表。

    MVP では画面側に固定で持っているため、ここは空でも動く。
    「後から変えたい」ときの置き場所として先に用意してある。
    """

    list_display = ("priority", "job_category", "pain_point", "lesson_id", "headline")
    list_filter = ("job_category", "pain_point")
