"""復習。一度やったことを、忘れる前にもう一度。

いまのアプリは「一度やったら終わり」だった。人は覚えたことを翌日には
半分忘れる。忘れたまま放っておけば、7日かけて学んだことは残らない。

ここで守るのは4つ。

  1. 終えた教材だけが並ぶこと（途中のものを「復習」と言わない）
  2. 間隔があくほど、次の見返しどきが先になること
  3. 長く待たせているものが先に来ること
  4. 他人のものは1件も出ないこと
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.lessons.models import LearningSession
from apps.lessons.views_review import INTERVALS_DAYS

REVIEW_URL = "/api/lessons/review/"
ME_URL = "/api/v1/accounts/me/"


def _learner_key(client) -> uuid.UUID:
    client.get(ME_URL)
    return uuid.UUID(client.cookies["learner_key"].value)


def _finish(learner_key: uuid.UUID, lesson_id: str, *, days_ago: float = 0) -> LearningSession:
    """その教材を終えたことにする。何日前かを指定できる。"""
    done_at = timezone.now() - timedelta(days=days_ago)
    session = LearningSession.objects.create(
        learner_key=learner_key, lesson_id=lesson_id, completed_at=done_at
    )
    # completed_at は auto ではないので、そのまま入る
    return session


def _items(client) -> list[dict]:
    return client.get(REVIEW_URL).json()["items"]


@pytest.mark.django_db
class TestWhatShowsUp:
    def test_a_finished_lesson_appears(self, client):
        key = _learner_key(client)
        _finish(key, "rewrite_text", days_ago=2)

        items = _items(client)

        assert len(items) == 1
        assert items[0]["lesson_id"] == "rewrite_text"

    def test_an_unfinished_lesson_does_not(self, client):
        """途中のものを「復習」と言わない。

        まだ終えていないなら、それは復習ではなく続きになる。
        """
        key = _learner_key(client)
        LearningSession.objects.create(learner_key=key, lesson_id="rewrite_text")

        assert _items(client) == []

    def test_a_first_time_visitor_gets_nothing(self, client):
        _learner_key(client)

        body = client.get(REVIEW_URL).json()

        assert body == {"items": [], "due_count": 0}


@pytest.mark.django_db
class TestWhenItIsDue:
    def test_one_day_after_the_first_time(self, client):
        key = _learner_key(client)
        _finish(key, "rewrite_text", days_ago=1.1)

        item = _items(client)[0]

        assert item["times_done"] == 1
        assert item["due"] is True

    def test_not_yet_due_right_after_finishing(self, client):
        key = _learner_key(client)
        _finish(key, "rewrite_text", days_ago=0)

        item = _items(client)[0]

        assert item["due"] is False
        assert client.get(REVIEW_URL).json()["due_count"] == 0

    def test_the_gap_grows_each_time(self, client):
        """回を重ねるほど、次は先になること。

        間隔をあけて思い出すほど定着する。毎日同じものを出すと、
        飽きるうえに新しい教材へ進めない。
        """
        key = _learner_key(client)

        # 1回目のあとは1日、2回目のあとは3日……と延びる
        for times in (1, 2, 3, 4):
            LearningSession.objects.filter(learner_key=key).delete()
            for _ in range(times):
                _finish(key, "rewrite_text", days_ago=0.5)

            item = _items(client)[0]
            expected = INTERVALS_DAYS[min(times, len(INTERVALS_DAYS)) - 1]

            assert item["times_done"] == times
            # まだ 0.5 日しか経っていないので、1日より長い間隔なら未到来
            assert item["due"] is (expected <= 0.5), f"{times}回目"

    def test_the_last_gap_keeps_applying(self, client):
        """表を超えて何度やっても、最後の間隔が続くこと。

        無限に伸ばすと、間隔が空きすぎて「もう関係ないもの」になる。
        """
        key = _learner_key(client)
        for _ in range(10):
            _finish(key, "rewrite_text", days_ago=0.5)

        item = _items(client)[0]

        assert item["times_done"] == 10
        # 14日あく。0.5日では来ない
        assert item["due"] is False
        assert item["days_until_due"] == INTERVALS_DAYS[-1] - 1

    def test_how_long_to_wait_is_shown(self, client):
        """次はいつかが見えること。

        見えないと、待っているのか忘れられたのかが分からない。
        """
        key = _learner_key(client)
        _finish(key, "rewrite_text", days_ago=0)

        item = _items(client)[0]

        assert item["days_until_due"] >= 0
        assert item["due_at"]


@pytest.mark.django_db
class TestTheOrder:
    def test_due_ones_come_first(self, client):
        key = _learner_key(client)
        _finish(key, "not_yet", days_ago=0)
        _finish(key, "waiting", days_ago=5)

        lessons = [item["lesson_id"] for item in _items(client)]

        assert lessons[0] == "waiting"

    def test_the_longest_waiting_comes_first(self, client):
        """待たせるほど忘れている。そこから戻すのが効く。"""
        key = _learner_key(client)
        _finish(key, "a_little_late", days_ago=2)
        _finish(key, "very_late", days_ago=30)

        lessons = [item["lesson_id"] for item in _items(client)]

        assert lessons == ["very_late", "a_little_late"]

    def test_the_due_count_matches(self, client):
        key = _learner_key(client)
        _finish(key, "one", days_ago=5)
        _finish(key, "two", days_ago=5)
        _finish(key, "three", days_ago=0)

        assert client.get(REVIEW_URL).json()["due_count"] == 2


@pytest.mark.django_db
class TestOtherPeople:
    def test_other_peoples_lessons_never_show_up(self, client):
        _finish(uuid.uuid4(), "someone_elses", days_ago=5)
        _learner_key(client)

        assert _items(client) == []

    def test_only_my_own_when_both_exist(self, client):
        key = _learner_key(client)
        _finish(key, "mine", days_ago=5)
        _finish(uuid.uuid4(), "theirs", days_ago=5)

        lessons = [item["lesson_id"] for item in _items(client)]

        assert lessons == ["mine"]


@pytest.mark.django_db
class TestNoScores:
    def test_no_score_is_ever_returned(self, client):
        """点数を付けないこと。

        相手はAIに不安がある初心者。点数を出すと、低い点を取った人から
        いなくなる。覚えているかを測るより、もう一度手を動かすほうが定着する。
        """
        key = _learner_key(client)
        _finish(key, "rewrite_text", days_ago=5)

        item = _items(client)[0]

        for banned in ("score", "grade", "correct", "accuracy", "rank"):
            assert banned not in item, f"{banned} を返している"
