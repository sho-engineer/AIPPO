"""レッスン実行・学習イベント・アンケートの入出力検証。"""

from rest_framework import serializers

from apps.lessons.models import LearningEventType, LessonStep

MAX_TEXT_LENGTH = 5000


class RewriteTextRequestSerializer(serializers.Serializer):
    """POST /api/lessons/rewrite-text/generate/ の入力（AIPPO 開発概要 §13）。"""

    original_text = serializers.CharField(max_length=MAX_TEXT_LENGTH, allow_blank=False)
    audience = serializers.CharField(max_length=100, allow_blank=False)
    tone = serializers.CharField(max_length=100, allow_blank=False)
    length = serializers.CharField(max_length=100, allow_blank=False)
    # 改善方向（2回目以降）。1回目は空でよい。
    instruction = serializers.CharField(
        max_length=200, required=False, allow_blank=True, default=""
    )
    step = serializers.ChoiceField(
        choices=LessonStep.choices, required=False, default=LessonStep.FIRST_INPUT
    )


class RewriteTextResponseSerializer(serializers.Serializer):
    rewritten_text = serializers.CharField(allow_blank=False)


class LearningEventSerializer(serializers.Serializer):
    """POST /api/learning-events/ の入力（AIPPO 開発概要 §13）。

    Q-2 の判断により、ユーザー入力の本文は受け取らない。
    受け取るのは文字数のみ。
    """

    lesson_id = serializers.CharField(max_length=100)
    # ステップの id は教材データが決める。選択肢で縛ると、
    # レッスンを1本足すたびに操作ログが 400 で落ちる（実際に落ちた）。
    step = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    event_type = serializers.ChoiceField(choices=LearningEventType.choices)
    input_length = serializers.IntegerField(min_value=0, required=False, default=0)
    hint_count = serializers.IntegerField(min_value=0, required=False, default=0)
    retry_count = serializers.IntegerField(min_value=0, required=False, default=0)
    completed = serializers.BooleanField(required=False, default=False)
    duration_ms = serializers.IntegerField(min_value=0, required=False, allow_null=True)

    def validate(self, attrs: dict) -> dict:
        """本文が紛れ込んでいないことを明示的に拒否する。"""
        forbidden = {"user_input", "text", "content", "original_text"}
        present = forbidden & set(self.initial_data)
        if present:
            raise serializers.ValidationError(
                {
                    field: ["操作ログに本文は保存しません。文字数のみ送ってください。"]
                    for field in sorted(present)
                }
            )
        return attrs


class SessionStateSerializer(serializers.Serializer):
    """GET /api/lessons/{lesson_id}/session/ の出力。再開に使う。"""

    session_id = serializers.UUIDField()
    lesson_id = serializers.CharField()
    current_step = serializers.CharField()
    use_case_id = serializers.CharField(allow_blank=True)
    fill_in_values = serializers.JSONField()
    attempt_count = serializers.IntegerField()
    completed = serializers.BooleanField()


class SurveySerializer(serializers.Serializer):
    """POST /api/lessons/{lesson_id}/survey/ の入力。"""

    answers = serializers.DictField(
        child=serializers.CharField(max_length=100), allow_empty=False
    )
