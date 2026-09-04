"""AI活用診断の回答の受け口。"""

from rest_framework import serializers

from apps.profiles.models import AiExperience, LearnerProfile


class LearnerProfileSerializer(serializers.ModelSerializer):
    """AI活用診断の回答。

    診断が3問から5問へ変わり、**職種はもう聞いていない**
    （初回で聞いても、答えたことで次の一歩が変わらないため）。
    受け取る形はそのままにして、空を許すだけにしてある——
    5問に合う形（4軸・現在地・履歴）へ作り替えるのは別の段取りで、
    そのときにこの入れ物ごと置き換える。

    空を弾かないのが肝心。弾くと、聞くのをやめた項目のせいで
    診断の保存が 400 になる（画面には出ないので気づけない）。
    """

    ai_experience = serializers.ChoiceField(choices=AiExperience.choices)
    job_category = serializers.CharField(max_length=100, allow_blank=True)
    pain_point = serializers.CharField(max_length=200, allow_blank=True)

    class Meta:
        model = LearnerProfile
        fields = ["ai_experience", "job_category", "pain_point"]
