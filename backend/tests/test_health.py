"""`/health/ready` が、本当に「使える状態」を見ているか。

実際に起きた事故: 本番PostgreSQLへ migrate を当て忘れたまま配置し、
画面は出るのに `/api/v1/ai/generate/` が
`relation "catalog_lesson" does not exist` で 500 になった。そのあいだ
`/health/ready` は database:true・ai:true を返し続けていた——
「DBに接続できる」ことしか見ておらず、「migrate 済みで使える形になって
いる」かは見ていなかったため。

ここで確かめるのは3つ。

  1. 通常時は `migrations` が true で、全体も 200
  2. 未適用の migration が1件でもあると `migrations` が false になり、
     `/health/ready` 全体も 503 に落ちる（database は true のままでよい
     ——接続はできているので、混同しないことも合わせて見る）
  3. 判定は毎回計算し直さない（キャッシュに乗る）。ただしキャッシュが
     読めない状態でも、判定そのものは動く
"""

from __future__ import annotations

import pytest
from django.core.cache import cache
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder


@pytest.fixture(autouse=True)
def _clear_health_cache():
    """このテストが乗せたキャッシュを、他のテストへ持ち越さない。"""
    cache.delete("health:migrations_ok")
    yield
    cache.delete("health:migrations_ok")


#: catalog app のいちばん最後（leaf）の migration。
#:
#: `migration_plan()` は各appの**leaf**が適用済みかどうかで判定する。
#: 依存の途中（0001 など）だけを未適用にしても、leaf（0003）が
#: 適用済みのままならそこで「もう着いている」と判定され、途中の欠けは
#: 見ない。実際に試して確かめた（依存の一部を消しても plan が空のまま
#: だった）ので、ここでは必ず leaf を未適用にする。
_CATALOG_LEAF = "0004_lesson_thumbnail"


@pytest.fixture
def unapplied_migration():
    """1件だけ「未適用」にする。DBの中身自体は変えない。

    `django_migrations` の記録だけを消すので、テーブルは残ったまま
    ——`migrate --check` と同じものを見ている、という前提に沿う
    （表そのものを落とすテストではない）。
    """
    recorder = MigrationRecorder(connection)
    recorder.record_unapplied("catalog", _CATALOG_LEAF)
    yield
    recorder.record_applied("catalog", _CATALOG_LEAF)


@pytest.mark.django_db
class TestReady:
    def test_ok_when_everything_applied(self, api_client, settings):
        settings.AI_PROVIDER = "mock"
        response = api_client.get("/health/ready")

        assert response.status_code == 200
        body = response.json()
        assert body["checks"]["migrations"] is True
        assert body["status"] == "ok"

    def test_false_when_a_migration_is_unapplied(
        self, api_client, settings, unapplied_migration
    ):
        settings.AI_PROVIDER = "mock"
        response = api_client.get("/health/ready")

        body = response.json()
        assert body["checks"]["migrations"] is False
        # DBそのものには繋がっている。接続の可否とは別の軸であることを見る
        assert body["checks"]["database"] is True
        # 1件でも欠けていれば、全体としては「使えない」扱いにする
        assert response.status_code == 503
        assert body["status"] == "unavailable"

    def test_result_is_reused_within_the_cache_window(
        self, api_client, settings, unapplied_migration
    ):
        """1回目で false を計算したら、2回目はキャッシュから返る。

        `unapplied_migration` を戻さずに2回叩き、両方 false のままなら
        キャッシュに乗っていること自体は分かる（直接計算のたびに読み直す
        設計だと、ここは今のfixtureの状態と一致するので判別できない）。
        キャッシュの有無そのものは次のテストで見る。
        """
        settings.AI_PROVIDER = "mock"
        first = api_client.get("/health/ready").json()
        second = api_client.get("/health/ready").json()

        assert first["checks"]["migrations"] is False
        assert second["checks"]["migrations"] is False

    def test_cache_unreadable_falls_back_to_a_direct_check(
        self, api_client, settings, unapplied_migration
    ):
        """キャッシュの表が無くても、判定そのものは動く。

        「読めないから true とみなす」をやると、いちばん見たい事故
        （migrate忘れ）を見逃す側に倒れてしまう。読めなければ
        直接計算し、false のときは false のまま返すことを確かめる。
        """
        settings.CACHES = {
            "default": {
                "BACKEND": "django.core.cache.backends.db.DatabaseCache",
                "LOCATION": "table_that_does_not_exist",
            }
        }
        settings.AI_PROVIDER = "mock"

        response = api_client.get("/health/ready")

        assert response.json()["checks"]["migrations"] is False
        assert response.status_code == 503
