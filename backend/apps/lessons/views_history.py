"""学習の記録と、作ったものを見返す。

このアプリは「実際の仕事でAIを使えるようになる」ことを約束している。
なのに、作った文章はその場で消えていた。翌日「先週つくったやつを
もう一度」ができない。約束の真ん中に穴が空いている状態だった。

作ったものはもともとサーバーに残っている（`Attempt.generated_output`）。
足りなかったのは**本人が取り出す道**だけなので、ここはその読み口。

出すのは自分のことだけ
----------------------
読んでよい鍵は `readable_keys()` が決める（apps/accounts/scope.py）。
ログイン前に進めた分も、登録して結びついていれば一緒に出る。
順位も他人との比較も出さない。

貼った本文は出さない
--------------------
`Attempt.user_input` は既定で空（`AI_STORE_RAW_INPUT`）。
学習者は会社の文章を貼るので、既定で溜め込まない方針になっている。
ここでもその方針に従い、**返すのは AI が作ったものと、指定した条件だけ**。
入れた本文が残っていても返さない——「消したはずが見えている」を作らない。
"""

from __future__ import annotations

from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.scope import readable_keys
from apps.lessons.models import Attempt, AttemptStatus, LearningSession
from apps.lessons.services.quota import remaining_today

#: 1回に返す成果物の数。
#:
#: 増やしても読めないし、古いものほど見返さない。
#: 「先週つくったやつ」に届けば足りる。
MAX_ARTIFACTS = 50

#: 1つの成果物として返す本文の長さの上限。
#: これを超えるものは画面でも読み切れないので、末尾を落とす。
MAX_OUTPUT_CHARS = 4000


class HistoryView(APIView):
    """GET /api/lessons/history/

    「いつ・どの教材で・何を作ったか」を新しい順に返す。

    成果物（作った文章）と、そのとき指定した条件を一緒に返す。
    条件が無いと、なぜその結果になったのかが後から分からず、
    見返しても学びに繋がらない。
    """

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        keys = readable_keys(request)
        if not keys:
            return Response(
                {"artifacts": [], "sessions": [], "ai_quota": remaining_today(request)}
            )

        sessions = list(
            LearningSession.objects.filter(learner_key__in=keys).order_by("-updated_at")
        )

        return Response(
            {
                "sessions": [self._session(session) for session in sessions],
                "artifacts": self._artifacts(sessions),
                # 今日あと何回使えるか。上限に当たってから知るのでは遅い
                "ai_quota": remaining_today(request),
            }
        )

    @staticmethod
    def _session(session: LearningSession) -> dict[str, object]:
        return {
            "id": str(session.id),
            "lesson_id": session.lesson_id,
            "completed": session.completed_at is not None,
            "current_step": session.current_step,
            "attempt_count": session.attempt_count,
            "started_at": session.started_at.isoformat(),
            "updated_at": session.updated_at.isoformat(),
        }

    def _artifacts(self, sessions: list[LearningSession]) -> list[dict[str, object]]:
        """作ったもの。

        成功した実行だけを出す。失敗した回まで並べると、
        「作れたもの」を探しに来た人が探しづらくなる。
        空の結果も出さない（見ても何も無い）。
        """
        attempts = (
            Attempt.objects.filter(
                session__in=sessions,
                status=AttemptStatus.SUCCEEDED,
            )
            .exclude(generated_output="")
            .select_related("session")
            .order_by("-created_at")[:MAX_ARTIFACTS]
        )

        return [
            {
                "id": str(attempt.id),
                "lesson_id": attempt.lesson_id,
                "session_id": str(attempt.session_id),
                "action": attempt.action,
                "step": attempt.step,
                # 貼った本文は返さない（このファイルの冒頭に理由）
                "output": attempt.generated_output[:MAX_OUTPUT_CHARS],
                "truncated": len(attempt.generated_output) > MAX_OUTPUT_CHARS,
                "conditions": attempt.conditions,
                "created_at": attempt.created_at.isoformat(),
            }
            for attempt in attempts
        ]
