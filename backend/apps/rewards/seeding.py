"""Learning Path / スタンプ / 節目の特典 / AI単価の初期データ。

何度実行しても同じ結果になる（slug と数で突き合わせて get_or_create する）。
すでに管理画面で直した値を、実行のたびに巻き戻さない。

なぜマイグレーションと別に置くか
--------------------------------
新しい環境の立ち上げは

    migrate → seed_catalog

の順に走る。マイグレーションの時点ではコースもレッスンもまだ無いので、
そこで Learning Path を作ろうとしても**作る相手がいない**。
実際、これを migrate の中だけに置いていたときは、新しい環境では
スタンプ定義が1件も作られず、**エラーも出ないまま**スタンプが
永久に埋まらない状態になっていた。

そこで、教材を入れ終わったところ（`seed_catalog` の最後）から
呼ぶ。すでに教材が入っている環境（いまの本番）は、マイグレーション側の
同じ内容の処理で作られているので、どちらの順番でも揃う。
"""

from __future__ import annotations

from apps.catalog.models import Course
from apps.rewards.models import (
    AiTaskPricing,
    LearningPath,
    LearningPathLesson,
    PathRewardMilestone,
    StampDefinition,
    StampType,
)

#: Foundation コースの節目。数は運用側が管理画面から変えられる（ここは初期値）。
#: (required_stamp_count, reward_credits, badge_name)
FOUNDATION_MILESTONES: tuple[tuple[int, int, str], ...] = (
    (3, 1, ""),
    (5, 2, ""),
    (9, 3, "AIの最初の一歩 Complete"),
)

#: AI機能ごとのCredit消費量の初期値。
#: 無料コース（Foundation）のテキスト系は 0——初心者が学習の途中で
#: Credit不足になって進めなくなる状態を作らない。
#: (task_type, credit_cost, note)
AI_TASK_PRICING: tuple[tuple[str, int, str], ...] = (
    ("basic_text", 0, "要約・書き直し・分類など、基本のテキスト処理"),
    ("advanced_text", 1, "より高性能なモデルを使うテキスト処理"),
    ("image_standard", 1, "標準品質の画像生成"),
    ("image_high", 3, "高品質の画像生成"),
    ("image_edit", 2, "画像の修正"),
    ("video_future", 10, "将来の動画生成（未実装）"),
)

#: Learning Path として取り込むコースの slug。
#:
#: いま中身があるのは Foundation の1本だけ。ほかの6コースは題だけの
#: 空の骨組みで、Learning Path 案（「仕事で使える画像生成」など）とは
#: 範囲が1対1で対応しない。中身を作るときに、その内容に合わせて足す。
FOUNDATION_SLUG = "first_step_7days"


def seed_ai_task_pricing() -> int:
    """AI単価だけを入れる。コースの有無とは関係なく成り立つ。"""
    made = 0
    for task_type, cost, note in AI_TASK_PRICING:
        _, created = AiTaskPricing.objects.get_or_create(
            task_type=task_type, defaults={"credit_cost": cost, "note": note}
        )
        made += int(created)
    return made


def seed_foundation_path() -> LearningPath | None:
    """既存の Foundation コースを、最初の Learning Path として取り込む。

    コースがまだ無ければ何もしない（`None` を返す）。
    """
    course = Course.objects.filter(slug=FOUNDATION_SLUG).first()
    if course is None:
        return None

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
        LearningPathLesson.objects.get_or_create(
            learning_path=path,
            lesson=lesson,
            defaults={
                "order": lesson.number,
                "is_required": True,
                "stamp_eligible": True,
            },
        )
        StampDefinition.objects.get_or_create(
            learning_path=path,
            stamp_type=StampType.LESSON,
            lesson=lesson,
            defaults={"title": lesson.title, "order": lesson.number, "active": True},
        )

    for order, (count, credits_, badge) in enumerate(FOUNDATION_MILESTONES):
        PathRewardMilestone.objects.get_or_create(
            learning_path=path,
            required_stamp_count=count,
            defaults={
                "reward_credits": credits_,
                "badge_name": badge,
                "order": order,
            },
        )

    return path


def seed_rewards() -> tuple[LearningPath | None, int]:
    """初期データを一式そろえる。教材の取り込みが終わったあとに呼ぶ。"""
    pricing_made = seed_ai_task_pricing()
    path = seed_foundation_path()
    return path, pricing_made
