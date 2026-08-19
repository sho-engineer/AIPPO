"""修了証。

見張るのは「出ないこと」がほとんど。

修了証は、終えた人にとっては唯一の持ち帰りになる。だからこそ
**終えていない人に出ない**ことがいちばん大事で、そこが緩むと
持っていること自体に意味がなくなる。

判定の材料はサーバーの記録だけ。端末に貯めた記録は本人が書き換えられるので、
そちらを根拠にすると誰でも紙を作れてしまう。
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from django.test import Client
from django.utils import timezone

from apps.catalog.models import (
    AvailabilityStatus,
    Course,
    Lesson,
    PublishStatus,
)
from apps.lessons.models import LearningSession

CERTIFICATE = "/api/lessons/certificate/"
PROGRESS = "/api/v1/progress/"

SIGNUP = "/api/v1/accounts/signup/"
SIGNIN = "/api/v1/accounts/signin/"

ACCOUNT = {
    "email": "learner@example.com",
    "password": "aippo-strong-pass-9",
    "accept_terms": True,
    "accept_privacy": True,
}


def _device(key: uuid.UUID | None = None) -> tuple[Client, uuid.UUID]:
    """端末を1台用意する。Cookie が別なら別の端末。"""
    client = Client()
    if key is None:
        client.get(PROGRESS)
        key = uuid.UUID(client.cookies["learner_key"].value)
    else:
        client.cookies["learner_key"] = str(key)
    return client, key


def _course(slug: str = "beginner", title: str = "7日でわかるAI活用入門") -> Course:
    return Course.objects.create(slug=slug, title=title, status=PublishStatus.PUBLISHED)


def _lesson(
    course: Course,
    slug: str,
    *,
    number: int = 1,
    outcomes: list[str] | None = None,
    learned_skills: list[str] | None = None,
    status: str = PublishStatus.PUBLISHED,
    availability: str = AvailabilityStatus.AVAILABLE,
) -> Lesson:
    return Lesson.objects.create(
        course=course,
        slug=slug,
        number=number,
        title=f"レッスン{number}",
        goal="ためしてみる",
        outcomes=outcomes or [],
        learned_skills=learned_skills or [],
        status=status,
        availability_status=availability,
    )


def _finish(key: uuid.UUID, lesson_slug: str, *, at=None) -> LearningSession:
    """1本終えた記録を作る。"""
    return LearningSession.objects.create(
        learner_key=key,
        lesson_id=lesson_slug,
        completed_at=at or timezone.now(),
    )


@pytest.mark.django_db
class TestNotEarned:
    """終えていない人には出さない。ここが本題。"""

    def test_a_half_finished_course_gives_nothing(self):
        """あと1本残っていたら出ない。"""
        client, key = _device()
        course = _course()
        _lesson(course, "rewrite_text", number=1)
        _lesson(course, "summarize", number=2)

        _finish(key, "rewrite_text")

        body = client.get(CERTIFICATE).json()

        assert body["certificates"] == []

    def test_starting_every_lesson_is_not_finishing_them(self):
        """開いただけでは終えたことにならない。

        completed_at の入っていないセッションを数えると、
        全部を1回ずつ開くだけで修了証が取れてしまう。
        """
        client, key = _device()
        course = _course()
        _lesson(course, "rewrite_text", number=1)
        _lesson(course, "summarize", number=2)

        LearningSession.objects.create(learner_key=key, lesson_id="rewrite_text")
        LearningSession.objects.create(learner_key=key, lesson_id="summarize")

        assert client.get(CERTIFICATE).json()["certificates"] == []

    def test_someone_elses_device_does_not_count(self):
        """他人が終えた分では出ない。"""
        course = _course()
        _lesson(course, "rewrite_text", number=1)

        _, other_key = _device()
        _finish(other_key, "rewrite_text")

        mine, _ = _device()

        assert mine.get(CERTIFICATE).json()["certificates"] == []

    def test_a_course_without_lessons_gives_nothing(self):
        """レッスンが1本も無いコースでは出ない。

        「すべて終えた」を素直に書くと、0本のコースは条件を満たしてしまう。
        書きかけのコースを作った瞬間に修了証が増えることになる。
        """
        client, _ = _device()
        _course()

        assert client.get(CERTIFICATE).json()["certificates"] == []

    def test_an_unpublished_course_gives_nothing(self):
        """公開していないコースの修了証は出さない。"""
        client, key = _device()
        course = Course.objects.create(
            slug="draft-course", title="下書き", status=PublishStatus.DRAFT
        )
        _lesson(course, "rewrite_text", number=1)
        _finish(key, "rewrite_text")

        assert client.get(CERTIFICATE).json()["certificates"] == []

    def test_finishing_another_course_does_not_leak(self):
        """別のコースを終えても、こちらの修了証にはならない。"""
        client, key = _device()
        done = _course(slug="done-course", title="終えたほう")
        _lesson(done, "rewrite_text", number=1)
        other = _course(slug="other-course", title="まだのほう")
        _lesson(other, "summarize", number=1)

        _finish(key, "rewrite_text")

        slugs = [
            entry["course_slug"] for entry in client.get(CERTIFICATE).json()["certificates"]
        ]

        assert slugs == ["done-course"]


@pytest.mark.django_db
class TestEarned:
    """終えた人に渡すもの。"""

    @pytest.fixture
    def finished(self):
        client, key = _device()
        course = _course()
        _lesson(course, "rewrite_text", number=1, outcomes=["相手を決めて頼める"])
        _lesson(course, "summarize", number=2, outcomes=["長い文をまとめられる"])

        _finish(key, "rewrite_text", at=timezone.now() - timedelta(days=3))
        _finish(key, "summarize", at=timezone.now() - timedelta(days=1))
        return client

    def test_a_finished_course_returns_one_certificate(self, finished):
        certificates = finished.get(CERTIFICATE).json()["certificates"]

        assert len(certificates) == 1
        assert certificates[0]["course_title"] == "7日でわかるAI活用入門"
        assert certificates[0]["lesson_count"] == 2

    def test_the_date_is_the_day_the_last_lesson_was_finished(self, finished):
        """修了日は、最後の1本を終えた日。"""
        expected = timezone.localtime(timezone.now() - timedelta(days=1)).date()

        certificate = finished.get(CERTIFICATE).json()["certificates"][0]

        assert certificate["completed_on"] == expected.isoformat()

    def test_skills_are_gathered_in_lesson_order(self, finished):
        """身についたことは、受けた順のまま並べる。

        並べ直すと、積み上がったという話の筋が消える。
        """
        certificate = finished.get(CERTIFICATE).json()["certificates"][0]

        assert certificate["skills"] == ["相手を決めて頼める", "長い文をまとめられる"]

    def test_learned_skills_fill_in_when_outcomes_are_empty(self):
        """`outcomes` が空の教材は `learned_skills` で埋める。

        どちらも空のまま出すと、修了証の中身が丸ごと消える。
        """
        client, key = _device()
        course = _course()
        _lesson(course, "rewrite_text", number=1, learned_skills=["条件を言葉にできる"])
        _finish(key, "rewrite_text")

        certificate = client.get(CERTIFICATE).json()["certificates"][0]

        assert certificate["skills"] == ["条件を言葉にできる"]

    def test_redoing_a_lesson_does_not_move_the_date(self):
        """やり直しても修了日は動かない。

        触るたびに日付が今日になると、修了証が「最後に開いた日」の
        記録になってしまう。
        """
        client, key = _device()
        course = _course()
        _lesson(course, "rewrite_text", number=1)
        finished_on = timezone.now() - timedelta(days=10)
        _finish(key, "rewrite_text", at=finished_on)

        before = client.get(CERTIFICATE).json()["certificates"][0]
        _finish(key, "rewrite_text")
        after = client.get(CERTIFICATE).json()["certificates"][0]

        assert before["completed_on"] == timezone.localtime(finished_on).date().isoformat()
        assert after["completed_on"] == before["completed_on"]
        assert after["serial"] == before["serial"]


@pytest.mark.django_db
class TestScope:
    """どの教材を数えるか。"""

    def test_coming_soon_lessons_are_not_required(self):
        """近日公開の教材は、終えていなくてもよい。

        求めてしまうと、教材を1本公開しただけで、
        すでに渡した修了証が無効になる。
        """
        client, key = _device()
        course = _course()
        _lesson(course, "rewrite_text", number=1)
        _lesson(
            course,
            "make_plan",
            number=2,
            availability=AvailabilityStatus.COMING_SOON,
        )

        _finish(key, "rewrite_text")

        certificates = client.get(CERTIFICATE).json()["certificates"]

        assert len(certificates) == 1
        assert certificates[0]["lesson_count"] == 1

    def test_unpublished_lessons_are_not_required(self):
        """一覧に出ていない教材も数えない。始めようがないため。"""
        client, key = _device()
        course = _course()
        _lesson(course, "rewrite_text", number=1)
        _lesson(course, "secret", number=2, status=PublishStatus.DRAFT)

        _finish(key, "rewrite_text")

        assert len(client.get(CERTIFICATE).json()["certificates"]) == 1


@pytest.mark.django_db
class TestAcrossDevices:
    """ログインしていれば、端末をまたいで数える。"""

    def test_lessons_finished_on_two_devices_add_up(self):
        """スマホで1本、パソコンで1本。合わせて修了。

        ここが端末ごとの判定だと、登録した人ほど修了証が出ない。
        """
        course = _course()
        _lesson(course, "rewrite_text", number=1)
        _lesson(course, "summarize", number=2)

        phone, phone_key = _device()
        _finish(phone_key, "rewrite_text")
        phone.post(SIGNUP, ACCOUNT, content_type="application/json")

        laptop, laptop_key = _device()
        laptop.post(
            SIGNIN,
            {"email": ACCOUNT["email"], "password": ACCOUNT["password"]},
            content_type="application/json",
        )
        _finish(laptop_key, "summarize")

        assert len(laptop.get(CERTIFICATE).json()["certificates"]) == 1

    def test_signing_out_hides_the_other_devices(self):
        """ログアウトしたら、この端末の分だけに戻る。

        共用の端末で、次に使う人に前の人の修了証が見えては困る。
        """
        course = _course()
        _lesson(course, "rewrite_text", number=1)

        phone, phone_key = _device()
        _finish(phone_key, "rewrite_text")
        phone.post(SIGNUP, ACCOUNT, content_type="application/json")

        laptop, _ = _device()
        laptop.post(
            SIGNIN,
            {"email": ACCOUNT["email"], "password": ACCOUNT["password"]},
            content_type="application/json",
        )
        assert laptop.get(CERTIFICATE).json()["certificates"]

        laptop.post("/api/v1/accounts/signout/", {}, content_type="application/json")

        assert laptop.get(CERTIFICATE).json()["certificates"] == []


@pytest.mark.django_db
class TestSerial:
    """通し番号。"""

    def _earn(self, course_slug: str, lesson_slug: str) -> str:
        client, key = _device()
        course = _course(slug=course_slug)
        _lesson(course, lesson_slug, number=1)
        _finish(key, lesson_slug)
        return client.get(CERTIFICATE).json()["certificates"][0]["serial"]

    def test_it_is_not_a_guessable_counter(self):
        """連番にしない。

        「AIPPO-0007」と書いてあれば 0006 も 0008 もあると分かるし、
        他人の番号を言い当てられる。
        """
        first = self._earn("course-a", "rewrite_text")
        second = self._earn("course-b", "summarize")

        assert first != second
        for serial in (first, second):
            assert serial.startswith("AIPPO-")
            assert not serial.split("-", 1)[1].replace("-", "").isdigit()

    def test_the_same_certificate_keeps_its_number(self):
        """同じ修了証は、何度見ても同じ番号。"""
        client, key = _device()
        course = _course()
        _lesson(course, "rewrite_text", number=1)
        _finish(key, "rewrite_text")

        first = client.get(CERTIFICATE).json()["certificates"][0]["serial"]
        second = client.get(CERTIFICATE).json()["certificates"][0]["serial"]

        assert first == second
