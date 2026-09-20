"""`AvailabilityStatus` に「一時停止」を足したぶんを、記録へ残す。

選択肢（`choices`）は Django の検証だけが見るもので、PostgreSQL には
何も出ない——**このマイグレーションは、表を1つも変えない。**

それでも要る。`makemigrations --check` は「モデルと記録が合っているか」
を見るので、合っていなければ CI がここで止まり続ける。実際、選択肢を
足した日から止まったままだった。

本番のDBには影響しないので、順番待ちも要らない。
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rewards", "0003_aiskill_aiskilllesson_aiskill_lessons_xpevent_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="learningpath",
            name="availability_status",
            field=models.CharField(
                choices=[
                    ("available", "利用できる"),
                    ("coming_soon", "近日公開"),
                    ("paused", "一時停止"),
                ],
                default="coming_soon",
                max_length=20,
                verbose_name="利用可能状態",
            ),
        ),
        migrations.AlterField(
            model_name="recipe",
            name="availability_status",
            field=models.CharField(
                choices=[
                    ("available", "利用できる"),
                    ("coming_soon", "近日公開"),
                    ("paused", "一時停止"),
                ],
                default="available",
                max_length=20,
                verbose_name="利用可能状態",
            ),
        ),
    ]
