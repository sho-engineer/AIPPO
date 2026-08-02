"""POST /api/lessons/rewrite-text/stream/

書き上がるのを待たせず、書けたところから流す。
学習者の待ち時間はほぼすべてAIの応答待ちなので、ここが体感を一番左右する。

形式は Server-Sent Events。
- `event: chunk` … 本文の断片
- `event: done`  … 書き終わり（全文を添える）
- `event: error` … 失敗（画面はここで入力を保持したまま再実行させる）

通常の生成エンドポイント（`/generate/`）は残してある。
この経路が使えない環境では、画面側がそちらへ倒す。
"""

import json
import logging

from django.conf import settings
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.lessons.models import (
    Attempt,
    AttemptStatus,
    LearningEventType,
)
from apps.lessons.serializers import RewriteTextRequestSerializer
from apps.lessons.services.generation import (
    AiProviderError,
    AiTimeoutError,
    GenerationResult,
    rewrite_text_stream,
)
from apps.lessons.services.quota import (
    QuotaExceeded,
    consume_ai_run,
    limit_message,
)
from apps.lessons.views import REWRITE_LESSON_ID, _SessionMixin
from apps.tutor.services.provider import get_provider

logger = logging.getLogger(__name__)

GENERIC_ERROR = "うまく届かなかったようです。もう一度おくってみましょう。"


def _event(name: str, payload: dict) -> str:
    """SSE の1件分。改行の扱いを間違えると受け手が読めなくなる。"""
    return f"event: {name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


class EventStreamRenderer(BaseRenderer):
    """`Accept: text/event-stream` を受け付けるためだけの器。

    これが無いと、DRF の内容交渉が「その形式では返せない」と判断して
    406 を返す。ブラウザは SSE を読むときこの Accept を送るので、
    curl（`*/*`）では通るのにブラウザからだけ弾かれる、という形で表に出る。

    実際の本文は StreamingHttpResponse が直接返すため、
    ここの render が使われることはない。
    """

    media_type = "text/event-stream"
    format = "txt"
    charset = "utf-8"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class RewriteTextStreamView(_SessionMixin, APIView):
    renderer_classes = [EventStreamRenderer, JSONRenderer]
    def post(self, request: Request) -> StreamingHttpResponse:
        serializer = RewriteTextRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return self._error_stream(
                {"errors": serializer.errors},
                status.HTTP_400_BAD_REQUEST,
            )

        data = serializer.validated_data
        session = self.get_or_create_session(request, REWRITE_LESSON_ID)

        if session.attempts.count() >= settings.MAX_ATTEMPTS_PER_SESSION:
            return self._error_stream(
                {
                    "errors": {
                        "detail": [
                            "今回の練習ではこれ以上AIを実行できません。"
                            "少し時間をおいてから、もう一度お試しください。"
                        ]
                    }
                },
                status.HTTP_429_TOO_MANY_REQUESTS,
            )

        try:
            consume_ai_run(request)
        except QuotaExceeded as exc:
            return self._error_stream(
                {"errors": {"detail": [limit_message(exc)]}},
                (
                    status.HTTP_503_SERVICE_UNAVAILABLE
                    if exc.is_global
                    else status.HTTP_429_TOO_MANY_REQUESTS
                ),
            )

        response = StreamingHttpResponse(
            self._stream(session, data),
            content_type="text/event-stream",
        )
        # 途中で溜め込まれると、流す意味が無くなる。
        # nginx は既定で溜め込むため、明示的に切ってもらう。
        response["Cache-Control"] = "no-cache, no-transform"
        response["X-Accel-Buffering"] = "no"
        return response

    def _error_stream(self, payload: dict, http_status: int) -> StreamingHttpResponse:
        """開始前に断るときも SSE で返す。

        受け手が本文と例外の2通りを扱わずに済むよう、形式を揃える。
        """
        detail = payload.get("errors", {})
        message = GENERIC_ERROR
        if isinstance(detail, dict):
            found = detail.get("detail")
            if isinstance(found, list) and found:
                message = str(found[0])

        response = StreamingHttpResponse(
            iter([_event("error", {"message": message, "errors": detail})]),
            content_type="text/event-stream",
            status=http_status,
        )
        response["Cache-Control"] = "no-cache, no-transform"
        response["X-Accel-Buffering"] = "no"
        return response

    def _stream(self, session, data: dict):
        sequence = session.attempts.count() + 1
        conditions = {
            "audience": data["audience"],
            "tone": data["tone"],
            "length": data["length"],
            "instruction": data["instruction"],
        }
        result: GenerationResult | None = None

        try:
            for piece in rewrite_text_stream(
                original_text=data["original_text"],
                audience=data["audience"],
                tone=data["tone"],
                length=data["length"],
                instruction=data["instruction"],
                provider=get_provider(),
            ):
                if isinstance(piece, GenerationResult):
                    result = piece
                else:
                    yield _event("chunk", {"text": piece})
        except (AiProviderError, AiTimeoutError, NotImplementedError) as exc:
            self._record_failure(session, sequence, data, conditions, exc)
            yield _event("error", {"message": GENERIC_ERROR})
            return

        if result is None:  # 念のため。通常は起こらない
            self._record_failure(session, sequence, data, conditions, None)
            yield _event("error", {"message": GENERIC_ERROR})
            return

        self._record_success(session, sequence, data, conditions, result)
        yield _event("done", {"text": result.text})

    def _record_failure(self, session, sequence, data, conditions, exc) -> None:
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

    def _record_success(self, session, sequence, data, conditions, result) -> None:
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
        session.updated_at = timezone.now()
        session.save(update_fields=["attempt_count", "current_step", "updated_at"])

        session.events.create(
            lesson_id=REWRITE_LESSON_ID,
            step=data["step"],
            event_type=LearningEventType.AI_RUN_SUCCEEDED,
            input_length=len(data["original_text"]),
        )
