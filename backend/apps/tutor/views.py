"""POST /api/tutor/feedback/

AI障害時も HTTP 200 とフォールバック内容を返す。
エラーをユーザーへ露出しない（AIPPO 開発概要 §17）。

実行回数の上限を超えた場合のみ 429 を返す。上限は課金事故を防ぐためのもの。
"""

from django.conf import settings
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.lessons.models import (
    Attempt,
    AttemptStatus,
    LearningEventType,
    LearningSession,
    TutorOrigin,
)
from apps.tutor.serializers import TutorFeedbackRequestSerializer
from apps.tutor.services.feedback import FeedbackResult, generate_feedback
from apps.tutor.services.provider import get_provider


class TutorFeedbackView(APIView):
    def post(self, request: Request) -> Response:
        serializer = TutorFeedbackRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        session = self._current_session(request, data["lesson_id"])

        if session is not None and self._over_limit(session):
            return Response(
                {
                    "errors": {
                        "detail": [
                            "今回の練習ではこれ以上AIを実行できません。"
                            "少し時間をおいてから、もう一度お試しください。"
                        ]
                    }
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        result = generate_feedback(
            step=data["step"],
            user_input=data["user_input"],
            attempt_count=data["attempt_count"],
            provider=get_provider(),
        )

        if session is not None:
            self._record(session, data, result)

        return Response(result.payload, status=status.HTTP_200_OK)

    def _current_session(self, request: Request, lesson_id: str) -> LearningSession | None:
        learner_key = getattr(request, "learner_key", None)
        if learner_key is None:
            return None
        return (
            LearningSession.objects.filter(
                learner_key=learner_key, lesson_id=lesson_id, completed_at__isnull=True
            )
            .order_by("-updated_at")
            .first()
        )

    def _over_limit(self, session: LearningSession) -> bool:
        """1セッションあたりのAI実行回数の上限（AI利用料の上振れを防ぐ）。"""
        limit = settings.MAX_ATTEMPTS_PER_SESSION
        return session.attempts.count() >= limit

    def _record(self, session: LearningSession, data: dict, result: FeedbackResult) -> None:
        payload = result.payload
        sequence = session.attempts.count() + 1

        Attempt.objects.create(
            session=session,
            sequence=sequence,
            lesson_id=data["lesson_id"],
            step=session.current_step,
            user_input=data["user_input"],
            tutor_message=payload["message"],
            tutor_emotion=payload["emotion"],
            tutor_action=payload["action"],
            tutor_origin=result.origin,
            hint_level=payload["hint_level"],
            completed=payload["completed"],
            status=AttemptStatus.SUCCEEDED,
            model_name=result.model_name,
            token_usage=result.token_usage,
        )

        session.events.create(
            lesson_id=data["lesson_id"],
            step=session.current_step,
            event_type=LearningEventType.HINT_SHOWN,
            # 本文は保存しない。文字数のみ（Q-2）
            input_length=len(data["user_input"]),
            hint_count=payload["hint_level"],
            retry_count=data["attempt_count"] - 1,
        )

        if result.origin == TutorOrigin.FALLBACK:
            session.events.create(
                lesson_id=data["lesson_id"],
                step=session.current_step,
                event_type=LearningEventType.TUTOR_FALLBACK_USED,
            )
