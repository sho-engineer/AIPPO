"""Learning Path / Recipe / Stamp / Credit の土台（apps.rewards）。

守りたいこと:
- 同じ Lesson を複数の Learning Path から参照しても、Lesson は複製されない
- スタンプは (learner_key, stamp_definition) で1回きり（二重に埋まらない）
- 節目のCreditは1回しか渡らない（連打・同時実行でも）
- Credit の残高は ledger 経由でしか動かない。残高不足では消費できない
- 同じ source_type/source_id からの動きは2回目以降は無視される（冪等性）
"""

from __future__ import annotations

import uuid

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.urls import reverse

from apps.catalog.models import AvailabilityStatus, Course, Lesson, PublishStatus
from apps.rewards.ledger import InsufficientCredit, consume_credit, grant_credit, wallet_for
from apps.rewards.models import (
    CreditTransaction,
    LearningPath,
    LearningPathLesson,
    PathRewardMilestone,
    Recipe,
    RecipeLearningPath,
    RecipeRequiredLesson,
    StampDefinition,
    StampType,
    UserRewardClaim,
    UserStamp,
)
from apps.rewards.stamps import award_lesson_stamp, claim_due_milestones, stamps_done

pytestmark = pytest.mark.django_db

User = get_user_model()


def _course(slug="c1") -> Course:
    return Course.objects.create(slug=slug, title=slug, description="")


def _lesson(course: Course, slug="l1", number=1) -> Lesson:
    return Lesson.objects.create(
        course=course, slug=slug, number=number, title=slug, goal="goal"
    )


class TestLessonReuseAcrossPaths:
    def test_same_lesson_can_belong_to_two_learning_paths_without_duplication(self):
        course = _course()
        lesson = _lesson(course)

        path_a = LearningPath.objects.create(slug="path_a", title="Path A")
        path_b = LearningPath.objects.create(slug="path_b", title="Path B")

        LearningPathLesson.objects.create(learning_path=path_a, lesson=lesson, order=1)
        LearningPathLesson.objects.create(learning_path=path_b, lesson=lesson, order=1)

        assert Lesson.objects.filter(slug=lesson.slug).count() == 1
        assert path_a.path_lessons.get().lesson_id == lesson.id
        assert path_b.path_lessons.get().lesson_id == lesson.id

    def test_a_lesson_cannot_be_added_twice_to_the_same_path(self):
        course = _course()
        lesson = _lesson(course)
        path = LearningPath.objects.create(slug="path_a", title="Path A")

        LearningPathLesson.objects.create(learning_path=path, lesson=lesson, order=1)
        with pytest.raises(IntegrityError):
            LearningPathLesson.objects.create(learning_path=path, lesson=lesson, order=2)

    def test_recipe_required_lessons_reference_existing_lessons_too(self):
        """Recipeの必要Skillも、Lessonを複製せず参照するだけ。"""
        course = _course()
        lesson = _lesson(course)
        recipe = Recipe.objects.create(slug="r1", title="議事録を作る")

        RecipeRequiredLesson.objects.create(recipe=recipe, lesson=lesson, order=1)

        assert recipe.required_lessons.get().lesson_id == lesson.id
        assert Lesson.objects.filter(slug=lesson.slug).count() == 1

    def test_same_recipe_can_be_linked_to_multiple_paths(self):
        recipe = Recipe.objects.create(slug="r1", title="議事録を作る")
        path_a = LearningPath.objects.create(slug="path_a", title="Path A")
        path_b = LearningPath.objects.create(slug="path_b", title="Path B")

        RecipeLearningPath.objects.create(recipe=recipe, learning_path=path_a)
        RecipeLearningPath.objects.create(recipe=recipe, learning_path=path_b)

        assert recipe.path_links.count() == 2
        assert Recipe.objects.filter(slug="r1").count() == 1


class TestStamps:
    def test_earning_the_same_stamp_twice_does_not_duplicate(self):
        course = _course()
        lesson = _lesson(course)
        path = LearningPath.objects.create(slug="p", title="P")
        LearningPathLesson.objects.create(learning_path=path, lesson=lesson, order=1)
        definition = StampDefinition.objects.create(
            learning_path=path, stamp_type=StampType.LESSON, lesson=lesson, title=lesson.title
        )
        key = uuid.uuid4()

        first = award_lesson_stamp(key, lesson.slug)
        second = award_lesson_stamp(key, lesson.slug)

        assert len(first) == 1
        assert len(second) == 0  # 2回目は何も新しく埋まらない
        assert UserStamp.objects.filter(learner_key=key, stamp_definition=definition).count() == 1

    def test_completing_a_lesson_shared_by_two_paths_fills_both_stamps(self):
        """複数Pathで使い回しているLessonを終えたら、両方のスタンプが埋まる。"""
        course = _course()
        lesson = _lesson(course)
        path_a = LearningPath.objects.create(slug="a", title="A")
        path_b = LearningPath.objects.create(slug="b", title="B")
        LearningPathLesson.objects.create(learning_path=path_a, lesson=lesson, order=1)
        LearningPathLesson.objects.create(learning_path=path_b, lesson=lesson, order=1)
        StampDefinition.objects.create(
            learning_path=path_a, stamp_type=StampType.LESSON, lesson=lesson, title="x"
        )
        StampDefinition.objects.create(
            learning_path=path_b, stamp_type=StampType.LESSON, lesson=lesson, title="x"
        )
        key = uuid.uuid4()

        awarded = award_lesson_stamp(key, lesson.slug)

        assert len(awarded) == 2
        assert stamps_done([key], path_a) == 1
        assert stamps_done([key], path_b) == 1

    def test_different_devices_of_the_same_person_are_counted_together(self):
        course = _course()
        lesson = _lesson(course)
        path = LearningPath.objects.create(slug="p", title="P")
        LearningPathLesson.objects.create(learning_path=path, lesson=lesson, order=1)
        StampDefinition.objects.create(
            learning_path=path, stamp_type=StampType.LESSON, lesson=lesson, title="x"
        )
        device_1, device_2 = uuid.uuid4(), uuid.uuid4()
        award_lesson_stamp(device_1, lesson.slug)

        # 別端末の鍵では、その端末単独では0だが、readable_keysに両方渡せば数えられる
        assert stamps_done([device_2], path) == 0
        assert stamps_done([device_1, device_2], path) == 1


class TestMilestoneClaims:
    def _path_with_milestone(self, required=3, credits_=1):
        path = LearningPath.objects.create(slug="p", title="P")
        milestone = PathRewardMilestone.objects.create(
            learning_path=path, required_stamp_count=required, reward_credits=credits_
        )
        return path, milestone

    def _stamp(self, path, key):
        course = _course(slug=f"c-{uuid.uuid4().hex[:8]}")
        lesson = _lesson(course, slug=f"l-{uuid.uuid4().hex[:8]}")
        definition = StampDefinition.objects.create(
            learning_path=path, stamp_type=StampType.LESSON, lesson=lesson, title="x"
        )
        UserStamp.objects.create(learner_key=key, stamp_definition=definition)

    def test_milestone_not_reached_yet_grants_nothing(self):
        user = User.objects.create_user(username="u1")
        path, _ = self._path_with_milestone(required=3, credits_=1)
        key = uuid.uuid4()
        self._stamp(path, key)  # 1個だけ。3個には届いていない

        claimed = claim_due_milestones(user, [key], path)

        assert claimed == []
        assert wallet_for(user).balance == 0

    def test_reaching_the_milestone_grants_credit_exactly_once(self):
        user = User.objects.create_user(username="u2")
        path, milestone = self._path_with_milestone(required=1, credits_=2)
        key = uuid.uuid4()
        self._stamp(path, key)

        first = claim_due_milestones(user, [key], path)
        second = claim_due_milestones(user, [key], path)  # やり直しても二重に渡らない

        assert len(first) == 1
        assert second == []  # 既に受け取り済み
        assert wallet_for(user).balance == 2
        assert UserRewardClaim.objects.filter(user=user, milestone=milestone).count() == 1
        assert CreditTransaction.objects.filter(user=user).count() == 1

    def test_guest_stamps_still_count_once_account_exists(self):
        """ゲストの間に埋めたスタンプも、account があれば節目の判定に使える。"""
        user = User.objects.create_user(username="u3")
        path, _ = self._path_with_milestone(required=1, credits_=1)
        key = uuid.uuid4()
        self._stamp(path, key)  # account に紐付けなくても、readable_keysに渡せば見える

        claimed = claim_due_milestones(user, [key], path)

        assert len(claimed) == 1


class TestCreditLedger:
    def test_grant_increases_balance_and_records_a_transaction(self):
        user = User.objects.create_user(username="u1")

        tx = grant_credit(user, 3, reason="test")

        assert wallet_for(user).balance == 3
        assert wallet_for(user).lifetime_earned == 3
        assert tx.balance_after == 3

    def test_consume_decreases_balance(self):
        user = User.objects.create_user(username="u1")
        grant_credit(user, 5, reason="seed")

        tx = consume_credit(user, 2, reason="use")

        assert wallet_for(user).balance == 3
        assert wallet_for(user).lifetime_spent == 2
        assert tx.amount == -2

    def test_cannot_consume_more_than_the_balance(self):
        user = User.objects.create_user(username="u1")
        grant_credit(user, 1, reason="seed")

        with pytest.raises(InsufficientCredit):
            consume_credit(user, 2, reason="use")

        # 失敗した消費で残高は動いていない
        assert wallet_for(user).balance == 1

    def test_balance_is_never_written_outside_a_transaction_row(self):
        """balanceだけを直接更新しない、という設計を裏から確かめる。

        すべての残高変化には、対応する CreditTransaction が必ずある。
        """
        user = User.objects.create_user(username="u1")
        grant_credit(user, 4, reason="a")
        consume_credit(user, 1, reason="b")

        total_from_ledger = sum(
            CreditTransaction.objects.filter(user=user).values_list("amount", flat=True)
        )
        assert total_from_ledger == wallet_for(user).balance

    def test_granting_twice_with_the_same_source_only_applies_once(self):
        """AI送信の二重実行・節目ボタンの連打を想定した冪等性。"""
        user = User.objects.create_user(username="u1")

        first = grant_credit(
            user, 2, reason="milestone", source_type="path_reward_milestone", source_id="m1"
        )
        second = grant_credit(
            user, 2, reason="milestone", source_type="path_reward_milestone", source_id="m1"
        )

        assert first is not None
        assert second is None
        assert wallet_for(user).balance == 2

    def test_consuming_twice_with_the_same_source_only_applies_once(self):
        """AI送信の二重実行で、Creditが2回減らないこと。"""
        user = User.objects.create_user(username="u1")
        grant_credit(user, 5, reason="seed")

        first = consume_credit(user, 1, source_type="ai_usage", source_id="attempt-1")
        second = consume_credit(user, 1, source_type="ai_usage", source_id="attempt-1")

        assert first is not None
        assert second is None
        assert wallet_for(user).balance == 4

    def test_different_sources_are_independent(self):
        user = User.objects.create_user(username="u1")
        grant_credit(user, 2, source_type="a", source_id="1")
        grant_credit(user, 3, source_type="a", source_id="2")

        assert wallet_for(user).balance == 5


class TestLessonCompletionIntegration:
    """`POST /api/learning-events/` の lesson_completed で、実際に何が起きるか。"""

    EVENTS_URL = reverse("learning-events")
    ME_URL = "/api/v1/accounts/me/"

    def _lesson_with_stamp_and_milestone(self, required=1, credits_=2):
        course = Course.objects.create(
            slug="c1", title="c1", status=PublishStatus.PUBLISHED
        )
        lesson = Lesson.objects.create(
            course=course,
            slug="lesson_a",
            number=1,
            title="lesson_a",
            goal="goal",
            status=PublishStatus.PUBLISHED,
            availability_status=AvailabilityStatus.AVAILABLE,
        )
        path = LearningPath.objects.create(slug="p", title="P")
        LearningPathLesson.objects.create(learning_path=path, lesson=lesson, order=1)
        StampDefinition.objects.create(
            learning_path=path, stamp_type=StampType.LESSON, lesson=lesson, title="x"
        )
        PathRewardMilestone.objects.create(
            learning_path=path, required_stamp_count=required, reward_credits=credits_
        )
        return lesson

    def test_guest_completing_a_lesson_earns_a_stamp_but_no_credit(self, api_client):
        lesson = self._lesson_with_stamp_and_milestone()
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)

        response = api_client.post(
            self.EVENTS_URL,
            {"lesson_id": lesson.slug, "event_type": "lesson_completed", "completed": True},
        )

        # 終えた回は、何が増えたかを返す（204 ではない）
        assert response.status_code == 200
        assert UserStamp.objects.filter(learner_key=key).count() == 1
        # ゲストのままではCreditは渡らない（account が要る）
        assert CreditTransaction.objects.count() == 0

    def test_signed_in_learner_completing_a_lesson_earns_stamp_and_credit(
        self, api_client, django_user_model
    ):
        lesson = self._lesson_with_stamp_and_milestone(required=1, credits_=2)
        user = django_user_model.objects.create_user(
            username="member@example.com", password="aippo-strong-pass-9"
        )
        api_client.force_login(user)
        # ログイン直後の1回で、いまの端末の learner_key が本人へ結びつく
        api_client.get(self.ME_URL)

        response = api_client.post(
            self.EVENTS_URL,
            {"lesson_id": lesson.slug, "event_type": "lesson_completed", "completed": True},
        )

        # 終えた回は、何が増えたかを返す（204 ではない）
        assert response.status_code == 200
        assert UserStamp.objects.count() == 1
        assert CreditTransaction.objects.filter(user=user).count() == 1
        assert wallet_for(user).balance == 2

    def test_completing_the_same_lesson_twice_does_not_grant_credit_twice(
        self, api_client, django_user_model
    ):
        lesson = self._lesson_with_stamp_and_milestone(required=1, credits_=2)
        user = django_user_model.objects.create_user(
            username="member@example.com", password="aippo-strong-pass-9"
        )
        api_client.force_login(user)
        api_client.get(self.ME_URL)

        payload = {
            "lesson_id": lesson.slug,
            "event_type": "lesson_completed",
            "completed": True,
        }
        api_client.post(self.EVENTS_URL, payload)
        api_client.post(self.EVENTS_URL, payload)  # やり直し・二重送信を想定

        assert wallet_for(user).balance == 2
        assert CreditTransaction.objects.filter(user=user).count() == 1
