"""稼働確認用のエンドポイント。

ロードバランサやコンテナの死活監視から叩く。
2種類に分けているのは、用途が違うため。

- `/health/live`  … プロセスが生きているか。何も外を見ない。
                    落ちていたら**再起動**すべき
- `/health/ready` … 実際にリクエストを捌けるか。
                    だめなら**振り分けを外す**べき

`ready` を死活監視に使うと、DBが一時的に詰まっただけで
全プロセスが再起動される事故が起きるので分けてある。

`ready` が見るもの
------------------
DB・AIの設定・メールの設定の3つ。どれが欠けても
「開いたのに何もできない」状態になる。特にメールは、送れないまま
登録を開くと、確認も再設定もできない人がそのまま溜まっていく。
届かないことに気づくのが問い合わせの時になるので、ここで見る。

外へ出すのは「どれがだめか」まで。理由の詳細は出さない。
接続先や鍵の有無が分かると、攻撃の下調べに使える。
"""

from django.conf import settings
from django.db import connection
from django.http import JsonResponse

from apps.accounts import emails
from apps.ai.providers.registry import check_configured


def _db_ok() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:  # noqa: BLE001 - 原因は Django がログに残す
        return False
    return True


def _ai_ok() -> bool:
    try:
        check_configured()
    except Exception:  # noqa: BLE001 - 鍵が無い / 名前が違う、など
        return False
    return True


def live(request) -> JsonResponse:
    """生きているか。外は何も見ない。"""
    return JsonResponse({"status": "ok"})


def ready(request) -> JsonResponse:
    checks = {
        "database": _db_ok(),
        "ai": _ai_ok(),
        "email": emails.is_configured(),
    }
    ok = all(checks.values())

    return JsonResponse(
        {
            "status": "ok" if ok else "unavailable",
            "checks": checks,
            # AI が本物か mock かは、事故調査で最初に知りたい情報
            "ai_provider": settings.AI_PROVIDER,
        },
        status=200 if ok else 503,
    )


#: 旧名。監視の設定を一度に書き換えられないので、しばらく残す。
healthz = live
readyz = ready
