"""ログインを、いつまでも続かせない。

Django の `SESSION_COOKIE_AGE` は**最後に触ってからの期限**でしかない。
このアプリは `SESSION_SAVE_EVERY_REQUEST = True` なので、要求のたびに
期限が先へ延びる。つまり、たまに開くだけの人でも
**ログインしたまま何年でも過ごせる**。

それは2つの理由で困る。

  1. 端末を手放したあと（機種変・売却・家族との共用）、
     ログイン状態がいつまでも生きたままになる
  2. 退会や合言葉の変更といった、こちら側の都合で切りたい場面で、
     切れるまで待てる期限が無い

そこで「最後に触ってからの期限」とは別に、
**ログインした瞬間から数える上限**を置く。上限を過ぎたら、
次の要求で黙ってログアウトさせる。

どちらの期限も設定で変えられる。

  SESSION_COOKIE_AGE        … 触らないまま何秒でログアウトするか（既定30日）
  SESSION_ABSOLUTE_MAX_AGE  … ログインから何秒でログアウトするか（既定90日）

上限を 0 以下にすると、上限そのものを外せる。
"""

from __future__ import annotations

import logging
import time

from django.conf import settings
from django.contrib.auth import logout
from django.contrib.auth.signals import user_logged_in

logger = logging.getLogger(__name__)

#: ログインした時刻を入れておく場所。セッションの中に置く。
#: Cookie ではなくセッション側に置くのは、利用者が書き換えられないため。
STARTED_AT_KEY = "auth_started_at"


def remember_login_time(sender, request, user, **kwargs) -> None:
    """ログインした時刻を控える。

    `user_logged_in` は、こちらの signin だけでなく管理画面からの
    ログインでも飛ぶ。どちらから入っても同じ上限を当てたいので、
    view ではなくここで拾う。
    """
    if request is None or not hasattr(request, "session"):
        return
    request.session[STARTED_AT_KEY] = time.time()


def connect() -> None:
    user_logged_in.connect(
        remember_login_time,
        dispatch_uid="apps.accounts.session.remember_login_time",
    )


def _max_age() -> float:
    return float(getattr(settings, "SESSION_ABSOLUTE_MAX_AGE", 0) or 0)


class AbsoluteSessionTimeoutMiddleware:
    """ログインから一定の期間が過ぎたら、ログアウトさせる。

    `AuthenticationMiddleware` の**あと**に置くこと。
    先に置くと `request.user` がまだ無く、何も判定できない。

    判定は要求のたびに行うが、費用はセッションから数値を1つ読むだけ。
    期限切れのときだけ `logout()` を呼ぶ（セッションを消す）。
    """

    def __init__(self, get_response) -> None:
        self.get_response = get_response

    def __call__(self, request):
        self._expire_if_too_old(request)
        return self.get_response(request)

    def _expire_if_too_old(self, request) -> None:
        max_age = _max_age()
        if max_age <= 0:
            return

        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return

        started_at = request.session.get(STARTED_AT_KEY)
        if started_at is None:
            """時刻が入っていないセッション。

            この仕組みを入れる前からログインしていた人がここへ来る。
            いきなり追い出すと、更新した瞬間に全員がログアウトする。
            いまを始まりとして控え、そこから数え直す。
            """
            request.session[STARTED_AT_KEY] = time.time()
            return

        try:
            elapsed = time.time() - float(started_at)
        except (TypeError, ValueError):
            # 読めない値が入っていた。控え直して次から数える
            request.session[STARTED_AT_KEY] = time.time()
            return

        if elapsed < max_age:
            return

        # 誰がいつ切れたかは残さない。切れたという事実だけで足りる
        logger.info("auth.session.expired elapsed=%ds max=%ds", int(elapsed), int(max_age))
        logout(request)
