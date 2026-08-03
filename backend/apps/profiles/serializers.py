"""AI活用診断の回答の受け口。"""

from rest_framework import serializers

from apps.profiles.models import AiExperience, LearnerProfile


class LearnerProfileSerializer(serializers.ModelSerializer):
    """診断3問の回答。

    MVP で埋めるのは3項目だけ（Q-1）。
    残りのフィールドはフェーズ3で使い始めるので、ここでは受け取らない。
    """

    ai_experience = serializers.ChoiceField(choices=AiExperience.choices)
    job_category = serializers.CharField(max_length=100)
    pain_point = serializers.CharField(max_length=200)

    class Meta:
        model = LearnerProfile
        fields = ["ai_experience", "job_category", "pain_point"]
