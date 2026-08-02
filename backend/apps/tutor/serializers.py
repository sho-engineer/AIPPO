"""ポーのフィードバックAPIの入出力検証。

contracts/tutor-feedback.md の制約と一致させる。
構造化出力を使う場合でも、この検証は省略しない。
"""

from rest_framework import serializers

from apps.tutor.prompts import MESSAGE_MAX_LENGTH_WITH_EXAMPLE, message_max_length

EMOTIONS = ["neutral", "question", "thinking", "hint", "warning", "celebrate"]
ACTIONS = ["wait", "retry", "next", "show_hint", "complete"]
STEPS = [
    "intro",
    "select_use_case",
    "first_input",
    "review_input",
    "review_result",
    "improve_input",
    "real_task",
    "reflection",
    "complete",
]

MAX_USER_INPUT_LENGTH = 5000


class TutorFeedbackRequestSerializer(serializers.Serializer):
    lesson_id = serializers.CharField(max_length=100)
    step = serializers.ChoiceField(choices=STEPS)
    user_input = serializers.CharField(
        max_length=MAX_USER_INPUT_LENGTH,
        allow_blank=False,
        trim_whitespace=True,
    )
    attempt_count = serializers.IntegerField(min_value=1)


class TutorFeedbackResponseSerializer(serializers.Serializer):
    """ポーの応答を検証する。

    message の上限はヒントの段階で変わる（Q-4）。
    段階3は具体例を含むため 150 文字まで許容する。
    上限は context["hint_level"] から決める。
    """

    message = serializers.CharField(
        max_length=MESSAGE_MAX_LENGTH_WITH_EXAMPLE, allow_blank=False
    )
    emotion = serializers.ChoiceField(choices=EMOTIONS)
    action = serializers.ChoiceField(choices=ACTIONS)
    hint_level = serializers.IntegerField(min_value=0, max_value=3)
    completed = serializers.BooleanField()

    def validate_message(self, value: str) -> str:
        limit = message_max_length(self.context.get("hint_level", 0))
        if len(value) > limit:
            raise serializers.ValidationError(
                f"この段階のメッセージは{limit}文字以内にしてください。"
            )
        return value


#: AIプロバイダの構造化出力へ渡す JSON Schema。
#: TutorFeedbackResponseSerializer と同じ制約を表す。
TUTOR_RESPONSE_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "message": {"type": "string"},
        "emotion": {"type": "string", "enum": EMOTIONS},
        "action": {"type": "string", "enum": ACTIONS},
        "hint_level": {"type": "integer"},
        "completed": {"type": "boolean"},
    },
    "required": ["message", "emotion", "action", "hint_level", "completed"],
    "additionalProperties": False,
}
