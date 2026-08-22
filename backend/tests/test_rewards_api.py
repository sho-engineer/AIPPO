"""学習パス・スタンプ・Credit の API。

守りたいこと:
- 特典の判定はすべてサーバー側。画面から金額も節目も指定できない（§36）
- ゲストでもスタンプは見える。Credit は account が要ることを伝える
- 受け取りは1回きり。連打しても二重に増えない
- 学習パスは、レッスンを複製せずに束ねた形で返る
"""

from __future__ import annotations

import uuid

import pytest

from apps.catalog.models import AvailabilityStatus, Course, Lesson, PublishStatus
from apps.rewards.ledger import wallet_for
from apps.rewards.models import (
    LearningPath,
    LearningPathLesson,
    PathRewardMilestone,
    Recipe,
    RecipeLearningPath,
    StampDefinition,
    StampType,
    UserStamp,
)

pytestmark = pytest.mark.django_db

PATHS_URL = "/api/v1/rewards/paths/"
STAMPS_URL = "/api/v1/rewards/stamps/"
CREDITS_URL = "/api/v1/rewards/credits/"
CLAIM_URL = "/api/v1/rewards/claim/"
ME_URL = "/api/v1/accounts/me/"


@pytest.fixture
def path_with_two_lessons(db):
    course = Course.objects.create(
        slug="c1", title="コース", status=PublishStatus.PUBLISHED
    )
    lessons = [
        Lesson.objects.create(
            course=course,
            slug=f"lesson_{n}",
            number=n,
            title=f"レッスン{n}",
            goal="goal",
            status=PublishStatus.PUBLISHED,
            availability_status=AvailabilityStatus.AVAILABLE,
        )
        for n in (1, 2)
    ]
    path = LearningPath.objects.create(
        slug="p1", title="はじめの一歩", status=PublishStatus.PUBLISHED
    )
    for order, lesson in enumerate(lessons, start=1):
        LearningPathLesson.objects.create(
            learning_path=path, lesson=lesson, order=order
        )
        StampDefinition.objects.create(
            learning_path=path,
            stamp_type=StampType.LESSON,
            lesson=lesson,
            title=lesson.title,
            order=order,
        )
    PathRewardMilestone.objects.create(
        learning_path=path, required_stamp_count=1, reward_credits=2
    )
    return path, lessons


class TestLearningPaths:
    def test_a_path_returns_its_lessons_in_order(self, api_client, path_with_two_lessons):
        response = api_client.get(PATHS_URL)

        assert response.status_code == 200
        path = response.json()["paths"][0]
        assert path["id"] == "p1"
        assert [row["lesson_id"] for row in path["lessons"]] == ["lesson_1", "lesson_2"]

    def test_the_same_lesson_can_appear_in_two_paths(self, api_client, path_with_two_lessons):
        """レッスンを複製せずに束ねられていること。"""
        _, lessons = path_with_two_lessons
        other = LearningPath.objects.create(
            slug="p2", title="別のパス", status=PublishStatus.PUBLISHED
        )
        LearningPathLesson.objects.create(
            learning_path=other, lesson=lessons[0], order=1
        )

        body = api_client.get(PATHS_URL).json()["paths"]
        by_id = {row["id"]: row for row in body}

        assert "lesson_1" in [r["lesson_id"] for r in by_id["p1"]["lessons"]]
        assert "lesson_1" in [r["lesson_id"] for r in by_id["p2"]["lessons"]]
        assert Lesson.objects.filter(slug="lesson_1").count() == 1

    def test_a_draft_path_is_not_returned(self, api_client):
        LearningPath.objects.create(
            slug="hidden", title="下書き", status=PublishStatus.DRAFT
        )

        assert api_client.get(PATHS_URL).json()["paths"] == []

    def test_recipes_linked_to_the_path_come_along(self, api_client, path_with_two_lessons):
        path, _ = path_with_two_lessons
        recipe = Recipe.objects.create(
            slug="minutes", title="議事録を作る", status=PublishStatus.PUBLISHED
        )
        RecipeLearningPath.objects.create(recipe=recipe, learning_path=path)

        body = api_client.get(PATHS_URL).json()["paths"][0]

        assert [r["id"] for r in body["recipes"]] == ["minutes"]

    def test_the_next_milestone_is_reported(self, api_client, path_with_two_lessons):
        body = api_client.get(PATHS_URL).json()["paths"][0]

        assert body["stamp_done"] == 0
        assert body["stamp_total"] == 2
        assert body["next_milestone"]["required_stamp_count"] == 1


class TestStamps:
    def test_a_guest_can_see_their_stamps(self, api_client, path_with_two_lessons):
        path, _ = path_with_two_lessons
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)
        UserStamp.objects.create(
            learner_key=key, stamp_definition=path.stamp_definitions.first()
        )

        body = api_client.get(STAMPS_URL).json()

        assert body["signed_in"] is False
        assert body["paths"][0]["done"] == 1

    def test_a_guest_who_reached_a_milestone_is_told_something_is_waiting(
        self, api_client, path_with_two_lessons
    ):
        """達成は無かったことにしない。受け取りに account が要ると伝える。"""
        path, _ = path_with_two_lessons
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)
        UserStamp.objects.create(
            learner_key=key, stamp_definition=path.stamp_definitions.first()
        )

        body = api_client.get(STAMPS_URL).json()

        assert body["unclaimed_waiting"] is True


class TestCredits:
    def test_a_guest_gets_no_balance_but_is_told_why(self, api_client):
        body = api_client.get(CREDITS_URL).json()

        assert body["requires_account"] is True
        # 0 を返すと「使い切った」と読めるので、残高そのものを出さない
        assert body["balance"] is None

    def test_a_signed_in_learner_sees_their_balance_and_history(
        self, api_client, django_user_model
    ):
        user = django_user_model.objects.create_user(
            username="m@example.com", password="aippo-strong-pass-9"
        )
        api_client.force_login(user)
        from apps.rewards.ledger import grant_credit

        grant_credit(user, 3, reason="テスト")

        body = api_client.get(CREDITS_URL).json()

        assert body["requires_account"] is False
        assert body["balance"] == 3
        assert body["lifetime_earned"] == 3
        assert len(body["transactions"]) == 1


class TestClaiming:
    def _signed_in_with_a_reached_milestone(
        self, api_client, django_user_model, path_with_two_lessons
    ):
        path, _ = path_with_two_lessons
        user = django_user_model.objects.create_user(
            username="m@example.com", password="aippo-strong-pass-9"
        )
        api_client.force_login(user)
        api_client.get(ME_URL)  # いまの端末の鍵を本人へ結びつける
        key = uuid.UUID(api_client.cookies["learner_key"].value)
        UserStamp.objects.create(
            learner_key=key, stamp_definition=path.stamp_definitions.first()
        )
        return user

    def test_a_guest_cannot_claim(self, api_client, path_with_two_lessons):
        response = api_client.post(CLAIM_URL)

        assert response.status_code == 403
        assert response.json()["requires_account"] is True

    def test_claiming_grants_the_credits_the_server_decided(
        self, api_client, django_user_model, path_with_two_lessons
    ):
        user = self._signed_in_with_a_reached_milestone(
            api_client, django_user_model, path_with_two_lessons
        )

        body = api_client.post(CLAIM_URL).json()

        assert body["granted"] == 2
        assert wallet_for(user).balance == 2

    def test_claiming_twice_does_not_double_the_credits(
        self, api_client, django_user_model, path_with_two_lessons
    ):
        """連打しても二重に増えないこと。"""
        user = self._signed_in_with_a_reached_milestone(
            api_client, django_user_model, path_with_two_lessons
        )

        api_client.post(CLAIM_URL)
        second = api_client.post(CLAIM_URL).json()

        assert second["granted"] == 0
        assert wallet_for(user).balance == 2

    def test_the_client_cannot_ask_for_an_amount(
        self, api_client, django_user_model, path_with_two_lessons
    ):
        """画面から金額を指定できないこと（§36）。"""
        user = self._signed_in_with_a_reached_milestone(
            api_client, django_user_model, path_with_two_lessons
        )

        api_client.post(CLAIM_URL, {"amount": 9999, "reward_credits": 9999}, format="json")

        assert wallet_for(user).balance == 2
