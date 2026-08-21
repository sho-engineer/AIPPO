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
        call_command("seed_catalog", verbosity=0)
        path = LearningPath.objects.get(slug="first_step_7days")

        assert path.path_lessons.count() == 9
        assert path.stamp_definitions.count() == 9

    def test_milestones_are_created(self):
        call_command("seed_catalog", verbosity=0)
        path = LearningPath.objects.get(slug="first_step_7days")

        counts = sorted(
            path.milestones.values_list("required_stamp_count", flat=True)
        )
        assert counts == [3, 5, 9]

    def test_ai_task_pricing_is_created(self):
        call_command("seed_catalog", verbosity=0)

        assert AiTaskPricing.objects.filter(task_type="basic_text").exists()
        # 無料コースの基本のテキスト処理は 0。学習の途中で止まらせない
        assert AiTaskPricing.objects.get(task_type="basic_text").credit_cost == 0
        assert AiTaskPricing.objects.get(task_type="image_standard").credit_cost > 0

    def test_running_twice_does_not_duplicate_anything(self):
        call_command("seed_catalog", verbosity=0)
        call_command("seed_catalog", verbosity=0)

        assert LearningPath.objects.filter(slug="first_step_7days").count() == 1
        assert LearningPathLesson.objects.count() == 9
        assert StampDefinition.objects.count() == 9
        assert PathRewardMilestone.objects.count() == 3
        assert AiTaskPricing.objects.count() == 6


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
        from apps.rewards.models import Recipe
        from apps.rewards.seeding import seed_recipes

        # 教材をまったく入れずに、パスだけを作った状態
        from apps.catalog.models import Course
        from apps.rewards.models import LearningPath

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

        assert StampDefinition.objects.count() == 9

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
