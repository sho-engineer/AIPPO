"""管理画面を、決めた接続元からしか開けなくする。

管理画面の向こうには、実証実験で集めた**全学習者の記録**がある。
いま間にあるのは合言葉ひとつだけで、しかも `/admin/` という
誰でも知っている場所に出ている。総当たりも、どこかで漏れた
合言葉の使い回しも、そこを狙う。

そこで守りをもう1枚足す。管理画面を開くのは運用する数人だけなので、
**接続元で絞る**のがいちばん素直に効く。合言葉が漏れても、
その場所からでなければ入り口に届かない。

制限をかけるのは `DJANGO_ADMIN_ALLOWED_IPS` を入れたときだけ。
空なら何もしない。既定を「制限あり」にすると、設定を知らない人の
手元で管理画面がいきなり消える。締め出すのは、締め出すと決めたときだけ。

なぜ 403 ではなく 404 か
------------------------
403 は「ここに管理画面はあるが、あなたは入れない」と教えることになる。
場所を変える（`DJANGO_ADMIN_PATH`）意味が、それで消える。
404 なら、探している側からは何も無いのと区別が付かない。
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from django.conf import settings
from django.http import Http404, HttpRequest, HttpResponse

# 接続元の取り方は1か所にまとめてある。
# X-Forwarded-For を信じてよいかの判断（TRUST_FORWARDED_FOR）が
# ここだけ違うと、片方の守りだけ詐称で抜けられる状態になる。
# 認証の連打止め（apps/accounts/throttle.py）も同じものを使っている。
from apps.lessons.services.quota import client_ip

logger = logging.getLogger(__name__)


class AdminIpAllowlistMiddleware:
    """`ADMIN_ALLOWED_IPS` に無い接続元からの管理画面を 404 にする。

    セッションを読む**前**に置くこと。締め出す相手のために
    DB からセッションを引く理由は無い。
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if self._is_blocked(request):
            # 誰が弾かれたかは残す。運用する人が自分で締め出したとき、
            # ログが無いと「なぜ 404 なのか」に辿り着けない。
            logger.warning("admin.blocked ip=%s path=%s", client_ip(request), request.path)
            raise Http404

        return self.get_response(request)

    def _is_blocked(self, request: HttpRequest) -> bool:
        allowed = getattr(settings, "ADMIN_ALLOWED_IPS", []) or []
        if not allowed:  # 空なら制限しない（手元の開発を壊さない）
            return False
        if not _is_admin_path(request.path):
            return False
        return client_ip(request) not in allowed


def _is_admin_path(path: str) -> bool:
    """管理画面へ向かう要求か。

    `/admin` のように末尾の / が無い形でも入ってくる（`APPEND_SLASH` が
    あとで付け足す）。そこを見落とすと、1文字削るだけで守りを抜けられる。
    """
    prefix = "/" + getattr(settings, "ADMIN_PATH", "admin/")
    return path == prefix.rstrip("/") or path.startswith(prefix)
