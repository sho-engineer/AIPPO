"""コースにも「難易度」と「始められるか」を持たせる。

既定値は「近日公開」にしてある。新しく足すコースを、うっかり
開ける状態で出さないため。ただし**すでにあるコースには当てない**。

この項目が無かった時点で公開されていたコースは、当然もう開けている。
既定値をそのまま当てると、移行した瞬間に「一覧には出るが始められない」へ
変わり、学習の途中だった人がその日から進めなくなる。
だから下で、いまあるものだけ「利用できる」へ戻している。
"""

from django.db import migrations, models


def open_existing_courses(apps, schema_editor):
    """移行前からあるコースは、開いたままにする。"""
    Course = apps.get_model("catalog", "Course")
    Course.objects.update(availability_status="available")


def close_again(apps, schema_editor):
    """巻き戻し。項目そのものが消えるので、中身は問わない。"""


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0002_lesson_availability_status_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="course",
            name="availability_status",
            field=models.CharField(
                choices=[("available", "利用できる"), ("coming_soon", "近日公開")],
                default="coming_soon",
                help_text="出したうえで始められるか。既定は近日公開（うっかり開かないように）",
                max_length=20,
                verbose_name="利用可能状態",
            ),
        ),
        migrations.AddField(
            model_name="course",
            name="coming_soon_message",
            field=models.CharField(
                blank=True,
                help_text="近日公開のときに添える一言。空なら既定の文言",
                max_length=200,
            ),
        ),
        migrations.AddField(
            model_name="course",
            name="difficulty",
            field=models.CharField(
                choices=[
                    ("beginner", "初級"),
                    ("intermediate", "中級"),
                    ("advanced", "上級"),
                ],
                default="beginner",
                help_text="一覧のカードに出す。レッスンごとの難易度とは別（コース全体の目安）",
                max_length=20,
            ),
        ),
        migrations.RunPython(open_existing_courses, close_again),
    ]
