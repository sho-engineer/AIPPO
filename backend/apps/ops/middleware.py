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


class AdminAuditMiddleware:
    """管理画面で、学習者の記録に触れたことを残す。

    Django の `LogEntry` は追加・変更・削除しか残さない。
    **見ただけ**が抜けている。このアプリで一番起きてほしくないのは
    書き換えではなく、運用する人が学習者の記録を意味もなく
    読んでいくことなので、そこが抜けていては見張る意味が薄い。

    置く場所
    --------
    `AdminIpAllowlistMiddleware` より**後ろ**。先に置くと、
    締め出した相手の 404 まで「見た」として残る。

    認証より後ろでもある必要がある（誰が見たかを取るため）。

    残さないもの
    ------------
    中身は残さない。誰の記録を開いたかまでにする。
    監査のための記録が、それ自体2つ目の個人情報の山になっては
    本末転倒になる。
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)

        try:
            self._record(request, response)
        except Exception:  # noqa: BLE001 - 記録の失敗で画面を落とさない
            logger.exception("audit.admin.failed path=%s", request.path)

        return response

    def _record(self, request: HttpRequest, response: HttpResponse) -> None:
        if not _is_admin_path(request.path):
            return

        # 失敗した要求は残さない。見えていないものを「見た」にしない
        if response.status_code >= 400:
            return

        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            # ログイン画面など。誰が来たかは分からないので残さない
            return

        parsed = _parse_admin_path(request.path)
        if parsed is None:
            return

        app_label, model_name, object_id, verb = parsed
        label = f"{app_label}.{model_name}"

        from apps.ops import audit

        if not audit.is_watched(label):
            # 教材の編集などは対象外。全部残すと肝心の1件が埋もれる
            return

        if request.method == "POST":
            action = (
                audit.AuditAction.ADMIN_DELETE
                if verb == "delete"
                else audit.AuditAction.ADMIN_CHANGE
            )
        elif request.method == "GET":
            action = audit.AuditAction.ADMIN_VIEW
        else:
            return

        audit.record(
            action,
            actor=user.get_username(),
            target_model=label,
            target_id=object_id or "",
            ip=client_ip(request),
            # 一覧か1件か。一覧を開いたのと、特定の人を開いたのとでは重みが違う
            scope="object" if object_id else "list",
        )


def _parse_admin_path(path: str) -> tuple[str, str, str, str] | None:
    """`/admin/lessons/attempt/3/change/` を分解する。

    管理画面の場所は変えられる（`ADMIN_PATH`）ので、前置きを
    取り除いてから見る。形が合わないものは対象外として捨てる。
    """
    prefix = "/" + getattr(settings, "ADMIN_PATH", "admin/")
    rest = path[len(prefix) :] if path.startswith(prefix) else path.lstrip("/")

    parts = [part for part in rest.split("/") if part]
    if len(parts) < 2:
        # トップページなど。表を指していないので残さない
        return None

    app_label, model_name = parts[0], parts[1]
    object_id = ""
    verb = ""

    if len(parts) >= 3 and parts[2] not in {"add"}:
        object_id = parts[2]
        verb = parts[3] if len(parts) >= 4 else ""

    return app_label, model_name, object_id, verb
