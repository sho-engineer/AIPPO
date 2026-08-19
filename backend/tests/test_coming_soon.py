"""近日公開の教材は、どこからも始められないこと。

教材9本の中身が揃ったので、取り込みの既定は**全部が始められる**に変えた
（seed_catalog.py の RELEASE_COMING_SOON は空）。
それでも仕組みは消さない。未完成の教材を足すときや、問題が見つかって
一時的に止めるときに要る。

そこでこのテストは「どの教材が開いているか」ではなく、
**近日公開にしたら本当に止まるか**を見る。
以前は `assert available == {"diagnosis", "rewrite_text"}` のように
その時々の公開範囲を書いていたが、それは教材が1本増えるたびに
落ちるだけで、止める仕組みが壊れても気づけない。

止める場所は3つあり、そのすべてを見る。
"""

from __future__ import annotations

import pytest
from django.core.management import call_command

from apps.catalog.access import (
    LESSON_COMING_SOON,
    LessonNotStartable,
    is_startable,
    require_startable,
)
from apps.catalog.models import AvailabilityStatus, Lesson, PublishStatus

CATALOG_URL = "/api/v1/catalog/"
GENERATE_URL = "/api/v1/ai/generate/"

#: 止まることを確かめる相手。どれか1本を近日公開にして試す。
#: rewrite_text は「開いている側」の対照に使うので選ばない。
GATED = "improve_answer"


@pytest.fixture
def seeded(db):
    call_command("seed_catalog")


@pytest.fixture
def gated(seeded):
    """1本だけ近日公開にする。

    取り込みの既定は全部が始められるので、止まることを確かめるには
    こちらで閉じる。管理画面から閉じたのと同じ状態になる。
    """
    Lesson.objects.filter(slug=GATED).update(
        availability_status=AvailabilityStatus.COMING_SOON
    )
    return GATED


@pytest.fixture(autouse=True)
def _use_mock(settings):
    settings.AI_PROVIDER = "mock"


@pytest.mark.django_db
class TestReleaseScope:
    """取り込んだ直後の状態。"""

    def test_every_lesson_is_startable_by_default(self, seeded):
        """既定では全部が始められる。

        教材の中身は9本とも揃っている。閉じておくと、
        画面には出ているのに押せない教材が並ぶだけになる。
        """
        stuck = Lesson.objects.exclude(
            availability_status=AvailabilityStatus.AVAILABLE
        ).values_list("slug", flat=True)

        assert list(stuck) == []
        assert Lesson.objects.count() == 9

    def test_a_gated_lesson_is_still_listed(self, gated):
        """一覧から消してはいけない。出したうえで止めるのが「近日公開」。"""
        lesson = Lesson.objects.get(slug=gated)

        assert lesson.is_public
        assert not lesson.is_startable


@pytest.mark.django_db
class TestGate:
    """判定は1か所（apps/catalog/access.py）を通ること。"""

    def test_available_lesson_passes(self, seeded):
        assert require_startable("rewrite_text").slug == "rewrite_text"
        assert is_startable("rewrite_text")

    def test_coming_soon_lesson_is_refused_with_its_own_code(self, gated):
        with pytest.raises(LessonNotStartable) as caught:
            require_startable(gated)

        assert caught.value.code == LESSON_COMING_SOON
        assert not is_startable(gated)

    def test_unpublished_lesson_is_not_found(self, seeded):
        lesson = Lesson.objects.get(slug="rewrite_text")
        lesson.status = PublishStatus.DRAFT
        lesson.save()

        with pytest.raises(LessonNotStartable) as caught:
            require_startable("rewrite_text")

        # 「近日公開」とは区別する。一覧に出ていないものは見つからない扱い
        assert caught.value.code == "LESSON_NOT_FOUND"

    def test_unknown_lesson_is_not_found(self, seeded):
        with pytest.raises(LessonNotStartable) as caught:
            require_startable("no_such_lesson")

        assert caught.value.code == "LESSON_NOT_FOUND"


@pytest.mark.django_db
class TestCatalogApi:
    """教材を配る API。"""

    def test_lists_published_lessons(self, api_client, seeded):
        response = api_client.get(CATALOG_URL)

        assert response.status_code == 200
        lessons = response.data["courses"][0]["lessons"]
        assert len(lessons) == 9

    def test_every_lesson_ships_its_steps(self, api_client, seeded):
        """始められる教材は、中身まで配られること。

        全部を開けたのに中身が空のままだと、押せるのに何も起きない。
        """
        lessons = {
            entry["id"]: entry
            for entry in api_client.get(CATALOG_URL).data["courses"][0]["lessons"]
        }

        assert len(lessons) == 9
        for slug, entry in lessons.items():
            assert entry["availability"] == "available", slug
            assert entry.get("steps"), f"{slug} の中身が空"

    def test_coming_soon_lessons_are_listed_without_steps(self, api_client, gated):
        """一覧には出すが、中身は配らない。

        中身まで返すと、画面側で「取れているのだから始められる」
        作りができてしまう。
        """
        lessons = {
            entry["id"]: entry
            for entry in api_client.get(CATALOG_URL).data["courses"][0]["lessons"]
        }

        coming = lessons[gated]
        assert coming["availability"] == "coming_soon"
        assert coming.get("steps") == []
        # 一覧に必要なものは出ていること
        assert coming["title"]
        assert coming["goal"]

        available = lessons["rewrite_text"]
        assert available["availability"] == "available"
        assert len(available["steps"]) > 10

    def test_unpublished_lessons_never_appear(self, api_client, seeded):
        lesson = Lesson.objects.get(slug="make_plan")
        lesson.status = PublishStatus.DRAFT
        lesson.save()

        lessons = [
            entry["id"]
            for entry in api_client.get(CATALOG_URL).data["courses"][0]["lessons"]
        ]

        assert "make_plan" not in lessons


@pytest.mark.django_db
class TestAiApiRefusesComingSoon:
    """AI 実行 API も止めること。ここが抜けると費用が出る。"""

    def _post(self, api_client, lesson_id):
        """どの教材でも使える `improve` で叩く。

        教材ごとに使えるアクションが違うので、rewrite だと
        「教材が違う」の 400 が先に返り、近日公開かどうかを見られない。
        """
        return api_client.post(
            GENERATE_URL,
            {
                "lesson_id": lesson_id,
                "step_id": "generate_improved",
                "action": "improve",
                "input": {
                    "original_text": "先日の件ですが、追ってご連絡差し上げます。",
                    "improvement": "もっと短く",
                },
            },
            format="json",
        )

    def test_available_lesson_can_call_ai(self, api_client, seeded):
        assert self._post(api_client, "rewrite_text").status_code == 200

    def test_coming_soon_lesson_cannot_call_ai(self, api_client, gated):
        response = self._post(api_client, gated)

        assert response.status_code == 409
        assert response.data["code"] == LESSON_COMING_SOON

    def test_refusal_happens_before_spending_quota(self, api_client, gated):
        """止めるのは実行回数を消費する**前**であること。

        あとで止めると、始められない教材を叩くだけで
        その日の回数を削れてしまう。
        """
        from apps.lessons.models import AiUsageCounter

        before = AiUsageCounter.objects.count()
        self._post(api_client, gated)

        assert AiUsageCounter.objects.count() == before

    def test_missing_catalog_does_not_block_ai(self, api_client, db):
        """教材をまだ取り込んでいない環境では止めない。

        止めたいのは「近日公開と分かっているもの」だけ。
        取り込み前の開発環境まで動かなくする必要はない。
        """
        assert Lesson.objects.count() == 0

        assert self._post(api_client, "rewrite_text").status_code == 200
