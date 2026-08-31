import pytest
from django.core.management import call_command

from apps.catalog.expand import course_to_dict, lesson_to_dict
from apps.catalog.models import AvailabilityStatus, Course, Lesson, PublishStatus
from apps.rewards.models import LearningPath


@pytest.fixture
def released(db):
    call_command("seed_catalog", verbosity=0)


@pytest.mark.django_db
class TestFirstReleaseCatalog:
    def test_only_the_two_main_courses_are_public(self, released):
        assert list(
            Course.objects.filter(status=PublishStatus.PUBLISHED)
            .order_by("sort_order")
            .values_list("slug", flat=True)
        ) == ["first_step_7days", "ai_practical"]

    def test_start_course_is_the_check_plus_eight_days(self, released):
        """現在地チェック1本と、Day1〜Day8。

        診断は Day ではない。始める前に自分の位置を見るもので、
        受けなくても Day1 から始められる。Day として数に入れると、
        受けなかった人の進み具合が最初から欠ける。
        """
        course = Course.objects.get(slug="first_step_7days")
        assert course.title == "AIスタートコース"
        assert list(
            course.lessons.order_by("sort_order").values_list("number", "title")
        ) == [
            (0, "AI活用診断"),
            (1, "文章を分かりやすくする"),
            (2, "長い文章を短くまとめる"),
            (3, "分からないことを説明してもらう"),
            (4, "アイデアを広げる"),
            (5, "選択肢を比較する"),
            (6, "情報を整理して見やすくする"),
            (7, "AIで画像を作る"),
            (8, "画像を修正する"),
        ]

    def test_the_start_course_is_grouped_into_three_steps(self, released):
        """8本を平らに並べない。3つの STEP に束ねる。"""
        payload = course_to_dict(Course.objects.get(slug="first_step_7days"))
        assert [(stage["key"], stage["title"]) for stage in payload["stages"]] == [
            ("orientation", "現在地チェック"),
            ("ask", "AIに頼んでみる"),
            ("think", "AIと考える"),
            ("create", "AIで作る"),
        ]
        assert [len(stage["lessonIds"]) for stage in payload["stages"]] == [1, 3, 3, 2]

    def test_the_course_says_what_it_leads_to_in_one_line(self, released):
        # レッスンごとの成果を全部並べると、始める前の人には長すぎる
        outcome = Course.objects.get(slug="first_step_7days").outcome
        assert outcome
        assert len(outcome) <= 60

    def test_dropped_lessons_move_instead_of_disappearing(self, released):
        """外した2本は消さない。**終えた記録が行き先を失う。**

        本文もそのまま生きていること（実務側で続けて学べる）。
        """
        for slug in ("improve_answer", "make_plan"):
            lesson = Lesson.objects.get(slug=slug)
            assert lesson.course.slug == "ai_practical"
            assert lesson.status == PublishStatus.PUBLISHED
            assert lesson.availability_status == AvailabilityStatus.AVAILABLE
            assert lesson_to_dict(lesson)["steps"]

    def test_the_image_lessons_are_listed_but_not_open(self, released):
        """画像の2本は一覧に出すが、まだ開けない。

        費用の見通しを先に立てるため（docs/image-lessons.md）。
        出さずにおくと、コースが文章で終わるように読める。
        """
        for slug in ("image_generation", "image_edit"):
            lesson = Lesson.objects.get(slug=slug)
            assert lesson.course.slug == "first_step_7days"
            assert lesson.status == PublishStatus.PUBLISHED
            assert lesson.availability_status == AvailabilityStatus.COMING_SOON
            assert lesson.coming_soon_message

    def test_practical_course_marks_unfinished_lessons_coming_soon(self, released):
        course = Course.objects.get(slug="ai_practical")
        payload = course_to_dict(course)
        assert {
            row["id"] for row in payload["lessons"] if row["availability"] == "coming_soon"
        } == {"combine_ai_skills", "practical_recipe"}

    def test_available_practical_lessons_have_real_steps(self, released):
        lessons = Lesson.objects.filter(
            course__slug="ai_practical",
            status=PublishStatus.PUBLISHED,
            availability_status=AvailabilityStatus.AVAILABLE,
        )
        # 実務向けの6本＋スタートコースから移した2本
        assert lessons.count() == 8
        assert all(lesson_to_dict(lesson)["steps"] for lesson in lessons)
        assert all(lesson.ai_action for lesson in lessons)

    def test_thumbnail_reference_is_served_from_the_catalog(self, released):
        lesson = Lesson.objects.get(slug="brainstorm_ideas")
        assert lesson.thumbnail == "/assets/final-thumbnails/start_04.webp"
        assert course_to_dict(lesson.course)["lessons"][4]["thumbnail"]

    def test_both_courses_have_reusable_learning_paths(self, released):
        assert set(LearningPath.objects.values_list("slug", flat=True)) >= {
            "first_step_7days",
            "ai_practical",
        }


@pytest.mark.django_db
class TestStageGrouping:
    """STEP の束の読み取り。

    束を別の表として持たず、`Lesson.stage_key` が**続くひとかたまり**を
    1つの束として読む（apps/catalog/expand.py の `_stages`）。
    順序がレッスンの並び1つで決まるので、束とレッスンで順が
    食い違うことが起こりえない。
    """

    def _course(self, rows: list[tuple[str, str]]):
        course = Course.objects.create(slug="c", title="c")
        for number, (slug, stage) in enumerate(rows, start=1):
            Lesson.objects.create(
                course=course,
                slug=slug,
                number=number,
                sort_order=number,
                title=slug,
                goal="g",
                stage_key=stage,
                stage_title=stage.upper(),
                status=PublishStatus.PUBLISHED,
                availability_status=AvailabilityStatus.AVAILABLE,
            )
        return course

    def test_lessons_in_a_row_become_one_step(self, db):
        course = self._course([("a", "ask"), ("b", "ask"), ("c", "think")])

        stages = course_to_dict(course)["stages"]

        assert [stage["key"] for stage in stages] == ["ask", "think"]
        assert stages[0]["lessonIds"] == ["a", "b"]

    def test_a_lesson_without_a_stage_joins_nothing(self, db):
        course = self._course([("a", "ask"), ("b", ""), ("c", "think")])

        stages = course_to_dict(course)["stages"]

        assert [stage["lessonIds"] for stage in stages] == [["a"], ["c"]]

    def test_the_same_name_twice_apart_stays_two_steps(self, db):
        """離れて出てきた同じ名前を、黙って1つにまとめない。

        まとめると、あいだのレッスンを飛び越える束ができ、画面には
        「連続していないのに1つ」という読めない形で出る。
        """
        course = self._course([("a", "ask"), ("b", "think"), ("c", "ask")])

        stages = course_to_dict(course)["stages"]

        assert [stage["key"] for stage in stages] == ["ask", "think", "ask"]
        assert [stage["lessonIds"] for stage in stages] == [["a"], ["b"], ["c"]]
