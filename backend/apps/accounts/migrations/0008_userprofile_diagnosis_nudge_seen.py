"""ホームの「まずは診断を」の案内を、もう見せたか。

すでに居る人には True を入れて配る
----------------------------------
新しい列の既定は False（＝まだ見ていない）。そのまま配ると、**今日
この機能が増えたことを理由に**、昨日まで普通に使っていた人のホームへ
案内が出る。使い慣れた人から見れば、知っている画面に知らない
ポップアップが突然かぶさるだけで、案内になっていない。

だから、この移行が走る時点で既に居る人は「見た」ことにする。今日より
あとに登録する人だけが、列の既定（False）のまま案内を受け取る。

逆向き（`backwards`）は何もしない。**戻すと全員が未読に戻り**、
次にホームを開いた全員へ案内が出る——戻す操作の副作用として
いちばん起きてほしくないこと。列ごと消えるので、残すものも無い。
"""

from django.db import migrations, models


def mark_existing_as_seen(apps, schema_editor):
    profile = apps.get_model("accounts", "UserProfile")
    profile.objects.update(diagnosis_nudge_seen=True)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_userprofile_unlimited_ai_runs"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="diagnosis_nudge_seen",
            field=models.BooleanField(default=False, verbose_name="診断の案内を見た"),
        ),
        migrations.RunPython(mark_existing_as_seen, migrations.RunPython.noop),
    ]
