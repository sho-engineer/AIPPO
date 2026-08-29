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

from apps.accounts.scope import device_key, readable_keys
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


class _SessionMixin:
    """いまの人の、進行中セッションを解決する。

    探すのは「その人が読んでよい鍵ぜんぶ」から。別端末で途中まで
    進めていたなら、その続きが出る。作るときはいまの端末の鍵で作る。
    """

    def get_or_create_session(self, request: Request, lesson_id: str) -> LearningSession:
        session = (
            LearningSession.objects.filter(
                learner_key__in=readable_keys(request),
                lesson_id=lesson_id,
                completed_at__isnull=True,
            )
            .order_by("-updated_at")
            .first()
        )
        if session is None:
            session = LearningSession.objects.create(
                learner_key=device_key(request), lesson_id=lesson_id
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

        """
        レッスンの外で起きたことは、セッションを作らずに残す。

        登録・パスワード再設定・図鑑を開いた——どれもレッスンの中の
        出来事ではない。架空のセッションを作ると、学習の数え上げ
        （何本進めたか）に中身の無い1本が混ざる。
        """
        session = (
            self.get_or_create_session(request, data["lesson_id"])
            if data["lesson_id"]
            else None
        )

        if session is not None and data["step"]:
            session.current_step = data["step"]
            session.save(update_fields=["current_step", "updated_at"])

        LearningEvent.objects.create(
            session=session,
            learner_key=device_key(request),
            lesson_id=data["lesson_id"],
            step=data["step"],
            event_type=data["event_type"],
            input_length=data["input_length"],
            hint_count=data["hint_count"],
            retry_count=data["retry_count"],
            completed=data["completed"],
            duration_ms=data.get("duration_ms"),
        )

        if session is not None and data["event_type"] == LearningEventType.LESSON_COMPLETED:
            """
            終えた回だけ、**何が増えたか**を返す。

            画面はこれで「新しく覚えた技」と「増えたXP」を出す。
            画面側で数えさせない——技もXPも節目も判定はサーバーがしていて
            （設計方針 §36）、画面が別に数えると必ず食い違う。

            やり直しでは中身が空になる。祝う材料が無い回に演出を出さない
            ためで、「増えなかった」を画面が言い分けられる。
            """
            return Response({"awarded": self._complete(request, session)})

        return Response(status=status.HTTP_204_NO_CONTENT)

    def _complete(self, request: Request, session: LearningSession) -> dict[str, object]:
        session.completed_at = timezone.now()
        session.current_step = "COMPLETE"
        session.save(update_fields=["completed_at", "current_step", "updated_at"])

        awarded = self._award_skills_and_xp(request, session)
        self._award_stamps_and_rewards(request, session)
        return awarded

    def _award_skills_and_xp(
        self, request: Request, session: LearningSession
    ) -> dict[str, object]:
        """このレッスンで習得できるAI技を付け、XPを足す。

        前はレッスンに関係なく固定の4つを付けていた。どのレッスンを
        終えても同じ4つが付くので、図鑑は最初の1本で埋まり、そのあとは
        何本やっても増えない——**していないことを習得したことにしていた**。
        いまは `AiSkillLesson`（教材ごとの対応）から引く。

        XPは、レッスン1本と、そこで新しく付いた技のぶん。
        やり直しても二重には増えない（XpEvent の unique constraint）。
        """
        from apps.rewards import xp
        from apps.rewards.models import XpKind
        from apps.rewards.skills import award_lesson_skills

        acquired = award_lesson_skills(session.learner_key, session.lesson_id)

        gained = 0
        event = xp.award(session.learner_key, XpKind.LESSON_COMPLETED, session.lesson_id)
        if event is not None:
            gained += event.amount

        for slug in acquired:
            event = xp.award(session.learner_key, XpKind.AI_SKILL_ACQUIRED, slug)
            if event is not None:
                gained += event.amount
            self._log(session, LearningEventType.AI_SKILL_ACQUIRED)

        """
        コースの節目。

        数えるのは読める鍵ぜんぶから——いまの端末だけで数えると、
        別の端末で進めた分が抜けて、節目がいつまでも来ない。
        """
        reached = xp.award_course_checkpoint(
            session.learner_key, readable_keys(request), session.lesson_id
        )
        if reached is not None:
            gained += xp.XP_AMOUNTS[XpKind.COURSE_CHECKPOINT]
            self._log(session, LearningEventType.COURSE_CHECKPOINT_COMPLETED, reached)

        """
        増えたぶんだけ記録する。

        やり直しでは 0 になるので、そのときは残さない——0 の行が並ぶと、
        「XPが増えた回数」を数えたときに実際より多く出る。
        """
        if gained > 0:
            self._log(session, LearningEventType.XP_EARNED, gained)

        return {
            # 名前ではなく slug を返す。表示名は図鑑が持っている
            "skills": acquired,
            "xp": gained,
            #: 節目に届いたなら、その本数。届いていなければ None
            "checkpoint": reached,
        }

    @staticmethod
    def _log(session: LearningSession, event_type: str, amount: int = 0) -> None:
        """サーバー側で決めたことを、操作ログにも残す。

        画面から送らせない。技もXPも節目も、判定はサーバーがしている
        （設計方針 §36）。画面から送らせると、送られてこなかった回と
        起きなかった回の区別が付かなくなる。

        本文は入れない。数だけ（`input_length` を数の置き場に使う）。
        """
        LearningEvent.objects.create(
            session=session,
            learner_key=session.learner_key,
            lesson_id=session.lesson_id,
            step="COMPLETE",
            event_type=event_type,
            input_length=amount,
        )

    @staticmethod
    def _award_stamps_and_rewards(request: Request, session: LearningSession) -> None:
        """このレッスンが属する Learning Path ぶんのスタンプを埋め、届いた節目があれば渡す。

        Credit の受け取りは account が要る（apps/rewards/models.py 参照）。
        ゲストのままでもスタンプは埋まるが、節目のCreditはここでは渡さない
        （サーバー側で判定し、client からの指定は一切受け付けない——設計方針 §36）。
        """
        from apps.rewards.models import LearningPath
        from apps.rewards.stamps import award_lesson_stamp, claim_due_milestones

        award_lesson_stamp(session.learner_key, session.lesson_id)

        user = getattr(request, "user", None)
        if not (user and user.is_authenticated):
            return

        keys = readable_keys(request)
        paths = LearningPath.objects.filter(
            path_lessons__lesson__slug=session.lesson_id
        ).distinct()
        for path in paths:
            claim_due_milestones(user, keys, path)


class SessionStateView(APIView):
    """GET /api/lessons/{lesson_id}/session/

    再訪時に前回の到達ステップから再開させる。
    """

    def get(self, request: Request, lesson_id: str) -> Response:
        session = (
            LearningSession.objects.filter(
                learner_key__in=readable_keys(request), lesson_id=lesson_id
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


class ProgressView(APIView):
    """GET /api/v1/progress/

    ホーム画面が「どこまで来たか」を出すための1回。

    端末に貯めた記録（`frontend/src/lib/draft.ts`）だけを見ていると、
    別の端末では 0件から始まったように見える。登録した人には
    サーバーの数を優先させる。

    出すのは自分のことだけ。順位も他人との比較も出さない。
    """

    def get(self, request: Request) -> Response:
        keys = readable_keys(request)
        sessions = LearningSession.objects.filter(learner_key__in=keys)

        by_lesson: dict[str, dict[str, object]] = {}
        # 古い順に見て、あとから来たもので上書きする。
        # 同じ教材を別端末で進めていたら、新しいほうが残る
        for session in sessions.order_by("updated_at"):
            done = session.completed_at is not None
            current = by_lesson.get(session.lesson_id)

            # 一度でも終えたなら「終わった」を保つ。
            # あとから同じ教材をやり直しても、実績は消さない
            by_lesson[session.lesson_id] = {
                "lesson_id": session.lesson_id,
                "completed": done or bool(current and current["completed"]),
                "current_step": session.current_step,
                "attempt_count": session.attempt_count,
                "updated_at": session.updated_at.isoformat(),
            }

        lessons = sorted(by_lesson.values(), key=lambda row: row["updated_at"], reverse=True)
        completed = [row for row in lessons if row["completed"]]

        return Response(
            {
                "lessons": lessons,
                "completed_count": len(completed),
                "in_progress_count": len(lessons) - len(completed),
                "skills": sorted(
                    SkillProgress.objects.filter(learner_key__in=keys)
                    .values_list("skill_key", flat=True)
                    .distinct()
                ),
                # 学んだ量。ここに載せておくと、ホームが1回で出せる
                "xp": self._xp(keys),
                # ログイン中かどうかで、画面の言い方を変えられるようにする
                "signed_in": bool(
                    getattr(request, "user", None)
                    and request.user.is_authenticated
                ),
            }
        )

    @staticmethod
    def _xp(keys: list) -> dict[str, object]:
        """学んだ量と、いまの呼び名。

        合計はいつも `XpEvent` の SUM。残高のカラムは持たない
        （2か所に持つと必ずずれる）。
        """
        from apps.rewards import xp as xp_module

        level = xp_module.level_for(xp_module.total_xp(keys))
        return {
            "total": level.total,
            "level": level.name,
            "next_level": level.next_name,
            "to_next": level.to_next,
        }


class SurveyView(_SessionMixin, APIView):
    """POST /api/lessons/{lesson_id}/survey/"""

    def post(self, request: Request, lesson_id: str) -> Response:
        serializer = SurveySerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        session = (
            LearningSession.objects.filter(
                learner_key__in=readable_keys(request), lesson_id=lesson_id
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
