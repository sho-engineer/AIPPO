"""修了証を、終えていない人に出さないこと（独立した確かめ）。

修了証の実装とテストは別の担当が書いた。報告を信じずに、
**渡してはいけない場面**だけを自分で組み直して確かめる。

修了証は「全部終えた」という主張そのもの。1本でも残っている人に
出れば、それは嘘になる。ここが崩れると、残り全部が意味を失う。

見るのは4つ。

  1. 1本残っていたら出ない
  2. 途中まで（completed_at が無い）は「終えた」に数えない
  3. 他人の記録で条件が満たされない
  4. 教材が1本も無いコースで、空の修了証が出ない
     （空の条件は「全部満たした」になる。実際に踏みやすい罠）
"""

from __future__ import annotations

import uuid

import pytest
from django.utils import timezone

from apps.accounts.models import LearnerIdentity
from apps.catalog.models import AvailabilityStatus, Course, Lesson, PublishStatus
from apps.lessons.models import LearningSession

CERTIFICATE_URL = "/api/lessons/certificate/"
ME_URL = "/api/v1/accounts/me/"


def _course(slug: str = "c", *, lessons: int = 2) -> Course:
    course = Course.objects.create(slug=slug, title="コース", status=PublishStatus.PUBLISHED)
    for number in range(1, lessons + 1):
        Lesson.objects.create(
            course=course,
            slug=f"{slug}_lesson_{number}",
            number=number,
            title=f"レッスン{number}",
            status=PublishStatus.PUBLISHED,
            availability_status=AvailabilityStatus.AVAILABLE,
        )
    return course


def _learner_key(client) -> uuid.UUID:
    client.get(ME_URL)
    return uuid.UUID(client.cookies["learner_key"].value)


def _finish(key: uuid.UUID, lesson_id: str, *, done: bool = True) -> None:
    LearningSession.objects.create(
        learner_key=key,
        lesson_id=lesson_id,
        completed_at=timezone.now() if done else None,
    )


def _certificates(client) -> list[dict]:
    return client.get(CERTIFICATE_URL).json()["certificates"]


@pytest.mark.django_db
class TestItIsNotHandedOutEarly:
    def test_one_lesson_left_means_no_certificate(self, client):
        """1本でも残っていたら出ない。"""
        _course(lessons=2)
        key = _learner_key(client)
        _finish(key, "c_lesson_1")

        assert _certificates(client) == []

    def test_finishing_everything_hands_it_out(self, client):
        """逆に、全部終えたら出ること（上のテストが常に空で通らないように）。"""
        _course(lessons=2)
        key = _learner_key(client)
        _finish(key, "c_lesson_1")
        _finish(key, "c_lesson_2")

        certificates = _certificates(client)

        assert len(certificates) == 1
        assert certificates[0]["course_slug"] == "c"
        assert certificates[0]["lesson_count"] == 2

    def test_in_progress_does_not_count_as_done(self, client):
        """開いただけ（completed_at が無い）を「終えた」に数えない。

        数えると、全部開くだけで修了証が出る。
        """
        _course(lessons=2)
        key = _learner_key(client)
        _finish(key, "c_lesson_1")
        _finish(key, "c_lesson_2", done=False)

        assert _certificates(client) == []

    def test_someone_elses_progress_does_not_count(self, client):
        """他人が終えた分で、自分の条件が埋まらないこと。"""
        _course(lessons=2)
        key = _learner_key(client)
        _finish(key, "c_lesson_1")
        _finish(uuid.uuid4(), "c_lesson_2")

        assert _certificates(client) == []

    def test_an_empty_course_gives_nothing(self, client):
        """教材が1本も無いコースで、空の修了証が出ないこと。

        「必要な教材をすべて終えたか」を素直に書くと、必要な教材が
        0本のとき真になる。踏みやすい罠なので、ここだけは必ず見る。
        """
        Course.objects.create(slug="empty", title="から", status=PublishStatus.PUBLISHED)
        _learner_key(client)

        assert _certificates(client) == []

    def test_a_guest_with_no_history_gets_nothing(self, client):
        _course(lessons=1)
        _learner_key(client)

        assert _certificates(client) == []


@pytest.mark.django_db
class TestAcrossDevices:
    def test_two_devices_together_can_finish_a_course(self, client, django_user_model):
        """端末をまたいで終えた分が合算されること。

        合算しないと、途中で機種を変えた人はいつまでも修了できない。
        """
        _course(lessons=2)
        user = django_user_model.objects.create_user(
            username="a@example.com", email="a@example.com", password="aippo-strong-pass-9"
        )
        old_device = uuid.uuid4()
        LearnerIdentity.objects.create(user=user, learner_key=old_device)
        _finish(old_device, "c_lesson_1")

        client.force_login(user)
        key = _learner_key(client)
        LearnerIdentity.objects.create(user=user, learner_key=key)
        _finish(key, "c_lesson_2")

        assert len(_certificates(client)) == 1

    def test_a_signed_out_guest_does_not_inherit(self, client, django_user_model):
        """ログインしていない人が、他人の端末の分を受け取らないこと。"""
        _course(lessons=2)
        user = django_user_model.objects.create_user(
            username="a@example.com", email="a@example.com", password="aippo-strong-pass-9"
        )
        other = uuid.uuid4()
        LearnerIdentity.objects.create(user=user, learner_key=other)
        _finish(other, "c_lesson_1")
        _finish(other, "c_lesson_2")

        _learner_key(client)

        assert _certificates(client) == []


@pytest.mark.django_db
class TestTheSerial:
    def test_it_is_not_a_guessable_counter(self, client):
        """通し番号が 1, 2, 3 のような連番でないこと。

        連番だと、他人の番号を打ち込めるようになる。
        """
        _course(lessons=1)
        key = _learner_key(client)
        _finish(key, "c_lesson_1")

        serial = _certificates(client)[0]["serial"]

        assert serial not in {"1", "0001", "AIPPO-0001"}
        assert len(serial) >= 12

    def test_it_does_not_change_when_you_redo_a_lesson(self, client):
        """やり直しても番号が変わらないこと。

        変わると、前に見せた番号が通じなくなる。
        """
        _course(lessons=1)
        key = _learner_key(client)
        _finish(key, "c_lesson_1")
        before = _certificates(client)[0]["serial"]

        _finish(key, "c_lesson_1")

        assert _certificates(client)[0]["serial"] == before

    def test_two_people_get_different_serials(self, client, django_user_model):
        _course(lessons=1)
        key = _learner_key(client)
        _finish(key, "c_lesson_1")
        mine = _certificates(client)[0]["serial"]

        from django.test import Client

        other = Client()
        other_key = _learner_key(other)
        _finish(other_key, "c_lesson_1")

        assert _certificates(other)[0]["serial"] != mine
