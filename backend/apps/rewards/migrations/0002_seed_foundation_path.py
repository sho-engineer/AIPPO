"""既存の「7日でAIの最初の一歩」を、最初のLearning Pathとして取り込む。

やること（設計方針 §30 に従う）:

- 既存 Course（slug=first_step_7days）と同じ内容で LearningPath を1本作る
- その9レッスンを LearningPathLesson として参照する
  （Lesson 自体は複製しない。既存の Course→Lesson の紐付けにも触れない）
- レッスン完了で埋まる Stamp を9個ぶん定義する
- 節目の特典を3件（3個→1 Credit、5個→2 Credits、9個(完走)→3 Credits）
- AI機能ごとのCredit消費量の既定値

他の6コース（work_writing など）は、いまは中身の無い空の骨組みで、
題や範囲が §31 の例（「仕事で使える画像生成」等）と1対1で対応しない。
実際に中身を作るときに、そのときの内容に合わせて Learning Path 化する
（docs/learning-architecture-audit.md と同じ考え方: 実体の無い場所を
先に埋めない）。
"""

from __future__ import annotations

from django.db import migrations

#: レッスン数(9)ぶんのスタンプに対して、Credit を渡す節目。
#: 数値は運用側が Django Admin から変更できる（コードには残さない前提の初期値）。
FOUNDATION_MILESTONES = (
    # (required_stamp_count, reward_credits, badge_name)
    (3, 1, ""),
    (5, 2, ""),
    (9, 3, "AIの最初の一歩 Complete"),
)

#: AI機能ごとのCredit消費量の初期値。無料コース(Foundation)のテキスト系は 0。
AI_TASK_PRICING = (
    ("basic_text", 0, "要約・書き直し・分類など、基本のテキスト処理"),
    ("advanced_text", 1, "より高性能なモデルを使うテキスト処理"),
    ("image_standard", 1, "標準品質の画像生成"),
    ("image_high", 3, "高品質の画像生成"),
    ("image_edit", 2, "画像の修正"),
    ("video_future", 10, "将来の動画生成（未実装）"),
)


def seed(apps, schema_editor):
    Course = apps.get_model("catalog", "Course")
    LearningPath = apps.get_model("rewards", "LearningPath")
    LearningPathLesson = apps.get_model("rewards", "LearningPathLesson")
    StampDefinition = apps.get_model("rewards", "StampDefinition")
    PathRewardMilestone = apps.get_model("rewards", "PathRewardMilestone")
    AiTaskPricing = apps.get_model("rewards", "AiTaskPricing")

    course = Course.objects.filter(slug="first_step_7days").first()
    if course is None:
        # 同梱データだけの環境（教材未取り込み）。あとで取り込まれたときは
        # 別途このマイグレーションを再実行できないので、何もせず抜ける
        # （管理コマンド等で改めて作る運用にする）。
        return

    path, _ = LearningPath.objects.get_or_create(
        slug=course.slug,
        defaults={
            "title": course.title,
            "description": course.description,
            "short_description": course.description[:200],
            "category": "foundation",
            "difficulty": course.difficulty,
            "access_type": course.access_type,
            "status": course.status,
            "availability_status": course.availability_status,
            "sort_order": course.sort_order,
            "badge_name": "AIの最初の一歩 Complete",
        },
    )

    for lesson in course.lessons.all().order_by("sort_order", "number"):
        membership, _ = LearningPathLesson.objects.get_or_create(
            learning_path=path,
            lesson=lesson,
            defaults={"order": lesson.number, "is_required": True, "stamp_eligible": True},
        )
        StampDefinition.objects.get_or_create(
            learning_path=path,
            stamp_type="lesson",
            lesson=lesson,
            defaults={"title": lesson.title, "order": lesson.number, "active": True},
        )

    for order, (count, credits_, badge) in enumerate(FOUNDATION_MILESTONES):
        PathRewardMilestone.objects.get_or_create(
            learning_path=path,
            required_stamp_count=count,
            defaults={"reward_credits": credits_, "badge_name": badge, "order": order},
        )

    for task_type, cost, note in AI_TASK_PRICING:
        AiTaskPricing.objects.get_or_create(
            task_type=task_type, defaults={"credit_cost": cost, "note": note}
        )


def unseed(apps, schema_editor):
    LearningPath = apps.get_model("rewards", "LearningPath")
    AiTaskPricing = apps.get_model("rewards", "AiTaskPricing")
    LearningPath.objects.filter(slug="first_step_7days").delete()
    AiTaskPricing.objects.filter(
        task_type__in=[row[0] for row in AI_TASK_PRICING]
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("rewards", "0001_initial"),
        ("catalog", "0003_course_availability_status_and_more"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
