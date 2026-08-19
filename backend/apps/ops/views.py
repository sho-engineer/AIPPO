"""定期実行から叩く入り口。

`manage.py prune_data` は前からある。だが**動かす仕組みが無かった**。
プライバシーポリシーには「一定期間が過ぎたら削除します」と書いてある。
書いてあるのに一度も動いていないなら、それは書いたことが嘘になる。

Vercel には常駐するプロセスも cron の置き場も無い（要求が来たときだけ
関数が動く）。代わりに Vercel Cron が、決めた時刻に決めた URL を叩く。
だから「HTTP で叩ける prune_data」が要る。

守り
----
消す操作は取り消せない。誰でも叩ける入り口にはできないので、
`CRON_SECRET` と `Authorization: Bearer <secret>` を突き合わせる。

**`CRON_SECRET` が空のあいだ、この入り口は 404 で存在しない。**
逆（空なら素通り）にすると、合言葉を入れ忘れた配置で
「誰でも全データを消せる URL」が開く。入れ忘れは必ず起きるので、
起きたときに安全な側へ倒しておく。

Vercel は CRON_SECRET を設定しておくと、Cron からの要求に
`Authorization: Bearer <CRON_SECRET>` を自分で付けてくれる。
名前を合わせてあるのはそのため。
"""

from __future__ import annotations

import hmac
import logging
from datetime import timedelta

from django.conf import settings
from django.http import Http404, HttpRequest, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from apps.lessons.management.commands.prune_data import prune

logger = logging.getLogger(__name__)

#: 受け付ける動詞。
#:
#: POST が本来の形（状態を変える操作）。GET も受けるのは、
#: **Vercel Cron が GET でしか叩けない**ため。ここを POST だけに
#: すると、設定は正しいのに毎回 405 が返り、消えないまま気づけない。
#: GET でも合言葉は要るので、リンクを踏んだだけでは何も起きない。
ALLOWED_METHODS = {"GET", "POST"}


def _is_authorized(request: HttpRequest, secret: str) -> bool:
    """合言葉が合っているか。

    比較は `hmac.compare_digest`。`==` は違いが見つかった時点で
    返るので、返るまでの時間から「どこまで合っていたか」が漏れる。
    1文字ずつ試せば、総当たりの手間が桁違いに減る。
    """
    header = request.META.get("HTTP_AUTHORIZATION", "")
    prefix = "Bearer "
    if not header.startswith(prefix):
        return False
    return hmac.compare_digest(header[len(prefix) :], secret)


@csrf_exempt
def prune_expired_data(request: HttpRequest) -> JsonResponse:
    """古いゲストデータを消す。消した件数を返す。

    件数を返すのは、定期実行が**動いている**ことを外から確かめるため。
    204 だけを返す作りにすると、空振りし続けていても気づけない。
    """
    secret = getattr(settings, "CRON_SECRET", "")
    if not secret:
        # 合言葉が無いなら、この入り口は無いものとして扱う
        raise Http404

    if request.method not in ALLOWED_METHODS:
        return JsonResponse({"error": "method_not_allowed"}, status=405)

    if not _is_authorized(request, secret):
        # 合言葉が違うことだけ返す。どこが違うかは言わない
        logger.warning("cron.prune.unauthorized method=%s", request.method)
        return JsonResponse({"error": "unauthorized"}, status=401)

    days = settings.GUEST_DATA_RETENTION_DAYS
    cutoff = timezone.now() - timedelta(days=days)
    deleted = prune(cutoff)

    # 何をいつ消したかはログに残す。あとから「本当に動いていたか」を
    # 確かめられるのは、ここだけになる
    logger.info("cron.prune.done days=%d deleted=%s", days, deleted)

    return JsonResponse(
        {
            "status": "ok",
            "days": days,
            "cutoff": cutoff.date().isoformat(),
            "deleted": deleted,
            "deleted_total": sum(deleted.values()),
        }
    )
