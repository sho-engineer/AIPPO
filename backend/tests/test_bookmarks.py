"""あとで見返したい教材の目印。

教材は1本10分で、探している途中に別のものが目に入る作りになっている。
だが「気になったが、いまは時間が無い」を残す場所が無く、見つけた教材は
次に開いたときには忘れられていた。

ここで守るのは5つ。

  1. 他人の目印が1件も見えないこと
  2. 二重に付かないこと（押し直しただけで一覧が増えない）
  3. 別の端末で付けたものが、見えて、外せること
  4. 始められない教材には付かないこと（押した先が開けないと、
     目印そのものが信用されなくなる）
  5. 進捗と混ざらないこと（目印を付けただけで「始めた」にしない）
"""

from __future__ import annotations

import uuid

import pytest

from apps.accounts.models import LearnerIdentity
from apps.catalog.models import AvailabilityStatus, Course, Lesson, PublishStatus
from apps.lessons.models import Bookmark, LearningSession
from apps.lessons.views_bookmarks import MAX_BOOKMARKS

BOOKMARKS_URL = "/api/lessons/bookmarks/"
ME_URL = "/api/v1/accounts/me/"
PROGRESS_URL = "/api/v1/progress/"


@pytest.fixture
def lessons(db) -> list[str]:
    """始められる教材を2本。付けられる先が無いと何も確かめられない。"""
    course = Course.objects.create(slug="c", title="コース", status=PublishStatus.PUBLISHED)
    slugs = ["rewrite_text", "summarize_text"]
    for number, slug in enumerate(slugs, start=1):
        Lesson.objects.create(
            course=course,
            slug=slug,
            number=number,
            title=slug,
            status=PublishStatus.PUBLISHED,
            availability_status=AvailabilityStatus.AVAILABLE,
        )
    return slugs


def _learner_key(client) -> uuid.UUID:
    client.get(ME_URL)
    return uuid.UUID(client.cookies["learner_key"].value)


def _add(client, lesson_id: str):
    return client.post(BOOKMARKS_URL, {"lesson_id": lesson_id}, content_type="application/json")


def _remove(client, lesson_id: str):
    return client.delete(BOOKMARKS_URL, {"lesson_id": lesson_id}, content_type="application/json")


def _items(client) -> list[dict]:
    return client.get(BOOKMARKS_URL).json()["items"]


@pytest.mark.django_db
class TestAddingAndRemoving:
    def test_a_bookmark_shows_up(self, client, lessons):
        _learner_key(client)
        _add(client, "rewrite_text")

        items = _items(client)

        assert [item["lesson_id"] for item in items] == ["rewrite_text"]

    def test_pressing_twice_does_not_add_twice(self, client, lessons):
        """押し直しただけで一覧が増えない。

        付け外しは「ある／ない」の2状態しか無い。数えはじめると、
        外すのに何回押せばよいかが人にも機械にも分からなくなる。
        """
        _learner_key(client)
        _add(client, "rewrite_text")
        response = _add(client, "rewrite_text")

        assert response.status_code == 200
        assert len(_items(client)) == 1

    def test_removing_takes_it_off(self, client, lessons):
        _learner_key(client)
        _add(client, "rewrite_text")
        _remove(client, "rewrite_text")

        assert _items(client) == []

    def test_removing_something_not_there_is_fine(self, client, lessons):
        """押した結果は同じ（付いていない）。失敗にする理由が無い。"""
        _learner_key(client)

        response = _remove(client, "rewrite_text")

        assert response.status_code == 200
        assert _items(client) == []

    def test_newest_first(self, client, lessons):
        """最後に気になったものを上に置くほうが探しやすい。"""
        _learner_key(client)
        _add(client, "rewrite_text")
        _add(client, "summarize_text")

        assert [item["lesson_id"] for item in _items(client)] == [
            "summarize_text",
            "rewrite_text",
        ]


@pytest.mark.django_db
class TestWhatCannotBeBookmarked:
    def test_an_unknown_lesson_is_refused(self, client, lessons):
        """押した先が開けないと、目印そのものが信用されなくなる。"""
        _learner_key(client)

        response = _add(client, "no_such_lesson")

        assert response.status_code == 404
        assert _items(client) == []

    def test_an_unavailable_lesson_is_refused(self, client, lessons):
        """近日公開のものには付けられない。始められないため。"""
        course = Course.objects.get(slug="c")
        Lesson.objects.create(
            course=course,
            slug="coming_soon",
            number=9,
            title="近日公開",
            status=PublishStatus.PUBLISHED,
            availability_status=AvailabilityStatus.COMING_SOON,
        )
        _learner_key(client)

        assert _add(client, "coming_soon").status_code == 404

    def test_a_missing_lesson_id_is_refused(self, client, lessons):
        _learner_key(client)

        assert _add(client, "  ").status_code == 400

    def test_there_is_an_upper_limit(self, client, lessons):
        """機械で叩かれたときに、一覧が無限に伸びないこと。"""
        key = _learner_key(client)
        Bookmark.objects.bulk_create(
            Bookmark(learner_key=key, lesson_id=f"filler_{n}") for n in range(MAX_BOOKMARKS)
        )

        response = _add(client, "rewrite_text")

        assert response.status_code == 409


@pytest.mark.django_db
class TestOtherPeople:
    def test_someone_elses_bookmarks_are_invisible(self, client, lessons):
        """他人のものは1件も出ない。"""
        Bookmark.objects.create(learner_key=uuid.uuid4(), lesson_id="rewrite_text")
        _learner_key(client)

        assert _items(client) == []

    def test_cannot_remove_someone_elses(self, client, lessons):
        stranger = uuid.uuid4()
        Bookmark.objects.create(learner_key=stranger, lesson_id="rewrite_text")
        _learner_key(client)

        _remove(client, "rewrite_text")

        assert Bookmark.objects.filter(learner_key=stranger).count() == 1


@pytest.mark.django_db
class TestAcrossDevices:
    def test_a_bookmark_from_another_device_is_visible(self, client, django_user_model, lessons):
        """ログインしている人には、その人の鍵ぜんぶで引く。

        でないと、別の端末で付けた目印が消えたように見える。
        """
        user = django_user_model.objects.create_user(
            username="a@example.com", email="a@example.com", password="aippo-strong-pass-9"
        )
        other_device = uuid.uuid4()
        LearnerIdentity.objects.create(user=user, learner_key=other_device)
        Bookmark.objects.create(learner_key=other_device, lesson_id="rewrite_text")

        client.force_login(user)
        _learner_key(client)

        assert [item["lesson_id"] for item in _items(client)] == ["rewrite_text"]

    def test_can_remove_one_made_on_another_device(self, client, django_user_model, lessons):
        """外せないと、その目印は二度と消せなくなる。"""
        user = django_user_model.objects.create_user(
            username="a@example.com", email="a@example.com", password="aippo-strong-pass-9"
        )
        other_device = uuid.uuid4()
        LearnerIdentity.objects.create(user=user, learner_key=other_device)
        Bookmark.objects.create(learner_key=other_device, lesson_id="rewrite_text")

        client.force_login(user)
        _learner_key(client)
        _remove(client, "rewrite_text")

        assert _items(client) == []

    def test_the_same_lesson_on_two_devices_shows_once(self, client, django_user_model, lessons):
        """同じ教材が一覧に2回並ばないこと。"""
        user = django_user_model.objects.create_user(
            username="a@example.com", email="a@example.com", password="aippo-strong-pass-9"
        )
        client.force_login(user)
        key = _learner_key(client)

        other_device = uuid.uuid4()
        LearnerIdentity.objects.create(user=user, learner_key=other_device)
        LearnerIdentity.objects.create(user=user, learner_key=key)
        Bookmark.objects.create(learner_key=other_device, lesson_id="rewrite_text")
        _add(client, "rewrite_text")

        assert [item["lesson_id"] for item in _items(client)] == ["rewrite_text"]


@pytest.mark.django_db
class TestItDoesNotTouchProgress:
    def test_bookmarking_does_not_start_the_lesson(self, client, lessons):
        """目印を付けただけで「始めた」ことにしない。

        混ぜると、見た数だけ進んだように見えて、
        進捗の数字が信用できなくなる。
        """
        _learner_key(client)
        _add(client, "rewrite_text")

        assert LearningSession.objects.count() == 0

        progress = client.get(PROGRESS_URL).json()
        assert progress["completed_count"] == 0
        assert progress["in_progress_count"] == 0

    def test_a_finished_bookmark_says_so(self, client, lessons):
        """終えたものに「あとで」と出したままにしない。"""
        key = _learner_key(client)
        _add(client, "rewrite_text")
        LearningSession.objects.create(
            learner_key=key, lesson_id="rewrite_text", completed_at="2026-08-01T00:00:00+00:00"
        )

        assert _items(client)[0]["completed"] is True
