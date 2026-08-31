"""取っておいた成果物。

「作ったもの」（`views_history`）は自動でたまり、いずれ消える。
こちらは**本人が取っておくと決めたもの**で、名前が付き、消えない。

守りたいこと
------------
- 同じ物を二度取っておかない。押し直しを失敗にしない
- 条件を変えて作った物は、別物として残る
- 元の Attempt が消えても残る（本文を写している）
- 取っておけるのは登録した人だけ（ゲストの鍵は7日で切れる）
- 他人のものを読めない・消せない
"""

from __future__ import annotations

import uuid

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.accounts.models import LearnerIdentity
from apps.catalog.models import Course, Lesson
from apps.lessons.models import SavedArtifact
from apps.lessons.views_artifacts import MAX_OUTPUT_CHARS, MAX_SAVED

pytestmark = pytest.mark.django_db

User = get_user_model()

LIST = reverse("lesson-saved")


def _signed_in(api_client):
    """登録済みの人として使う。鍵は cookie のものがそのまま使われる。"""
    user = User.objects.create_user(username="a@example.com", password="x" * 12)
    api_client.force_authenticate(user=user)
    return user


def _save(api_client, **body):
    payload = {"lesson_id": "rewrite_text", "output": "書き直した文章です。", **body}
    return api_client.post(LIST, payload, format="json")


class TestKeepingOne:
    def test_it_keeps_the_text_and_names_it(self, api_client):
        course = Course.objects.create(slug="c1", title="c1")
        Lesson.objects.create(
            course=course, slug="rewrite_text", number=1, title="文章を分かりやすくする", goal="g"
        )
        _signed_in(api_client)

        response = _save(api_client, conditions={"tone": "ていねいに"})

        assert response.status_code == 201
        artifact = response.json()["artifact"]
        assert artifact["output"] == "書き直した文章です。"
        assert artifact["title"] == "文章を分かりやすくするで作ったもの"
        assert artifact["conditions"] == {"tone": "ていねいに"}

    def test_it_works_even_when_the_lesson_is_gone(self, api_client):
        """教材を消したあとでも、取っておくこと自体はできる。"""
        _signed_in(api_client)

        response = _save(api_client)

        assert response.status_code == 201
        assert response.json()["artifact"]["title"] == "rewrite_textで作ったもの"

    def test_a_name_can_be_given(self, api_client):
        _signed_in(api_client)

        response = _save(api_client, title="部長あての依頼メール")

        assert response.json()["artifact"]["title"] == "部長あての依頼メール"

    def test_it_records_which_skills_were_used(self, api_client):
        """図鑑から「この技で作ったもの」を辿れるようにする。"""
        from apps.rewards.models import AiSkill, AiSkillLesson

        course = Course.objects.create(slug="c1", title="c1")
        lesson = Lesson.objects.create(
            course=course, slug="rewrite_text", number=1, title="t", goal="g"
        )
        skill = AiSkill.objects.create(slug="tone", name="トーン指定", one_line="x")
        AiSkillLesson.objects.create(skill=skill, lesson=lesson)
        _signed_in(api_client)

        response = _save(api_client)

        assert response.json()["artifact"]["skills"] == ["tone"]

    def test_long_text_is_cut(self, api_client):
        _signed_in(api_client)

        response = _save(api_client, output="あ" * (MAX_OUTPUT_CHARS + 500))

        assert len(response.json()["artifact"]["output"]) == MAX_OUTPUT_CHARS


class TestNotKeepingTheSameThingTwice:
    def test_pressing_again_is_not_an_error(self, api_client):
        """押し直しただけの人に赤い字を出さない。押した結果は同じ。"""
        _signed_in(api_client)

        first = _save(api_client)
        again = _save(api_client)

        assert first.status_code == 201
        assert again.status_code == 200
        assert again.json()["already_saved"] is True
        assert SavedArtifact.objects.count() == 1

    def test_a_different_result_is_kept_separately(self, api_client):
        """条件を変えて作った物は別物。上書きで消さない。"""
        _signed_in(api_client)

        _save(api_client, output="1つめ", conditions={"tone": "ていねいに"})
        _save(api_client, output="2つめ", conditions={"tone": "みじかく"})

        assert SavedArtifact.objects.count() == 2

    def test_the_same_text_from_another_lesson_is_kept_separately(self, api_client):
        _signed_in(api_client)

        _save(api_client, lesson_id="rewrite_text")
        _save(api_client, lesson_id="summarize_text")

        assert SavedArtifact.objects.count() == 2

    def test_another_device_of_the_same_person_counts_as_the_same(self, api_client):
        """別の端末で取ってあった物を、もう1つ増やさない。"""
        user = _signed_in(api_client)
        other = uuid.uuid4()
        LearnerIdentity.objects.create(user=user, learner_key=other)
        SavedArtifact.objects.create(
            learner_key=other,
            lesson_id="rewrite_text",
            title="前に取っておいたもの",
            output="書き直した文章です。",
            output_hash=__import__("hashlib")
            .sha256("書き直した文章です。".encode())
            .hexdigest(),
        )

        response = _save(api_client)

        assert response.json()["already_saved"] is True
        assert SavedArtifact.objects.count() == 1


class TestGuests:
    def test_a_guest_cannot_keep(self, api_client):
        """ゲストの鍵は7日で切れる。残らないものを取っておかせない。"""
        response = _save(api_client)

        assert response.status_code == 403
        assert "requires_account" in response.json()["errors"]

    def test_a_guest_is_told_rather_than_shown_an_empty_list(self, api_client):
        """空と、使えないは別のこと。画面が言い分けられるようにする。"""
        body = api_client.get(LIST).json()

        assert body["items"] == []
        assert body["requires_account"] is True


class TestSeeingOnlyYourOwn:
    def test_someone_elses_is_not_listed(self, api_client):
        _signed_in(api_client)
        SavedArtifact.objects.create(
            learner_key=uuid.uuid4(),
            lesson_id="rewrite_text",
            title="他人のもの",
            output="秘密",
            output_hash="x",
        )

        body = api_client.get(LIST).json()

        assert body["items"] == []

    def test_someone_elses_cannot_be_deleted(self, api_client):
        _signed_in(api_client)
        theirs = SavedArtifact.objects.create(
            learner_key=uuid.uuid4(),
            lesson_id="rewrite_text",
            title="他人のもの",
            output="秘密",
            output_hash="x",
        )

        api_client.delete(reverse("lesson-saved-detail", args=[str(theirs.id)]))

        assert SavedArtifact.objects.filter(id=theirs.id).exists()

    def test_a_broken_id_does_not_crash(self, api_client):
        _signed_in(api_client)

        response = api_client.delete(reverse("lesson-saved-detail", args=["not-a-uuid"]))

        assert response.status_code == 204


class TestRenamingAndThrowingAway:
    def test_the_name_can_be_changed(self, api_client):
        _signed_in(api_client)
        created = _save(api_client).json()["artifact"]

        response = api_client.patch(
            reverse("lesson-saved-detail", args=[created["id"]]),
            {"title": "部長あての依頼メール"},
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["artifact"]["title"] == "部長あての依頼メール"

    def test_an_empty_name_is_refused(self, api_client):
        # 名前が空になると、一覧で見分けが付かなくなる
        _signed_in(api_client)
        created = _save(api_client).json()["artifact"]

        response = api_client.patch(
            reverse("lesson-saved-detail", args=[created["id"]]),
            {"title": "   "},
            format="json",
        )

        assert response.status_code == 400

    def test_it_can_be_thrown_away(self, api_client):
        _signed_in(api_client)
        created = _save(api_client).json()["artifact"]

        response = api_client.delete(reverse("lesson-saved-detail", args=[created["id"]]))

        assert response.status_code == 204
        assert SavedArtifact.objects.count() == 0

    def test_throwing_away_twice_is_not_an_error(self, api_client):
        """押した結果は同じ（もう無い）。"""
        _signed_in(api_client)
        created = _save(api_client).json()["artifact"]
        url = reverse("lesson-saved-detail", args=[created["id"]])

        api_client.delete(url)
        again = api_client.delete(url)

        assert again.status_code == 204


class TestTheLimit:
    def test_it_stops_at_the_cap(self, api_client, settings):
        user = _signed_in(api_client)
        api_client.get(LIST)  # 鍵を確定させる
        key = uuid.UUID(api_client.cookies["learner_key"].value)
        LearnerIdentity.objects.create(user=user, learner_key=key)

        for index in range(MAX_SAVED):
            SavedArtifact.objects.create(
                learner_key=key,
                lesson_id="rewrite_text",
                title=f"{index}",
                output=f"{index}",
                output_hash=f"{index:064d}",
            )

        response = _save(api_client)

        assert response.status_code == 409
        assert str(MAX_SAVED) in response.json()["errors"]["detail"][0]


class TestItSurvivesPruning:
    def test_pruning_old_sessions_does_not_take_it(self, api_client):
        """元の `Attempt` が消えても残る。本文を写しているため。

        取っておくと言った以上、元が消えても残らなければ意味がない。
        """
        from datetime import timedelta

        from django.utils import timezone

        from apps.lessons.management.commands.prune_data import prune

        user = _signed_in(api_client)
        api_client.get(LIST)
        key = uuid.UUID(api_client.cookies["learner_key"].value)
        LearnerIdentity.objects.create(user=user, learner_key=key)

        from apps.lessons.models import LearningSession

        session = LearningSession.objects.create(learner_key=key, lesson_id="rewrite_text")
        LearningSession.objects.filter(pk=session.pk).update(
            updated_at=timezone.now() - timedelta(days=400)
        )
        SavedArtifact.objects.create(
            learner_key=key,
            lesson_id="rewrite_text",
            title="取っておいたもの",
            output="残るはず",
            output_hash="a" * 64,
        )

        # まだ使っている鍵なので、この人の分は消えない
        prune(timezone.now() - timedelta(days=365), dry_run=False)

        assert SavedArtifact.objects.filter(learner_key=key).exists()

    def test_a_stale_key_takes_it(self):
        """鍵ごと消えるときは、一緒に消す。

        鍵が消える＝本人からも取り出せなくなるので、残しても
        誰のものか分からない本文が溜まるだけになる。
        """
        from datetime import timedelta

        from django.utils import timezone

        from apps.lessons.management.commands.prune_data import prune
        from apps.lessons.models import LearningSession

        key = uuid.uuid4()
        session = LearningSession.objects.create(learner_key=key, lesson_id="rewrite_text")
        LearningSession.objects.filter(pk=session.pk).update(
            updated_at=timezone.now() - timedelta(days=400)
        )
        SavedArtifact.objects.create(
            learner_key=key,
            lesson_id="rewrite_text",
            title="取っておいたもの",
            output="消えるはず",
            output_hash="b" * 64,
        )

        prune(timezone.now() - timedelta(days=365), dry_run=False)

        assert not SavedArtifact.objects.filter(learner_key=key).exists()


class TestDeletingYourData:
    def test_it_goes_with_the_learning_data(self, api_client):
        user = _signed_in(api_client)
        key = uuid.uuid4()
        LearnerIdentity.objects.create(user=user, learner_key=key)
        SavedArtifact.objects.create(
            learner_key=key,
            lesson_id="rewrite_text",
            title="取っておいたもの",
            output="消えるはず",
            output_hash="c" * 64,
        )

        response = api_client.post("/api/v1/accounts/learning-data/delete/")

        assert response.status_code == 200
        assert not SavedArtifact.objects.filter(learner_key=key).exists()
