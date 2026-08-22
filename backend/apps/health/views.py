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
DB・migration・AIの設定・メールの設定の4つ。どれが欠けても
「開いたのに何もできない」状態になる。特にメールは、送れないまま
登録を開くと、確認も再設定もできない人がそのまま溜まっていく。
届かないことに気づくのが問い合わせの時になるので、ここで見る。

「DBに繋がる」と「使える形になっている」は別物
----------------------------------------------
以前は `database` が SELECT 1 だけを見ていた。これは接続の確認にしか
ならず、**migrate をまだ当てていない空のDB**でも true になる。
実際に「本番PostgreSQLへmigrateを当て忘れたまま配置し、画面は出るのに
`/api/v1/ai/generate/` が `relation "catalog_lesson" does not exist` で
500 になる」という事故が起きた。そのとき `/health/ready` は
`{"database": true, "ai": true}` を返し続けていた——接続はできていた
（空のDBにも SELECT 1 は通る）ため。

`migrations` はこれを補う。django が知っている migration の一覧と、
実際にDBへ記録されている適用済みの一覧を突き合わせ、
**未適用のものが1件でもあれば false** にする
（`python manage.py migrate --check` と同じ判定）。

外へ出すのは「どれがだめか」まで。理由の詳細は出さない。
接続先や鍵の有無が分かると、攻撃の下調べに使える。
"""

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse

from apps.accounts import emails
from apps.ai.providers.registry import check_configured

#: migration の突き合わせは migration ファイル一式を読むので、
#: 毎request計算すると重い。結果をこの秒数だけ使い回す。
#: 短いのは、当て忘れたまま配置した事故に**すぐ気づける**ようにするため
#: ——長くしすぎると、直したのに ready が戻るまで待たされる側の事故になる。
_MIGRATIONS_CACHE_KEY = "health:migrations_ok"
_MIGRATIONS_CACHE_SECONDS = 60


def _db_ok() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:  # noqa: BLE001 - 原因は Django がログに残す
        return False
    return True


def _migrations_applied() -> bool:
    """未適用の migration が無いか。`migrate --check` と同じ判定。"""
    from django.db.migrations.executor import MigrationExecutor

    executor = MigrationExecutor(connection)
    plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
    return not plan


def _migrations_ok() -> bool:
    """
    キャッシュに乗せて使い回す。

    キャッシュそのものが読めない（表が無い、など）ときは、
    直接計算する側へ倒す——安全側と言えるのはこちらで、
    「読めないから true とみなす」をやると、いちばん見たい事故
    （表が無い状態）そのものを見逃す。
    """
    try:
        cached = cache.get(_MIGRATIONS_CACHE_KEY)
    except Exception:  # noqa: BLE001
        cached = None
    if cached is not None:
        return cached

    try:
        ok = _migrations_applied()
    except Exception:  # noqa: BLE001 - DBに繋がらない、など
        return False

    try:
        cache.set(_MIGRATIONS_CACHE_KEY, ok, _MIGRATIONS_CACHE_SECONDS)
    except Exception:  # noqa: BLE001
        pass  # 書けなくても、いま計算した判定結果はそのまま使う

    return ok


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
        "migrations": _migrations_ok(),
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
