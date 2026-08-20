"""修了証。

    GET /api/lessons/certificate/

コースの**公開済みで、いま始められるレッスンをすべて終えた人**にだけ返す。
途中の人には何も返さない。「あと1本」の状態で紙だけ先に出せてしまうと、
修了証はただの飾りになり、終えた人の分まで軽くなる。

判定は必ずサーバーでやる。端末に貯めた記録（frontend/src/lib/draft.ts）は
本人が書き換えられるので、そこを根拠にすると偽造できてしまう。

読む範囲は他の学習APIと同じ `readable_keys()`（apps/accounts/scope.py）。
ログイン中の人は端末をまたいで数える。1本目をスマホ、残りをパソコンで
終えた人に修了証が出ないのでは、登録した意味がない。

登録した人にだけ出す
--------------------
修了証は、あとで見返せて初めて証しになる。ゲストの鍵は7日で切れるので、
渡しても数日で本人から取り出せなくなる。**紙だけ渡して、置き場所を
用意しない**ことになるので、渡す前に登録してもらう。

学ぶこと自体は止めない。ゲストのままでも最後まで通るし、
終えた記録は残る。登録すれば、そのときの修了証がそのまま出る
（記録の引き継ぎで、いまの端末の鍵が本人のものになる）。
"""

from __future__ import annotations

import hmac
from datetime import datetime
from hashlib import sha256
from typing import Any
from uuid import UUID

from django.conf import settings
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.scope import can_keep, readable_keys
from apps.catalog.models import Course, Lesson, PublishStatus
from apps.lessons.models import LearningSession


def _first_completions(keys: list[UUID]) -> dict[str, dict[str, Any]]:
    """終えたレッスンごとに、**最初に**終えたときの記録。

    やり直すと completed_at の新しいセッションが増える。最新を採ると、
    もう一度触っただけで修了日が今日へ動き、通し番号まで変わってしまう。
    修了証は過ぎたことの証しなので、最初に終えた時点で固定する。
    """
    first: dict[str, dict[str, Any]] = {}
    rows = (
        LearningSession.objects.filter(learner_key__in=keys, completed_at__isnull=False)
        .order_by("completed_at")
        .values("lesson_id", "learner_key", "completed_at")
    )
    for row in rows:
        first.setdefault(row["lesson_id"], row)
    return first


def _serial(course_slug: str, learner_key: UUID, completed_at: datetime) -> str:
    """通し番号。

    連番にはしない。「AIPPO-0007」と書いてあれば 0006 も 0008 も
    あると分かってしまうし、他人の番号を言い当てられる。
    SECRET_KEY を鍵にした HMAC から作るので、外からは推測できず、
    同じ修了に対しては何度引いても同じ値になる。

    元にするのは「そのコースを終わらせた1回」の鍵と時刻。
    読み取り側の鍵の一覧は端末が増えると変わるので、そちらは使わない
    （使うと、パソコンでログインした翌日に番号が変わる）。
    """
    raw = f"{course_slug}:{learner_key}:{completed_at.isoformat()}"
    digest = hmac.new(settings.SECRET_KEY.encode(), raw.encode(), sha256).hexdigest().upper()
    return "AIPPO-" + "-".join(digest[at : at + 4] for at in (0, 4, 8))


def _skills(lessons: list[Lesson]) -> list[str]:
    """身についたこと。

    `outcomes` が進捗画面に出す言い回し、`learned_skills` はレッスン中の
    言い回し。埋まっているほうを採る。両方空の教材が混ざっても、
    そこだけ黙って抜けるだけで済むようにしている。

    重複は落とすが、並びは教材の順のまま保つ。set にして並べ直すと、
    受けた順に積み上がったという話の筋が消える。
    """
    gathered: list[str] = []
    for lesson in lessons:
        for skill in lesson.outcomes or lesson.learned_skills:
            if isinstance(skill, str) and skill and skill not in gathered:
                gathered.append(skill)
    return gathered


class CertificateView(APIView):
    """終えたコースの修了証だけを返す。

    出すのは自分のことだけ。何人が終えたかも、何番目かも出さない
    （比べさせると、遅い人ほど続かなくなる）。
    """

    def get(self, request: Request) -> Response:
        # ゲストには出さない。終えた記録のほうは消していないので、
        # 登録した瞬間に、そのときの修了証が出る
        if not can_keep(request):
            return Response({"certificates": [], "requires_account": True})

        first = _first_completions(readable_keys(request))

        certificates: list[dict[str, Any]] = []
        courses = Course.objects.filter(status=PublishStatus.PUBLISHED).prefetch_related(
            "lessons"
        )
        for course in courses:
            # 数えるのは「いま始められる教材」だけ。近日公開のものまで
            # 求めると、公開を1本足した瞬間に、渡した修了証が無効になる。
            required = [lesson for lesson in course.lessons.all() if lesson.is_startable]

            # 1本も無いコースは修了しようがない。空の条件は「全部満たした」に
            # なってしまうので、ここで落とさないと空の修了証が出る。
            if not required:
                continue
            if any(lesson.slug not in first for lesson in required):
                continue

            # コースが終わった瞬間＝最後の1本を終えたとき。
            anchor = max(
                (first[lesson.slug] for lesson in required),
                key=lambda row: row["completed_at"],
            )
            completed_at = anchor["completed_at"]

            certificates.append(
                {
                    "course_slug": course.slug,
                    "course_title": course.title,
                    # 日付は日本時間で切る。UTC のまま切ると、夜に終えた人の
                    # 修了日が前日になる。
                    "completed_on": timezone.localtime(completed_at).date().isoformat(),
                    "lesson_count": len(required),
                    "skills": _skills(required),
                    "serial": _serial(course.slug, anchor["learner_key"], completed_at),
                }
            )

        # 新しいものから。増えたときに、いま取ったものが上に来る
        certificates.sort(key=lambda entry: entry["completed_on"], reverse=True)
        return Response({"certificates": certificates})
