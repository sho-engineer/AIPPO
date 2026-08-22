from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("catalog", "0003_course_availability_status_and_more")]

    operations = [
        migrations.AddField(
            model_name="lesson",
            name="thumbnail",
            field=models.CharField(
                blank=True,
                help_text="public/ からの道筋（例: /assets/lessons/rewrite_text.webp）",
                max_length=200,
            ),
        ),
    ]
