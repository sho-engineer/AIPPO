"""あとで見返したい教材の目印。

    GET    /api/lessons/bookmarks/   付けたものの一覧
    POST   /api/lessons/bookmarks/   付ける   {"lesson_id": "..."}
    DELETE /api/lessons/bookmarks/   外す     {"lesson_id": "..."}

なぜ要るか
----------
教材は1本10分で、探している途中に別のものが目に入る作りになっている。
だが「気になったが、いまは時間が無い」を残す場所が無かった。
次に開いたときには、その教材にもう一度たどり着けない。

付け外しを同じURLにした理由
---------------------------
`/bookmarks/<lesson_id>/` のように分けると、画面側は
「いま付いているか」で URL と動詞を組み立てることになる。
状態の取り違えが、そのまま「押しても何も起きない」に化ける。
`lesson_id` を本文で受け、動詞だけで分けるほうが間違えにくい。

存在しない教材を弾く理由
------------------------
`lesson_id` は画面から来る文字列で、教材表とは外部キーで
繋がっていない（学習記録が教材の削除で消えないように、あえて
繋いでいない）。素通しにすると、打ち間違いや古いブックマークが
一覧に残り続け、押すと何も無い画面へ飛ぶ。**付けるときだけ**確かめる。
外すときは確かめない——消せなくなるほうが困る。
"""

from __future__ import annotations

from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.scope import device_key, readable_keys
from apps.lessons.models import Bookmark, LearningSession

#: 1人が付けられる上限。
#:
#: 目印は取っておくためのもので、集めるためのものではない。
#: 上限が無いと、機械で叩かれたときに一覧が無限に伸びる。
#: 200 は、全教材を付けてもまだ余る数。
MAX_BOOKMARKS = 200


def _known_lesson_ids() -> set[str]:
    """いま始められる教材の id。

    公開前・提供停止のものは付けさせない。付けた先が開けないと、
    目印そのものが信用されなくなる。
    """
    from apps.catalog.models import AvailabilityStatus, Lesson, PublishStatus

    return set(
        Lesson.objects.filter(
            status=PublishStatus.PUBLISHED,
            availability_status=AvailabilityStatus.AVAILABLE,
        ).values_list("slug", flat=True)
    )


class BookmarkView(APIView):
    """付ける・外す・一覧。

    書き込みはいまの端末の鍵で、読み出しはその人の鍵ぜんぶで行う
    （`apps/accounts/scope.py` の作法）。ここを揃えないと、
    別の端末で付けた目印が消えたように見える。
    """

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        keys = readable_keys(request)
        if not keys:
            return Response({"items": []})

        marks = Bookmark.objects.filter(learner_key__in=keys)

        # 別の端末で同じ教材に付けていることがある。
        # 一覧には1回だけ出す（新しいほうを残す）
        seen: dict[str, Bookmark] = {}
        for mark in marks:
            seen.setdefault(mark.lesson_id, mark)

        # すでに終えたものは、目印の意味が変わる。消しはしないが、
        # 画面が「終わったのに『あとで』と出ている」を避けられるよう
        # 伝えておく
        finished = set(
            LearningSession.objects.filter(
                learner_key__in=keys,
                lesson_id__in=list(seen),
                completed_at__isnull=False,
            ).values_list("lesson_id", flat=True)
        )

        return Response(
            {
                "items": [
                    {
                        "lesson_id": lesson_id,
                        "created_at": mark.created_at.isoformat(),
                        "completed": lesson_id in finished,
                    }
                    for lesson_id, mark in sorted(
                        seen.items(), key=lambda pair: pair[1].created_at, reverse=True
                    )
                ]
            }
        )

    def post(self, request: Request) -> Response:
        lesson_id = self._lesson_id(request)
        if lesson_id is None:
            return Response(
                {"errors": {"lesson_id": ["教材が指定されていません"]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        key = device_key(request)
        if key is None:
            # 端末の鍵が無いと、誰の目印か決められない
            return Response(
                {"errors": {"detail": ["この端末では保存できません"]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if lesson_id not in _known_lesson_ids():
            return Response(
                {"errors": {"lesson_id": ["その教材は見つかりません"]}},
                status=status.HTTP_404_NOT_FOUND,
            )

        if Bookmark.objects.filter(learner_key=key).count() >= MAX_BOOKMARKS:
            return Response(
                {"errors": {"detail": [f"保存できるのは{MAX_BOOKMARKS}件までです"]}},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            # `transaction.atomic()` で囲むのが要。囲まずに IntegrityError を
            # 拾うと、取引そのものが壊れた印のまま残り、この後の問い合わせが
            # 全部 TransactionManagementError で落ちる。囲めば
            # セーブポイントまで戻せるので、ここだけ無かったことにできる。
            with transaction.atomic():
                Bookmark.objects.create(learner_key=key, lesson_id=lesson_id)
        except IntegrityError:
            # すでに付いている。押し直しただけなので、失敗にはしない
            pass

        return Response({"lesson_id": lesson_id, "bookmarked": True})

    def delete(self, request: Request) -> Response:
        lesson_id = self._lesson_id(request)
        if lesson_id is None:
            return Response(
                {"errors": {"lesson_id": ["教材が指定されていません"]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 外すのは、読める鍵ぜんぶから。別の端末で付けたものを
        # 外せないと、その目印は二度と消せなくなる
        keys = readable_keys(request)
        if keys:
            Bookmark.objects.filter(learner_key__in=keys, lesson_id=lesson_id).delete()

        # 付いていなくても成功にする。押した結果は同じ（付いていない）
        return Response({"lesson_id": lesson_id, "bookmarked": False})

    @staticmethod
    def _lesson_id(request: Request) -> str | None:
        value = (request.data or {}).get("lesson_id")
        if not isinstance(value, str):
            return None
        value = value.strip()
        return value or None
