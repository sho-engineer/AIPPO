"""復習。一度やったことを、忘れる前にもう一度。

いまのアプリは「一度やったら終わり」だった。学習サービスとして、
ここが無いのはかなり大きい。人は覚えたことを翌日には半分忘れる。
忘れたまま放っておけば、7日かけて学んだことは残らない。

やること
--------
終えた教材を「そろそろ見返しどき」の順に並べて返す。
それだけ。テストも点数も出さない。

**点数を付けない理由**が2つある。

  - このアプリの相手はAIに不安がある初心者。点数を出すと、
    低い点を取った人からいなくなる
  - 覚えているかを測るより、もう一度手を動かすほうが定着する。
    このアプリは手を動かす作りになっているので、そちらへ戻せばよい

いつ「見返しどき」か
--------------------
間隔をあけて思い出すほど定着する（間隔反復）。
細かい理論には踏み込まず、素直な段階だけ置く。

    1回目のあと … 1日後
    2回目のあと … 3日後
    3回目のあと … 7日後
    4回目以降   … 14日後

「何回やったか」は、その教材を終えたセッションの数で数える。
専用の記録を足さない——足すと、消す仕組みも作ることになる。
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.scope import readable_keys
from apps.lessons.models import LearningSession

#: 何回目のあと、何日あけるか。
#:
#: 最後の値は、それ以降ずっと使う。無限に伸ばさないのは、
#: 間隔が空きすぎると「もう関係ないもの」になってしまうため。
INTERVALS_DAYS = (1, 3, 7, 14)


def _interval_for(times_done: int) -> int:
    """何回終えた人に、次は何日あけるか。"""
    index = min(max(times_done, 1), len(INTERVALS_DAYS)) - 1
    return INTERVALS_DAYS[index]


class ReviewView(APIView):
    """GET /api/lessons/review/

    見返しどきの教材を、待たせている順に返す。

    まだ時期でないものも `due` を false にして返す。
    「次はいつか」が見えないと、待っているのか忘れられたのかが
    分からない。
    """

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        keys = readable_keys(request)
        if not keys:
            return Response({"items": [], "due_count": 0})

        finished = LearningSession.objects.filter(
            learner_key__in=keys, completed_at__isnull=False
        ).order_by("completed_at")

        # 教材ごとに「何回終えたか」と「最後に終えたのはいつか」を集める
        by_lesson: dict[str, dict[str, object]] = {}
        for session in finished:
            entry = by_lesson.setdefault(
                session.lesson_id, {"times_done": 0, "last_done_at": session.completed_at}
            )
            entry["times_done"] = int(entry["times_done"]) + 1
            entry["last_done_at"] = session.completed_at

        now = timezone.now()
        items = []
        for lesson_id, entry in by_lesson.items():
            times_done = int(entry["times_done"])
            last_done_at = entry["last_done_at"]
            due_at = last_done_at + timedelta(days=_interval_for(times_done))

            items.append(
                {
                    "lesson_id": lesson_id,
                    "times_done": times_done,
                    "last_done_at": last_done_at.isoformat(),
                    "due_at": due_at.isoformat(),
                    "due": due_at <= now,
                    # あと何日待つか。過ぎているものは 0
                    "days_until_due": max(0, (due_at - now).days),
                }
            )

        """並べ方。

        見返しどきのものを先に、そのなかでも**長く待たせているもの**を先に。
        待たせるほど忘れているので、そこから戻すのが効く。
        まだ時期でないものは、近いものから後ろに並べる。
        """
        items.sort(key=lambda item: (not item["due"], item["due_at"]))

        return Response(
            {
                "items": items,
                "due_count": sum(1 for item in items if item["due"]),
            }
        )
