"""キャッシュが worker をまたいで共有されること。

二重送信の抑止（`apps/ai/views.py` の `_is_duplicate`）はキャッシュを使う。
既定のキャッシュはプロセスの中にあるので、gunicorn を複数の worker で
動かすと worker ごとに別々の記憶になる。二重送信が別の worker に当たると
素通りし、AI をもう1回呼ぶ。学習者の実行回数と利用料が二重に減る。

見た目には何も壊れないので、動かしてみても気づけない。
だから設定そのものを見張る。
"""

from __future__ import annotations

import pytest
from django.core.cache import cache
from django.db import connection


class TestTheBackend:
    def test_it_is_not_kept_inside_the_process(self, settings):
        backend = settings.CACHES["default"]["BACKEND"]

        assert "locmem" not in backend, (
            "プロセスの中に置くと、worker ごとに別々の記憶になる。"
            "二重送信の抑止が worker の数だけ緩む"
        )
        assert "dummy" not in backend, "何も覚えないので、抑止が効かない"


@pytest.mark.django_db
class TestItActuallyWorks:
    def test_add_returns_false_the_second_time(self):
        """`add` は「無いときだけ書く」。二度目は False。

        抑止はこの性質そのもの。ここが崩れると、同じ内容が二度通る。
        """
        cache.delete("aippo:test:dedupe")

        assert cache.add("aippo:test:dedupe", 1, 60) is True
        assert cache.add("aippo:test:dedupe", 1, 60) is False

    def test_what_it_remembers_is_outside_the_process(self, settings):
        """覚えた内容が、プロセスの外（DB）に置かれていること。

        ここが通れば、別の worker から見ても同じ記憶になっている。
        プロセスの中に置いていると、この行はどこにも現れない。
        """
        if "db.DatabaseCache" not in settings.CACHES["default"]["BACKEND"]:
            pytest.skip("Redis を使う設定になっている")

        table = settings.CACHES["default"]["LOCATION"]
        cache.delete("aippo:test:shared")
        cache.add("aippo:test:shared", 1, 60)

        with connection.cursor() as cursor:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")  # noqa: S608 - 表名は設定由来
            stored = cursor.fetchone()[0]

        assert stored >= 1

    def test_the_table_exists_when_the_database_is_the_backend(self, settings):
        """手で `createcachetable` を叩く手順にしない。

        1手順増やすと、その1手順が抜ける。移行で作ってある。
        """
        if "db.DatabaseCache" not in settings.CACHES["default"]["BACKEND"]:
            pytest.skip("Redis を使う設定になっている")

        table = settings.CACHES["default"]["LOCATION"]

        assert table in connection.introspection.table_names()
