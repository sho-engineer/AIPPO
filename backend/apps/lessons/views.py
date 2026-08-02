"""レッスン実行・学習イベント・セッション再開・アンケート。

AIPPO 開発概要 §13 のエンドポイント設計に従う。
"""

import logging

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.lessons.models import (
    Attempt,
    AttemptStatus,
    LearningEvent,
    LearningEventType,
    LearningSession,
    SkillProgress,
    Survey,
)
from apps.lessons.serializers import (
    LearningEventSerializer,
    RewriteTextRequestSerializer,
    SessionStateSerializer,
    SurveySerializer,
)
from apps.lessons.services.generation import (
    AiProviderError,
    AiTimeoutError,
    rewrite_text,
)
from apps.lessons.services.quota import (
    QuotaExceeded,
    consume_ai_run,
    limit_message,
)
from apps.tutor.services.provider import get_provider

logger = logging.getLogger(__name__)

REWRITE_LESSON_ID = "rewrite_text_001"

#: レッスン完了時に記録する習得スキル（§3 step 8）。
REWRITE_SKILLS = ("state_audience", "state_tone", "state_length", "review_output")


class _SessionMixin:
    """匿名 learner_key から進行中セッションを解決する。"""

    def get_or_create_session(self, request: Request, lesson_id: str) -> LearningSession:
        learner_key = request.learner_key
        session = (
            LearningSession.objects.filter(
                learner_key=learner_key, lesson_id=lesson_id, completed_at__isnull=True
            )
            .order_by("-updated_at")
            .first()
        )
        if session is None:
            session = LearningSession.objects.create(
                learner_key=learner_key, lesson_id=lesson_id
            )
        return session


class RewriteTextGenerateView(_SessionMixin, APIView):
    """POST /api/lessons/rewrite-text/generate/"""

    def post(self, request: Request) -> Response:
        serializer = RewriteTextRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        session = self.get_or_create_session(request, REWRITE_LESSON_ID)

        if session.attempts.count() >= settings.MAX_ATTEMPTS_PER_SESSION:
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

        # Cookie を消せばセッション上限は回避できてしまう。
        # 接続元と全体の1日あたり上限で、AI利用料の暴走を止める。
        try:
            consume_ai_run(request)
        except QuotaExceeded as exc:
            return Response(
                {"errors": {"detail": [limit_message(exc)]}},
                status=(
                    status.HTTP_503_SERVICE_UNAVAILABLE
                    if exc.is_global
                    else status.HTTP_429_TOO_MANY_REQUESTS
                ),
            )

        sequence = session.attempts.count() + 1
        conditions = {
            "audience": data["audience"],
            "tone": data["tone"],
            "length": data["length"],
            "instruction": data["instruction"],
        }

        try:
            result = rewrite_text(
                original_text=data["original_text"],
                audience=data["audience"],
                tone=data["tone"],
                length=data["length"],
                instruction=data["instruction"],
                provider=get_provider(),
            )
        except (AiProviderError, AiTimeoutError) as exc:
            Attempt.objects.create(
                session=session,
                sequence=sequence,
                lesson_id=REWRITE_LESSON_ID,
                step=data["step"],
                user_input=data["original_text"],
                conditions=conditions,
                status=(
                    AttemptStatus.TIMEOUT
                    if isinstance(exc, AiTimeoutError)
                    else AttemptStatus.FAILED
                ),
            )
            session.events.create(
                lesson_id=REWRITE_LESSON_ID,
                step=data["step"],
                event_type=LearningEventType.AI_RUN_FAILED,
                input_length=len(data["original_text"]),
            )
            # ここは AI の出力そのものが目的なので固定文で代替できない。
            # フロントエンドは入力を保持したまま再実行させる。
            return Response(
                {
                    "errors": {
                        "detail": ["うまく届かなかったようです。もう一度おくってみましょう。"]
                    }
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        Attempt.objects.create(
            session=session,
            sequence=sequence,
            lesson_id=REWRITE_LESSON_ID,
            step=data["step"],
            user_input=data["original_text"],
            conditions=conditions,
            generated_output=result.text,
            status=AttemptStatus.SUCCEEDED,
            model_name=result.model_name,
            token_usage=result.token_usage,
            latency_ms=result.latency_ms,
        )
        session.attempt_count = sequence
        session.current_step = data["step"]
        session.save(update_fields=["attempt_count", "current_step", "updated_at"])

        session.events.create(
            lesson_id=REWRITE_LESSON_ID,
            step=data["step"],
            event_type=LearningEventType.AI_RUN_SUCCEEDED,
            input_length=len(data["original_text"]),
        )

        return Response({"rewritten_text": result.text}, status=status.HTTP_200_OK)


class LearningEventView(_SessionMixin, APIView):
    """POST /api/learning-events/

    送信に失敗してもレッスンを止めないため、記録は best-effort。
    """

    def post(self, request: Request) -> Response:
        serializer = LearningEventSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        session = self.get_or_create_session(request, data["lesson_id"])

        if data["step"]:
            session.current_step = data["step"]
            session.save(update_fields=["current_step", "updated_at"])

        LearningEvent.objects.create(
            session=session,
            lesson_id=data["lesson_id"],
            step=data["step"],
            event_type=data["event_type"],
            input_length=data["input_length"],
            hint_count=data["hint_count"],
            retry_count=data["retry_count"],
            completed=data["completed"],
            duration_ms=data.get("duration_ms"),
        )

        if data["event_type"] == LearningEventType.LESSON_COMPLETED:
            self._complete(session)

        return Response(status=status.HTTP_204_NO_CONTENT)

    def _complete(self, session: LearningSession) -> None:
        session.completed_at = timezone.now()
        session.current_step = "COMPLETE"
        session.save(update_fields=["completed_at", "current_step", "updated_at"])

        for skill_key in REWRITE_SKILLS:
            SkillProgress.objects.get_or_create(
                learner_key=session.learner_key,
                skill_key=skill_key,
                defaults={"lesson_id": session.lesson_id},
            )


class SessionStateView(APIView):
    """GET /api/lessons/{lesson_id}/session/

    再訪時に前回の到達ステップから再開させる。
    """

    def get(self, request: Request, lesson_id: str) -> Response:
        session = (
            LearningSession.objects.filter(
                learner_key=request.learner_key, lesson_id=lesson_id
            )
            .order_by("-updated_at")
            .first()
        )
        if session is None:
            return Response({"session": None}, status=status.HTTP_200_OK)

        payload = SessionStateSerializer(
            {
                "session_id": session.id,
                "lesson_id": session.lesson_id,
                "current_step": session.current_step,
                "use_case_id": session.use_case_id,
                "fill_in_values": session.fill_in_values,
                "attempt_count": session.attempt_count,
                "completed": session.completed_at is not None,
            }
        ).data
        return Response({"session": payload}, status=status.HTTP_200_OK)


class SurveyView(_SessionMixin, APIView):
    """POST /api/lessons/{lesson_id}/survey/"""

    def post(self, request: Request, lesson_id: str) -> Response:
        serializer = SurveySerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        session = (
            LearningSession.objects.filter(
                learner_key=request.learner_key, lesson_id=lesson_id
            )
            .order_by("-updated_at")
            .first()
        )
        if session is None:
            return Response(
                {"errors": {"detail": ["学習セッションが見つかりません。"]}},
                status=status.HTTP_404_NOT_FOUND,
            )

        Survey.objects.update_or_create(
            session=session, defaults={"answers": serializer.validated_data["answers"]}
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
