"""管理画面から教材を編集・公開できること。

教材追加そのものが運営の中心になるので、コードを触らずに足せる状態を
守る。ここが壊れると、教材を1本足すたびに開発者を呼ぶことになる。

いちばん大事なのは**公開前チェック**。
書きかけの教材が学習者に届いて途中で進めなくなると、
当たった人は自分の操作を疑い、そのまま閉じて戻ってこない。
公開ボタンを押した人がその場で気づけるほうが、はるかに安い。
"""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.urls import reverse

from apps.catalog.models import (
    AvailabilityStatus,
    Course,
    Lesson,
    LessonStep,
    LessonTemplate,
    PublishStatus,
    StepPlacement,
)
from apps.catalog.validation import validate_for_release


@pytest.fixture
def seeded(db):
    call_command("seed_catalog")


@pytest.fixture
def admin_client_logged_in(db, client):
    """管理画面を触れる人。"""
    user = get_user_model().objects.create_superuser(
        username="admin", email="admin@example.com", password="pw-for-test-only"
    )
    client.force_login(user)
    return client


@pytest.mark.django_db
class TestReleaseCheck:
    """available へ変える前の検査。"""

    def test_a_complete_lesson_passes(self, seeded):
        lesson = Lesson.objects.get(slug="rewrite_text")

        assert validate_for_release(lesson) == []

    def test_missing_title_is_caught(self, seeded):
        lesson = Lesson.objects.get(slug="rewrite_text")
        lesson.title = "  "
        lesson.save()

        assert any("タイトル" in problem for problem in validate_for_release(lesson))

    def test_missing_outcome_is_caught(self, seeded):
        lesson = Lesson.objects.get(slug="rewrite_text")
        lesson.outcome_title = ""
        lesson.goal = ""
        lesson.save()

        assert any("成果物" in problem for problem in validate_for_release(lesson))

    def test_lesson_without_steps_is_caught(self, db):
        course = Course.objects.create(slug="c", title="コース")
        lesson = Lesson.objects.create(
            course=course,
            slug="empty",
            number=1,
            title="からっぽ",
            goal="ねらい",
            template=LessonTemplate.CUSTOM,
        )

        assert any("ステップ" in problem for problem in validate_for_release(lesson))

    def test_missing_completion_step_is_caught(self, db):
        course = Course.objects.create(slug="c", title="コース")
        lesson = Lesson.objects.create(
            course=course,
            slug="no_end",
            number=1,
            title="終わりがない",
            goal="ねらい",
            template=LessonTemplate.CUSTOM,
        )
        LessonStep.objects.create(
            lesson=lesson, step_key="intro", step_type="intro", sort_order=0
        )

        problems = validate_for_release(lesson)

        assert any("completion" in problem for problem in problems)

    def test_wrong_opening_step_is_caught(self, db):
        course = Course.objects.create(slug="c", title="コース")
        lesson = Lesson.objects.create(
            course=course,
            slug="bad_start",
            number=1,
            title="始まりが変",
            goal="ねらい",
            template=LessonTemplate.CUSTOM,
        )
        LessonStep.objects.create(
            lesson=lesson, step_key="a", step_type="text_input", sort_order=0
        )
        LessonStep.objects.create(
            lesson=lesson, step_key="z", step_type="completion", sort_order=1
        )

        assert any("最初のステップ" in p for p in validate_for_release(lesson))

    def test_duplicate_sort_order_is_caught(self, db):
        course = Course.objects.create(slug="c", title="コース")
        lesson = Lesson.objects.create(
            course=course,
            slug="dup",
            number=1,
            title="順番が重複",
            goal="ねらい",
            template=LessonTemplate.CUSTOM,
        )
        LessonStep.objects.create(
            lesson=lesson, step_key="a", step_type="intro", sort_order=0
        )
        LessonStep.objects.create(
            lesson=lesson, step_key="b", step_type="completion", sort_order=0
        )

        assert any("並び順" in p for p in validate_for_release(lesson))

    def test_flow_lesson_without_a_sample_is_caught(self, seeded):
        """例文が無いと、学習者は空欄から始めることになる。"""
        lesson = Lesson.objects.get(slug="rewrite_text")
        lesson.sample_text = ""
        lesson.save()

        assert any("例文" in problem for problem in validate_for_release(lesson))

    def test_flow_lesson_without_an_ai_action_is_caught(self, seeded):
        lesson = Lesson.objects.get(slug="rewrite_text")
        lesson.ai_action = {}
        lesson.save()

        problems = validate_for_release(lesson)

        assert any("頼み方" in problem for problem in problems)


@pytest.mark.django_db
class TestAdminScreens:
    """管理画面が開くこと。開かなければ何も編集できない。"""

    def test_lesson_list_opens(self, admin_client_logged_in, seeded):
        response = admin_client_logged_in.get(reverse("admin:catalog_lesson_changelist"))

        assert response.status_code == 200

    def test_lesson_edit_opens_with_its_steps(self, admin_client_logged_in, seeded):
        lesson = Lesson.objects.get(slug="final_challenge")

        response = admin_client_logged_in.get(
            reverse("admin:catalog_lesson_change", args=[lesson.pk])
        )

        assert response.status_code == 200
        # 前置きのステップが編集画面に出ていること
        assert b"trouble" in response.content

    def test_course_list_opens(self, admin_client_logged_in, seeded):
        response = admin_client_logged_in.get(reverse("admin:catalog_course_changelist"))

        assert response.status_code == 200


@pytest.mark.django_db
class TestPublishingGuard:
    """不備のある教材を available にできないこと。"""

    def test_incomplete_lesson_is_pushed_back_to_coming_soon(
        self, admin_client_logged_in, seeded
    ):
        lesson = Lesson.objects.get(slug="summarize_text")
        lesson.sample_text = ""  # 例文を消して不備を作る
        lesson.save()

        from django.contrib.admin.sites import site

        from apps.catalog.admin import LessonAdmin

        admin = LessonAdmin(Lesson, site)
        request = admin_client_logged_in.request().wsgi_request
        request._messages = _NullMessages()

        lesson.availability_status = AvailabilityStatus.AVAILABLE
        admin.save_model(request, lesson, form=None, change=True)

        lesson.refresh_from_db()
        assert lesson.availability_status == AvailabilityStatus.COMING_SOON

    def test_complete_lesson_can_go_live(self, admin_client_logged_in, seeded):
        from django.contrib.admin.sites import site

        from apps.catalog.admin import LessonAdmin

        lesson = Lesson.objects.get(slug="summarize_text")
        admin = LessonAdmin(Lesson, site)
        request = admin_client_logged_in.request().wsgi_request
        request._messages = _NullMessages()

        lesson.availability_status = AvailabilityStatus.AVAILABLE
        admin.save_model(request, lesson, form=None, change=True)

        lesson.refresh_from_db()
        assert lesson.availability_status == AvailabilityStatus.AVAILABLE


@pytest.mark.django_db
class TestDuplicate:
    """既存の教材を写して、中身だけ変えて新しい教材にする。"""

    def test_copy_is_created_as_a_draft(self, admin_client_logged_in, seeded):
        from django.contrib.admin.sites import site

        from apps.catalog.admin import LessonAdmin

        admin = LessonAdmin(Lesson, site)
        request = admin_client_logged_in.request().wsgi_request
        request._messages = _NullMessages()

        admin.duplicate_lessons(request, Lesson.objects.filter(slug="rewrite_text"))

        copy = Lesson.objects.get(slug="rewrite_text_copy")
        # 写した瞬間に公開されないこと。書きかけが学習者へ届く
        assert copy.status == PublishStatus.DRAFT
        assert copy.availability_status == AvailabilityStatus.COMING_SOON
        assert copy.published_at is None

    def test_copy_keeps_the_content(self, admin_client_logged_in, seeded):
        from django.contrib.admin.sites import site

        from apps.catalog.admin import LessonAdmin

        admin = LessonAdmin(Lesson, site)
        request = admin_client_logged_in.request().wsgi_request
        request._messages = _NullMessages()

        original = Lesson.objects.get(slug="final_challenge")
        admin.duplicate_lessons(request, Lesson.objects.filter(pk=original.pk))

        copy = Lesson.objects.get(slug="final_challenge_copy")
        assert copy.sample_text == original.sample_text
        assert copy.steps.count() == original.steps.count()

    def test_copying_twice_does_not_collide(self, admin_client_logged_in, seeded):
        from django.contrib.admin.sites import site

        from apps.catalog.admin import LessonAdmin

        admin = LessonAdmin(Lesson, site)
        request = admin_client_logged_in.request().wsgi_request
        request._messages = _NullMessages()

        admin.duplicate_lessons(request, Lesson.objects.filter(slug="rewrite_text"))
        admin.duplicate_lessons(request, Lesson.objects.filter(slug="rewrite_text"))

        assert Lesson.objects.filter(slug="rewrite_text_copy").exists()
        assert Lesson.objects.filter(slug="rewrite_text_copy2").exists()


@pytest.mark.django_db
class TestAdminEditsReachTheScreen:
    """管理画面での変更が、配る API に出ること。

    ここがつながっていないと、管理画面は「触れるだけ」の飾りになる。
    """

    def test_changing_a_title_shows_up_in_the_api(self, api_client, seeded):
        lesson = Lesson.objects.get(slug="rewrite_text")
        lesson.title = "管理画面から直した見出し"
        lesson.save()

        lessons = {
            entry["id"]: entry
            for entry in api_client.get("/api/v1/catalog/").data["courses"][0]["lessons"]
        }

        assert lessons["rewrite_text"]["title"] == "管理画面から直した見出し"

    def test_overriding_a_generated_step_shows_up(self, seeded):
        """骨格が作ったステップを、行で上書きできること。"""
        from apps.catalog.expand import lesson_to_dict

        lesson = Lesson.objects.get(slug="rewrite_text")
        LessonStep.objects.create(
            lesson=lesson,
            placement=StepPlacement.OVERRIDE,
            step_key="quick_try",
            title="管理画面から差し替えた問い",
            sort_order=99,
        )

        steps = {step["id"]: step for step in lesson_to_dict(lesson)["steps"]}

        assert steps["quick_try"]["title"] == "管理画面から差し替えた問い"
        # 上書きしていない項目は、骨格のまま残ること
        assert steps["quick_try"]["poEmotion"] == "question"


class _NullMessages:
    """テスト用。管理画面の通知を捨てる。"""

    def add(self, *args, **kwargs) -> None:  # noqa: D102
        pass
