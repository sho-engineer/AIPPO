"""匿名学習者の識別（research.md R-04）。

初回アクセス時に UUID の learner_key を発行し、HttpOnly Cookie に格納する。
メールアドレスやパスワードは MVP では要求しない（憲章 原則 VI）。
"""

import uuid
from collections.abc import Callable

from django.conf import settings
from django.http import HttpRequest, HttpResponse


class LearnerKeyMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        raw = request.COOKIES.get(settings.LEARNER_KEY_COOKIE, "")
        try:
            learner_key = uuid.UUID(raw)
            is_new = False
        except ValueError:
            learner_key = uuid.uuid4()
            is_new = True

        request.learner_key = learner_key
        response = self.get_response(request)

        if is_new:
            response.set_cookie(
                settings.LEARNER_KEY_COOKIE,
                str(learner_key),
                max_age=settings.LEARNER_KEY_MAX_AGE,
                httponly=True,
                secure=not settings.DEBUG,
                samesite="Lax",
            )
        return response
