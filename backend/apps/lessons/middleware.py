"""匿名学習者の識別（research.md R-04）。

初回アクセス時に UUID の learner_key を発行し、HttpOnly Cookie に格納する。
メールアドレスやパスワードは MVP では要求しない（憲章 原則 VI）。

同じときに、その人の暦（タイムゾーン）も覚える。毎日のぶんを
**その人の 00:00** で配るのに要る（`services/localtime.py`）。
"""

import uuid
from collections.abc import Callable

from django.conf import settings
from django.http import HttpRequest, HttpResponse

from apps.lessons.services import localtime


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
        """
        この要求から分かる暦を、requestへ載せておく。**まだ書かない。**

        ここで毎回DBを触ると、教材を1枚読むだけの要求にも
        SELECT と UPDATE が1本ずつ増える。使うのは「毎日のぶんを
        配るか」を決める一瞬だけなので、書くのはそのとき
        （`services/credits.ensure_ready`）にする。

        推すのは毎回でよい——推した結果で**保存を上書きするかどうか**は
        出どころの強さで決まる（`services/localtime.py`）。
        """
        request.timezone_hint = localtime.detect(request)
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
