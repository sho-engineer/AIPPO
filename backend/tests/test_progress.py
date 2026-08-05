"""端末をまたいだ進み具合。

第一リリースの合否そのもの。「登録して、別の端末で続きから」が
成り立たなければ、登録する意味がない。

ここで見張るのは2つ。

- 読むときは「その人の鍵ぜんぶ」で引くこと
- 書くときはいまの端末の鍵で書くこと（代表の鍵へ寄せない）
"""

from __future__ import annotations

import uuid

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from apps.accounts.migration import claim_guest_data
from apps.lessons.models import LearningSession, SkillProgress

User = get_user_model()

PROGRESS = "/api/v1/progress/"
ME = "/api/v1/accounts/me/"

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


@pytest.mark.django_db
class TestGuestProgress:
    def test_a_guest_sees_only_their_own_device(self):
        mine, my_key = _device()
        _, other_key = _device()

        LearningSession.objects.create(learner_key=my_key, lesson_id="rewrite_text")
        LearningSession.objects.create(learner_key=other_key, lesson_id="summarize")

        body = mine.get(PROGRESS).json()

        assert [row["lesson_id"] for row in body["lessons"]] == ["rewrite_text"]
        assert body["signed_in"] is False

    def test_finished_lessons_are_counted(self):
        from django.utils import timezone

        client, key = _device()
        LearningSession.objects.create(
            learner_key=key, lesson_id="rewrite_text", completed_at=timezone.now()
        )
        LearningSession.objects.create(learner_key=key, lesson_id="summarize")

        body = client.get(PROGRESS).json()

        assert body["completed_count"] == 1
        assert body["in_progress_count"] == 1

    def test_redoing_a_lesson_does_not_erase_the_record(self):
        """やり直しても「終わった」は消さない。

        消すと、もう一度触っただけで実績が減る。
        減る表示は、続ける気をいちばん削ぐ。
        """
        from django.utils import timezone

        client, key = _device()
        LearningSession.objects.create(
            learner_key=key, lesson_id="rewrite_text", completed_at=timezone.now()
        )
        LearningSession.objects.create(learner_key=key, lesson_id="rewrite_text")

        body = client.get(PROGRESS).json()

        assert body["completed_count"] == 1
        assert len(body["lessons"]) == 1


@pytest.mark.django_db
class TestAcrossDevices:
    def _register(self, client) -> User:
        client.post(SIGNUP, ACCOUNT, content_type="application/json")
        return User.objects.get(email=ACCOUNT["email"])

    def test_a_second_device_sees_the_first_devices_progress(self):
        """スマホで進めて、パソコンでログインしたら続きが見える。"""
        phone, phone_key = _device()
        LearningSession.objects.create(learner_key=phone_key, lesson_id="rewrite_text")
        self._register(phone)

        laptop, _ = _device()
        laptop.post(
            SIGNIN,
            {"email": ACCOUNT["email"], "password": ACCOUNT["password"]},
            content_type="application/json",
        )

        body = laptop.get(PROGRESS).json()

        assert [row["lesson_id"] for row in body["lessons"]] == ["rewrite_text"]
        assert body["signed_in"] is True

    def test_the_second_device_writes_with_its_own_key(self):
        """書き込み先を代表の鍵へ寄せない。

        寄せると、結びつけに失敗した端末の記録が迷子になる。
        """
        phone, phone_key = _device()
        user = self._register(phone)

        laptop, laptop_key = _device()
        laptop.post(
            SIGNIN,
            {"email": ACCOUNT["email"], "password": ACCOUNT["password"]},
            content_type="application/json",
        )
        laptop.get("/api/lessons/rewrite_text/session/")

        # ログインで、この端末の鍵も同じ人のものになっている
        assert laptop_key in [
            key for key in _keys_of(user)
        ]
        assert phone_key != laptop_key

    def test_signing_out_hides_the_other_devices(self):
        """ログアウトしたら、この端末の分だけに戻る。

        共用の端末で、次の人に前の人の記録が見えては困る。
        """
        phone, phone_key = _device()
        LearningSession.objects.create(learner_key=phone_key, lesson_id="rewrite_text")
        self._register(phone)

        laptop, _ = _device()
        laptop.post(
            SIGNIN,
            {"email": ACCOUNT["email"], "password": ACCOUNT["password"]},
            content_type="application/json",
        )
        assert laptop.get(PROGRESS).json()["lessons"]

        laptop.post("/api/v1/accounts/signout/", {}, content_type="application/json")

        assert laptop.get(PROGRESS).json()["lessons"] == []

    def test_skills_are_gathered_from_every_device(self):
        phone, phone_key = _device()
        user = self._register(phone)

        laptop, laptop_key = _device()
        claim_guest_data(user, laptop_key)

        SkillProgress.objects.create(
            learner_key=phone_key, lesson_id="rewrite_text", skill_key="state_audience"
        )
        SkillProgress.objects.create(
            learner_key=laptop_key, lesson_id="summarize", skill_key="state_length"
        )

        body = phone.get(PROGRESS).json()

        assert body["skills"] == ["state_audience", "state_length"]


def _keys_of(user):
    from apps.accounts.models import learner_keys_for

    return learner_keys_for(user)


@pytest.mark.django_db
class TestResumingALesson:
    def test_the_lesson_resumes_on_another_device(self):
        """別端末で開いても、最初のステップからやり直しにならない。"""
        phone, phone_key = _device()
        LearningSession.objects.create(
            learner_key=phone_key, lesson_id="rewrite_text", current_step="OBSERVE"
        )
        phone.post(SIGNUP, ACCOUNT, content_type="application/json")

        laptop, _ = _device()
        laptop.post(
            SIGNIN,
            {"email": ACCOUNT["email"], "password": ACCOUNT["password"]},
            content_type="application/json",
        )

        body = laptop.get("/api/lessons/rewrite_text/session/").json()

        assert body["session"] is not None
        assert body["session"]["current_step"] == "OBSERVE"

    def test_a_guest_on_another_device_starts_fresh(self):
        """ログインしていなければ、他人の続きは出ない。"""
        _, other_key = _device()
        LearningSession.objects.create(
            learner_key=other_key, lesson_id="rewrite_text", current_step="OBSERVE"
        )

        mine, _ = _device()

        assert mine.get("/api/lessons/rewrite_text/session/").json()["session"] is None
