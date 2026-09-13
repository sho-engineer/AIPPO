"""初期データが、新しい環境でも実際に入ること。

ここが守る事故
--------------
新しい環境は `migrate → seed_catalog` の順に立ち上がる。
学習パスの作成をマイグレーションの中だけに置いていたとき、
migrate の時点ではコースがまだ無いので何も作られず、そのあと
seed_catalog がコースを入れても**学習パスは空のまま**だった。

エラーは出ない。ただスタンプ定義が1件も無いので、レッスンを
終えてもスタンプが永久に埋まらない。画面は動いているように見える
ぶん、いちばん気づきにくい壊れ方になる。
"""

from __future__ import annotations

import pytest
from django.core.management import call_command

from apps.catalog.models import AvailabilityStatus, Lesson, PublishStatus
from apps.rewards.models import (
    AiTaskPricing,
    LearningPath,
    LearningPathLesson,
    PathRewardMilestone,
    StampDefinition,
)

pytestmark = pytest.mark.django_db


class TestSeedCatalogAlsoSeedsRewards:
    """`seed_catalog` だけで、スタンプが埋まる状態まで揃うこと。"""

    def test_learning_path_exists_after_seeding_the_catalog(self):
        call_command("seed_catalog", verbosity=0)

        path = LearningPath.objects.filter(slug="first_step_7days").first()
        assert path is not None, (
            "seed_catalog のあとに学習パスが無い。"
            "新しい環境ではスタンプが永久に埋まらない状態になる"
        )

    def test_every_lesson_of_the_path_gets_a_stamp_definition(self):
        """開けている教材ぶんのスタンプがあること。

        まだ開けない教材（画像の2本）は入らない。入れると、全部
        終えてもスタンプが埋まらない台紙になる。
        """
        from apps.catalog.models import Lesson

        call_command("seed_catalog", verbosity=0)
        path = LearningPath.objects.get(slug="first_step_7days")

        opened = Lesson.objects.filter(
            course__slug="first_step_7days",
            status="published",
            availability_status="available",
        ).count()
        assert path.path_lessons.count() == opened
        assert path.stamp_definitions.count() == opened

    def test_milestones_are_created(self):
        call_command("seed_catalog", verbosity=0)
        path = LearningPath.objects.get(slug="first_step_7days")

        counts = sorted(
            path.milestones.values_list("required_stamp_count", flat=True)
        )
        # 最後の数は、いま開けている本数と同じ。届かない節目を置かない
        assert counts == [3, 5, 7]

    def test_ai_task_pricing_is_created(self):
        call_command("seed_catalog", verbosity=0)

        assert AiTaskPricing.objects.filter(task_type="basic_text").exists()
        # 無料コースの基本のテキスト処理は 0。学習の途中で止まらせない
        assert AiTaskPricing.objects.get(task_type="basic_text").credit_cost == 0
        assert AiTaskPricing.objects.get(task_type="image_standard").credit_cost > 0

    def test_running_twice_does_not_duplicate_anything(self):
        """2回流しても、増えないこと。

        本数を決め打ちにしない
        ----------------------
        前はここに 17 / 15 と書いてあった。スタンプと学習パスは
        リリース範囲から作られる（`apps/rewards/seeding.py`——始められ
        ない教材にスタンプ枠を置くと、埋めようのない台紙になる）ので、
        **教材を1本公開するたびにここが落ちる**。落ちるだけで、
        「二重に入っていないか」というこの試験の目的は何も見ていない。

        しかも2つのコースで方針が違う。スタートコースの学習パスは
        開けている分だけを入れ、AI活用コースは準備中の分も入れて
        「必須ではない」印を付ける。決め打ちの数は、その違いも
        いっしょに固めてしまう。

        1回目の数を控えて、2回目と突き合わせる。名前のとおりのことを、
        範囲が変わっても見られる形にする。
        """
        call_command("seed_catalog", verbosity=0)

        def counts() -> dict[str, int]:
            return {
                "path": LearningPath.objects.filter(slug="first_step_7days").count(),
                "path_lessons": LearningPathLesson.objects.count(),
                "stamps": StampDefinition.objects.count(),
                "milestones": PathRewardMilestone.objects.count(),
                "pricing": AiTaskPricing.objects.count(),
            }

        first = counts()
        call_command("seed_catalog", verbosity=0)

        assert counts() == first
        # 空回りしていないこと。0件どうしを比べても通ってしまう
        assert first["path"] == 1
        assert first["stamps"] > 0
        assert first["milestones"] == 5
        assert first["pricing"] == 6

    def test_stamps_are_only_for_lessons_you_can_start(self):
        """スタンプは、**始められる教材にだけ**付く。

        始められない教材の枠を台紙に置くと、埋めようのない穴が残る。
        第1リリースでは Day2 以降が準備中なので、ここが効いている。
        """
        call_command("seed_catalog", verbosity=0)

        stamped = set(
            StampDefinition.objects.values_list("lesson__slug", flat=True)
        )
        closed = set(
            Lesson.objects.exclude(
                availability_status=AvailabilityStatus.AVAILABLE
            ).values_list("slug", flat=True)
        )

        assert stamped, "スタンプが1つも入っていない"
        assert stamped & closed == set(), f"始められない教材にスタンプ: {stamped & closed}"


class TestRecipes:
    def test_recipes_are_seeded_and_linked_to_the_path(self):
        from apps.rewards.models import LearningPath, Recipe

        call_command("seed_catalog", verbosity=0)
        path = LearningPath.objects.get(slug="first_step_7days")

        assert Recipe.objects.count() > 0
        # 出す先が無いレシピを作らない
        assert path.recipe_links.count() == Recipe.objects.count()

    def test_every_recipe_knows_which_lessons_it_needs(self):
        from apps.rewards.models import Recipe

        call_command("seed_catalog", verbosity=0)

        for recipe in Recipe.objects.all():
            assert recipe.required_lessons.count() > 0, (
                f"{recipe.slug} が必要なレッスンを持っていない"
            )

    def test_a_recipe_is_not_created_when_a_lesson_it_needs_is_missing(self):
        """押した先に無いレッスンを案内しない（憲章 原則 I）。"""
        # 教材をまったく入れずに、パスだけを作った状態
        from apps.catalog.models import Course
        from apps.rewards.models import LearningPath, Recipe
        from apps.rewards.seeding import seed_recipes

        Course.objects.create(slug="first_step_7days", title="c")
        path = LearningPath.objects.create(slug="p", title="p")

        seed_recipes(path)

        assert Recipe.objects.count() == 0

    def test_running_twice_does_not_duplicate_recipes(self):
        from apps.rewards.models import Recipe, RecipeRequiredLesson

        call_command("seed_catalog", verbosity=0)
        first = (Recipe.objects.count(), RecipeRequiredLesson.objects.count())
        call_command("seed_catalog", verbosity=0)

        assert (Recipe.objects.count(), RecipeRequiredLesson.objects.count()) == first


class TestSeedRewardsCommand:
    def test_it_can_run_on_its_own_after_the_catalog_exists(self):
        call_command("seed_catalog", verbosity=0)
        StampDefinition.objects.all().delete()

        call_command("seed_rewards", verbosity=0)

        # 開けている教材の数だけ入る（`test_running_twice…` と同じ理由）
        assert StampDefinition.objects.count() == Lesson.objects.filter(
            status=PublishStatus.PUBLISHED,
            availability_status=AvailabilityStatus.AVAILABLE,
        ).count()

    def test_it_does_not_crash_when_there_is_no_catalog_yet(self):
        """コースがまだ無い環境で呼ばれても、落ちずに知らせるだけ。"""
        call_command("seed_rewards", verbosity=0)

        assert LearningPath.objects.count() == 0
        # 単価はコースと関係なく成り立つので、こちらは入る
        assert AiTaskPricing.objects.count() == 6


class TestMigrationAndSeedingAgree:
    """マイグレーション側の写しと、いま使うほうの値が食い違わないこと。

    同じ初期値を2か所に持っている（マイグレーションは過去の形のまま
    凍らせておきたいので、そちらは自前の写しを持つ）。片方だけ直すと、
    環境によって節目の数や単価が変わる。
    """

    def test_the_two_copies_of_the_constants_are_identical(self):
        import importlib

        migration = importlib.import_module(
            "apps.rewards.migrations.0002_seed_foundation_path"
        )
        from apps.rewards import seeding

        assert migration.FOUNDATION_MILESTONES == seeding.FOUNDATION_MILESTONES
        assert migration.AI_TASK_PRICING == seeding.AI_TASK_PRICING
