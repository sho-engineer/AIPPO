"""稼働確認用のエンドポイント。

ロードバランサやコンテナの死活監視から叩く。
2種類に分けているのは、用途が違うため。

- `/healthz`  … プロセスが生きているか。DBは見ない。落ちていたら再起動すべき
- `/readyz`   … 実際にリクエストを捌けるか。DBが見えなければ振り分けを外すべき

`/readyz` を死活監視に使うと、DBが一時的に詰まっただけで
全プロセスが再起動される事故が起きるので分けてある。
"""

from django.conf import settings
from django.db import connection
from django.http import JsonResponse


def healthz(request) -> JsonResponse:
    return JsonResponse({"status": "ok"})


def readyz(request) -> JsonResponse:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        # 原因の詳細は外へ出さない。ログには Django が残す。
        return JsonResponse({"status": "unavailable"}, status=503)

    return JsonResponse(
        {
            "status": "ok",
            # AI が本物かスタブかは、事故調査で最初に知りたい情報
            "ai_provider": settings.AI_PROVIDER,
        }
    )
