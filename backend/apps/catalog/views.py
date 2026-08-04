"""教材を配る。

    GET /api/v1/catalog/

公開済みのコースとレッスンを、画面がそのまま食べられる形で返す。
誰でも読める（登録前でも教材を見て始められることが第一リリースの前提）。

近日公開の教材も**一覧には出す**。ただしステップは配らない。
中身まで渡すと、画面側で「取れているのだから始められる」作りができてしまう。
"""

from __future__ import annotations

from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.expand import course_to_dict
from apps.catalog.models import Course, PublishStatus


class CatalogView(APIView):
    """公開済みの教材一式。"""

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        courses = (
            Course.objects.filter(status=PublishStatus.PUBLISHED)
            .prefetch_related("lessons__steps")
            .order_by("sort_order", "id")
        )
        return Response({"courses": [course_to_dict(course) for course in courses]})
