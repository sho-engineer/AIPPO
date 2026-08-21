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

from apps.catalog.models import (
    AccessType,
    AvailabilityStatus,
    Course,
    Lesson,
    PublishStatus,
)
from apps.rewards.models import (
    AiTaskPricing,
    LearningPath,
    LearningPathLesson,
    PathRewardMilestone,
    Recipe,
    RecipeLearningPath,
    RecipeRequiredLesson,
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

#: 「こんな使い方もできます」（レシピ）の初期データ。
#:
#: id は **画面側の `appliedTips.ts` と一致させる**。画面はここの id で
#: 説明を引くので、食い違うと「押しても開けない案内」になる
#: （tests/test_rewards_seeding.py が一致を見張る）。
#:
#: 無料コースのレシピはすべて無料にする（憲章）。
#: (slug, title, description, category, [必要なレッスンの slug])
RECIPES: tuple[tuple[str, str, str, str, tuple[str, ...]], ...] = (
    (
        "meeting_notes_share",
        "長い会議メモを、上司へそのまま送れる文章にする",
        "決まったことだけを取り出してから、読む相手に合わせて整える。",
        "会議",
        ("summarize_text", "rewrite_text"),
    ),
    (
        "meeting_summary_only",
        "長い会議メモから、要点だけを取り出す",
        "決まったことと次にやることだけを、短く残す。",
        "会議",
        ("summarize_text",),
    ),
    (
        "compare_new_tool",
        "新しい道具を、導入するか決める",
        "分からない仕組みを説明してもらってから、候補どうしを比べる。",
        "比較検討",
        ("explain_topic", "compare_options"),
    ),
    (
        "plan_and_share",
        "進め方を決めて、そのまま共有する",
        "手順を作ってから、送れる長さにまとめる。",
        "計画",
        ("make_plan", "summarize_text"),
    ),
    (
        "improve_then_address",
        "AIの下書きを、相手向けに仕上げる",
        "一度で終わらせずに条件を足してから、伝え方まで整える。",
        "文章作成",
        ("improve_answer", "rewrite_text"),
    ),
    (
        "clear_writing_for_email",
        "そのまま送れるメールにする",
        "誰に、どんな言い方で送るかを決めてから書き直す。",
        "文章作成",
        ("rewrite_text",),
    ),
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


def seed_recipes(path: LearningPath | None) -> int:
    """レシピを入れ、そのパスへ結びつける。

    必要なレッスンが1本でも欠けているレシピは入れない。押した先に
    無いレッスンを案内することになるため（憲章 原則 I）。教材が
    増えたら、次に流したときに入る。
    """
    if path is None:
        return 0

    made = 0
    for order, (slug, title, description, category, lesson_slugs) in enumerate(RECIPES):
        lessons = list(Lesson.objects.filter(slug__in=lesson_slugs))
        if len(lessons) != len(lesson_slugs):
            continue  # まだ揃っていない。無いレッスンへは案内しない

        recipe, created = Recipe.objects.get_or_create(
            slug=slug,
            defaults={
                "title": title,
                "description": description,
                "category": category,
                "access_type": AccessType.FREE,
                "status": PublishStatus.PUBLISHED,
                "availability_status": AvailabilityStatus.AVAILABLE,
                "sort_order": order,
            },
        )
        made += int(created)

        by_slug = {lesson.slug: lesson for lesson in lessons}
        for index, lesson_slug in enumerate(lesson_slugs):
            RecipeRequiredLesson.objects.get_or_create(
                recipe=recipe,
                lesson=by_slug[lesson_slug],
                defaults={"order": index, "required": True},
            )

        RecipeLearningPath.objects.get_or_create(recipe=recipe, learning_path=path)

    return made


def seed_rewards() -> tuple[LearningPath | None, int]:
    """初期データを一式そろえる。教材の取り込みが終わったあとに呼ぶ。"""
    pricing_made = seed_ai_task_pricing()
    path = seed_foundation_path()
    seed_recipes(path)
    return path, pricing_made
