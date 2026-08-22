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

    def test_start_course_has_the_decided_nine_lessons(self, released):
        course = Course.objects.get(slug="first_step_7days")
        assert course.title == "AIスタートコース"
        assert list(course.lessons.order_by("sort_order").values_list("title", flat=True)) == [
            "AI活用診断",
            "AIへの頼み方",
            "文章をわかりやすくする",
            "長い文章を短くまとめる",
            "わからないことを説明してもらう",
            "アイデアを広げる",
            "選択肢を比較する",
            "情報を整理する",
            "計画を立てる",
        ]

    def test_practical_course_marks_unfinished_lessons_coming_soon(self, released):
        course = Course.objects.get(slug="ai_practical")
        payload = course_to_dict(course)
        assert len(payload["lessons"]) == 9
        assert {
            row["id"] for row in payload["lessons"] if row["availability"] == "coming_soon"
        } == {"combine_ai_skills", "practical_recipe", "image_generation"}

    def test_available_practical_lessons_have_real_steps(self, released):
        lessons = Lesson.objects.filter(
            course__slug="ai_practical",
            status=PublishStatus.PUBLISHED,
            availability_status=AvailabilityStatus.AVAILABLE,
        )
        assert lessons.count() == 6
        assert all(lesson_to_dict(lesson)["steps"] for lesson in lessons)
        assert all(lesson.ai_action for lesson in lessons)

    def test_thumbnail_reference_is_served_from_the_catalog(self, released):
        lesson = Lesson.objects.get(slug="brainstorm_ideas")
        assert lesson.thumbnail == "/assets/final-thumbnails/start_04.webp"
        assert course_to_dict(lesson.course)["lessons"][5]["thumbnail"]

    def test_both_courses_have_reusable_learning_paths(self, released):
        assert set(LearningPath.objects.values_list("slug", flat=True)) >= {
            "first_step_7days",
            "ai_practical",
        }
