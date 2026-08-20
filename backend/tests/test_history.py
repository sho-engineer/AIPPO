"""学習の記録と、作ったものを見返せること。

このアプリは「実際の仕事でAIを使えるようになる」ことを約束している。
なのに作った文章はその場で消えていた。翌日「先週つくったやつをもう一度」が
できないのは、約束の真ん中に穴が空いている状態だった。

ここで守るのは3つ。

  1. 自分が作ったものが、あとから取り出せること
  2. **他人のものは1件も出ないこと**
  3. 貼った本文は返さないこと（既定で溜め込まない方針を、読み口でも守る）

3番目が特に大事。溜め込まない約束をしておきながら、たまたま残っていた本文を
読み口から返してしまえば、約束は破られる。
"""

from __future__ import annotations

import uuid

import pytest
from django.contrib.auth import get_user_model

from apps.accounts.models import LearnerIdentity
from apps.lessons.models import Attempt, AttemptStatus, LearningSession

HISTORY_URL = "/api/lessons/history/"
ME_URL = "/api/v1/accounts/me/"

User = get_user_model()


def _learner_key(client) -> uuid.UUID:
    """この端末の鍵を確保する。/me/ を1回叩けば Cookie が置かれる。"""
    client.get(ME_URL)
    return uuid.UUID(client.cookies["learner_key"].value)


def _make_artifact(
    learner_key: uuid.UUID,
    *,
    lesson_id: str = "rewrite_text",
    output: str = "書き直した文章です。",
    user_input: str = "",
    status: str = AttemptStatus.SUCCEEDED,
    action: str = "rewrite",
    conditions: dict | None = None,
) -> Attempt:
    session = LearningSession.objects.create(
        learner_key=learner_key, lesson_id=lesson_id
    )
    return Attempt.objects.create(
        session=session,
        sequence=1,
        lesson_id=lesson_id,
        step="generate_first",
        action=action,
        user_input=user_input,
        generated_output=output,
        conditions=conditions or {"audience": "上司"},
        status=status,
    )


@pytest.mark.django_db
class TestWhatIMade:
    def test_an_artifact_can_be_read_back(self, client):
        key = _learner_key(client)
        _make_artifact(key, output="ご確認をお願いいたします。")

        body = client.get(HISTORY_URL).json()

        assert len(body["artifacts"]) == 1
        assert body["artifacts"][0]["output"] == "ご確認をお願いいたします。"
        assert body["artifacts"][0]["lesson_id"] == "rewrite_text"

    def test_the_conditions_come_with_it(self, client):
        """何を指定してその結果になったかも返すこと。

        条件が無いと、見返しても「なぜこうなったか」が分からず、
        学びに繋がらない。
        """
        key = _learner_key(client)
        _make_artifact(key, conditions={"audience": "お客様", "tone": "ていねいに"})

        artifact = client.get(HISTORY_URL).json()["artifacts"][0]

        assert artifact["conditions"] == {"audience": "お客様", "tone": "ていねいに"}

    def test_newest_first(self, client):
        key = _learner_key(client)
        _make_artifact(key, output="1本目")
        _make_artifact(key, output="2本目")

        outputs = [a["output"] for a in client.get(HISTORY_URL).json()["artifacts"]]

        assert outputs == ["2本目", "1本目"]

    def test_failed_runs_are_not_listed(self, client):
        """失敗した回は並べない。

        「作れたもの」を探しに来た人が、探しづらくなる。
        """
        key = _learner_key(client)
        _make_artifact(key, output="できたもの")
        _make_artifact(key, output="", status=AttemptStatus.FAILED)

        artifacts = client.get(HISTORY_URL).json()["artifacts"]

        assert len(artifacts) == 1
        assert artifacts[0]["output"] == "できたもの"

    def test_empty_outputs_are_not_listed(self, client):
        key = _learner_key(client)
        _make_artifact(key, output="")

        assert client.get(HISTORY_URL).json()["artifacts"] == []

    def test_a_very_long_output_is_cut_and_marked(self, client):
        """長すぎるものは切る。切ったことは伝える。

        黙って切ると、続きがあるのに終わったと思われる。
        """
        from apps.lessons.views_history import MAX_OUTPUT_CHARS

        key = _learner_key(client)
        _make_artifact(key, output="あ" * (MAX_OUTPUT_CHARS + 100))

        artifact = client.get(HISTORY_URL).json()["artifacts"][0]

        assert len(artifact["output"]) == MAX_OUTPUT_CHARS
        assert artifact["truncated"] is True

    def test_a_normal_output_is_not_marked_as_cut(self, client):
        key = _learner_key(client)
        _make_artifact(key, output="短い文章")

        assert client.get(HISTORY_URL).json()["artifacts"][0]["truncated"] is False


@pytest.mark.django_db
class TestTheTextIPastedIsNotReturned:
    def test_the_input_is_never_in_the_response(self, client):
        """貼った本文を返さないこと。

        `AI_STORE_RAW_INPUT` を true にした環境では本文が残る。
        残っていても読み口からは返さない。返してしまえば
        「既定では溜め込まない」という方針が、読み口の側で破られる。
        """
        key = _learner_key(client)
        _make_artifact(key, user_input="社外秘：来期の売上計画について")

        raw = client.get(HISTORY_URL).content.decode()

        assert "社外秘" not in raw
        assert "来期の売上計画" not in raw


@pytest.mark.django_db
class TestOtherPeoplesWork:
    def test_another_device_sees_nothing(self, client):
        """他人のものは1件も出ないこと。"""
        stranger_key = uuid.uuid4()
        _make_artifact(stranger_key, output="他人が作ったもの")

        _learner_key(client)
        body = client.get(HISTORY_URL).json()

        assert body["artifacts"] == []
        assert body["sessions"] == []

    def test_only_my_own_shows_up_when_both_exist(self, client):
        key = _learner_key(client)
        _make_artifact(key, output="自分のもの")
        _make_artifact(uuid.uuid4(), output="他人のもの")

        outputs = [a["output"] for a in client.get(HISTORY_URL).json()["artifacts"]]

        assert outputs == ["自分のもの"]

    def test_what_i_made_before_signing_up_comes_with_me(self, client):
        """登録前に作ったものが、登録後も見られること。

        引き継げないと、登録した人ほど損をする。
        """
        key = _learner_key(client)
        _make_artifact(key, output="ゲストのときに作ったもの")

        user = User.objects.create_user(
            username="learner@example.com",
            email="learner@example.com",
            password="aippo-strong-pass-9",
        )
        LearnerIdentity.objects.create(learner_key=key, user=user)
        client.force_login(user)

        outputs = [a["output"] for a in client.get(HISTORY_URL).json()["artifacts"]]

        assert outputs == ["ゲストのときに作ったもの"]

    def test_a_second_device_sees_the_same_work(self, client, django_user_model):
        """別の端末で開いても、同じものが見えること。"""
        user = django_user_model.objects.create_user(
            username="learner@example.com",
            email="learner@example.com",
            password="aippo-strong-pass-9",
        )
        phone_key = uuid.uuid4()
        LearnerIdentity.objects.create(learner_key=phone_key, user=user)
        _make_artifact(phone_key, output="スマホで作ったもの")

        client.force_login(user)
        outputs = [a["output"] for a in client.get(HISTORY_URL).json()["artifacts"]]

        assert "スマホで作ったもの" in outputs


@pytest.mark.django_db
class TestTheRecordOfWhatIDid:
    def test_sessions_are_listed_newest_first(self, client):
        key = _learner_key(client)
        _make_artifact(key, lesson_id="rewrite_text")
        _make_artifact(key, lesson_id="summarize_text")

        lessons = [s["lesson_id"] for s in client.get(HISTORY_URL).json()["sessions"]]

        assert lessons == ["summarize_text", "rewrite_text"]

    def test_whether_it_was_finished_is_shown(self, client):
        from django.utils import timezone

        key = _learner_key(client)
        session = LearningSession.objects.create(
            learner_key=key, lesson_id="rewrite_text", completed_at=timezone.now()
        )

        listed = client.get(HISTORY_URL).json()["sessions"]

        assert listed[0]["id"] == str(session.id)
        assert listed[0]["completed"] is True

    def test_an_unfinished_one_is_marked_as_such(self, client):
        key = _learner_key(client)
        LearningSession.objects.create(learner_key=key, lesson_id="rewrite_text")

        assert client.get(HISTORY_URL).json()["sessions"][0]["completed"] is False


@pytest.mark.django_db
class TestABlankSlate:
    def test_a_first_time_visitor_gets_empty_lists(self, client):
        """まだ何もしていない人にも、壊れずに空を返すこと。"""
        _learner_key(client)

        body = client.get(HISTORY_URL).json()

        assert body["artifacts"] == []
        assert body["sessions"] == []


@pytest.mark.django_db
class TestHowManyRunsAreLeft:
    """今日あと何回AIを使えるか。

    上限そのものは前からあったが、本人には見えていなかった。
    見えないと、レッスンの途中で急に止まったとき、壊れたのか
    自分のせいなのかが分からない。
    """

    def test_a_fresh_visitor_has_the_full_amount(self, client, settings):
        settings.AI_DAILY_REQUEST_LIMIT_GUEST = 10
        _learner_key(client)

        quota = client.get(HISTORY_URL).json()["ai_quota"]

        assert quota == {"limit": 10, "used": 0, "remaining": 10}

    def test_using_it_reduces_what_is_left(self, client, settings):
        from apps.lessons.services.quota import consume_ai_run

        settings.AI_DAILY_REQUEST_LIMIT_GUEST = 10
        settings.AI_RUNS_PER_DAY = 0
        settings.AI_RUNS_PER_IP_PER_DAY = 0
        _learner_key(client)

        # 実際に消費する。数え方を二重に書かず、本物を通す
        response = client.get(HISTORY_URL)
        consume_ai_run(response.wsgi_request)
        consume_ai_run(response.wsgi_request)

        quota = client.get(HISTORY_URL).json()["ai_quota"]

        assert quota["used"] == 2
        assert quota["remaining"] == 8

    def test_a_signed_in_person_gets_the_larger_amount(self, client, settings):
        settings.AI_DAILY_REQUEST_LIMIT_GUEST = 10
        settings.AI_DAILY_REQUEST_LIMIT_USER = 50

        key = _learner_key(client)
        user = User.objects.create_user(
            username="learner@example.com",
            email="learner@example.com",
            password="aippo-strong-pass-9",
        )
        LearnerIdentity.objects.create(learner_key=key, user=user)
        client.force_login(user)

        assert client.get(HISTORY_URL).json()["ai_quota"]["limit"] == 50

    def test_no_number_is_shown_when_the_limit_is_off(self, client, settings):
        """上限を外しているときは数を出さない。

        0 を返すと「残り0回」と読めてしまい、逆の意味になる。
        """
        settings.AI_DAILY_REQUEST_LIMIT_GUEST = 0
        _learner_key(client)

        quota = client.get(HISTORY_URL).json()["ai_quota"]

        assert quota["limit"] is None
        assert quota["remaining"] is None

    def test_the_shared_limits_are_never_exposed(self, client, settings):
        """全体や接続元ごとの上限は出さないこと。

        本人には動かしようがないし、残量を見せること自体が
        上限を回避する手掛かりになる。
        """
        settings.AI_RUNS_PER_DAY = 2000
        settings.AI_RUNS_PER_IP_PER_DAY = 100
        _learner_key(client)

        quota = client.get(HISTORY_URL).json()["ai_quota"]

        assert set(quota) == {"limit", "used", "remaining"}
