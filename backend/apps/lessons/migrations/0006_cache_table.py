"""共有のキャッシュ置き場を作る。

なぜ要るか
----------
二重送信の抑止（apps/ai/views.py の `_is_duplicate`）はキャッシュを使う。
既定のキャッシュは **プロセスの中** にあるので、gunicorn を複数の worker で
動かすと、worker ごとに別々の記憶を持つ。二重送信が別の worker に当たると
素通りし、AI をもう1回呼ぶ。学習者の実行回数と利用料が二重に減る。

REDIS_URL があればそちらを使うので、この表は使われない。
無いときの置き場としてここで作っておく。あとから
`createcachetable` を手で叩く手順にすると、その1手順が抜ける。
"""

from django.core.management import call_command
from django.db import migrations


def create(apps, schema_editor):
    call_command("createcachetable", "aippo_cache", database=schema_editor.connection.alias)


def drop(apps, schema_editor):
    schema_editor.execute("DROP TABLE IF EXISTS aippo_cache")


class Migration(migrations.Migration):
    dependencies = [("lessons", "0005_alter_learningevent_event_type")]

    operations = [migrations.RunPython(create, drop)]
