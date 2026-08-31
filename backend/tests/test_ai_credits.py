"""無料でAIを試せる持ち分。

いちばん守りたいのは1つ。

    **成果を受け取っていないなら減らさない。**

前はそうなっていなかった。AI を呼ぶ**前**に数え、失敗しても戻さない。
provider が落ちた日は、押しただけで回数を失っていた。

そのほかに見張るもの。

  - 二度足さない（登録の特典、レッスンの1回、その日のぶん）
  - 連打・同時・切れたあとの送り直しで、二重に減らさない
  - 使い切ったところで「失敗」と言わない
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.ai.providers.base import AIProviderError, AITimeoutError
from apps.lessons.models import (
    AiActionType,
    AiCreditBalance,
    AiCreditGrant,
    AiCreditLedger,
    AiCreditStatus,
)
from apps.lessons.services import credits

pytestmark = pytest.mark.django_db

GENERATE_URL = "/api/v1/ai/generate/"

REWRITE_INPUT = {
    "original_text": "先日の件ですが、諸事情ございまして、追ってご連絡差し上げます。",
    "audience": "社外のお客様",
    "tone": "ていねいに",
    "length": "3行くらい",
}


def _post(api_client, **over):
    body = {
        "lesson_id": "rewrite_text",
        "step_id": "generate_first",
        "action": "rewrite",
        "input": REWRITE_INPUT,
        "request_id": str(uuid.uuid4()),
    }
    body.update(over)
    return api_client.post(GENERATE_URL, body, format="json")


def _key(api_client) -> uuid.UUID:
    """いまの端末の鍵。1回投げれば Cookie が返る。"""
    _post(api_client)
    return uuid.UUID(api_client.cookies["learner_key"].value)


def _left(learner_key, action_type=AiActionType.TEXT) -> int:
    row = AiCreditBalance.objects.filter(
        learner_key=learner_key, action_type=action_type
    ).first()
    return row.available if row else 0


@pytest.fixture
def mock_ai(settings):
    """作り物の AI。成功を返す。"""
    settings.AI_PROVIDER = "mock"
    return settings


@pytest.fixture
def broken_ai(monkeypatch, settings):
    """必ず落ちる AI。"""
    settings.AI_PROVIDER = "mock"

    def _boom(self, request, schema):
        raise AIProviderError("provider is down")

    monkeypatch.setattr(
        "apps.ai.providers.mock.MockProvider.generate_structured", _boom, raising=False
    )
    return settings


# ------------------------------------------------------------------ 付与


class TestWhatWeHandOut:
    def test_a_new_guest_starts_with_ten(self, api_client, mock_ai, settings):
        """登録前の人は10回から始まる（CASE 1）。"""
        key = _key(api_client)

        # 1回使ったので9。配られたのは10
        assert (
            AiCreditGrant.objects.get(
                learner_key=key, reason="guest_initial"
            ).amount
            == settings.GUEST_INITIAL_TEXT_ACTIONS
        )

    def test_a_guest_who_started_before_this_also_gets_ten(
        self, api_client, mock_ai, settings
    ):
        """**すでに学んでいた人にも、あとから配る。**

        この仕組みを入れる前から使っていた人には、持ち分の行が無い。
        入れた日に「0回」で止めてしまうと、昨日まで使えていた人が
        今日いきなり使えなくなる——その人から見れば、ただの故障。

        全員へ先回りして配ることはしない。まだ来ていない人のぶんまで
        行を作ることになる。**来た人に、来たときに配る。**
        """
        # 仕組みの前からいた人：進み具合はあるが、持ち分の行が無い
        before = uuid.uuid4()
        api_client.cookies["learner_key"] = str(before)
        assert not AiCreditBalance.objects.filter(learner_key=before).exists()

        _post(api_client)

        assert (
            AiCreditGrant.objects.get(learner_key=before, reason="guest_initial").amount
            == settings.GUEST_INITIAL_TEXT_ACTIONS
        )
        # 1回使ったぶんだけ減っている
        assert _left(before) == settings.GUEST_INITIAL_TEXT_ACTIONS - 1

    def test_the_first_handout_happens_once(self, api_client, mock_ai):
        """何度来ても、最初の持ち出しは一度きり。"""
        key = _key(api_client)

        credits.ensure_ready(key)
        credits.ensure_ready(key)

        assert (
            AiCreditGrant.objects.filter(
                learner_key=key, reason="guest_initial"
            ).count()
            == 1
        )

    def test_tomorrow_adds_three(self, mock_ai, settings):
        """翌日は +3（CASE 10）。"""
        key = uuid.uuid4()
        credits.ensure_ready(key)
        # 使い切る
        AiCreditBalance.objects.filter(learner_key=key).update(available=0)

        # 日が変わったことにする
        AiCreditGrant.objects.filter(learner_key=key, reason="daily").update(
            on_date=timezone.localdate() - timedelta(days=1)
        )
        credits.grant_daily(key)

        assert _left(key) == settings.FREE_DAILY_TEXT_ACTIONS

    def test_the_daily_handout_stops_at_six(self, settings):
        """毎日のぶんは6で頭打ち。

        しばらく来なかった人が大量に持って戻ってくると、
        その日の費用が読めなくなる。
        """
        key = uuid.uuid4()
        credits.ensure_ready(key)
        AiCreditBalance.objects.filter(learner_key=key).update(available=5)

        AiCreditGrant.objects.filter(learner_key=key, reason="daily").update(
            on_date=timezone.localdate() - timedelta(days=1)
        )
        credits.grant_daily(key)

        assert _left(key) == settings.FREE_MAX_DAILY_TEXT_ACTIONS

    def test_the_first_handout_may_exceed_the_daily_cap(self, settings):
        """最初の10は、毎日の上限6を超えて持てる。

        別の考え方なので、ここで削らない。削ると初日の途中で
        急に減ることになる。
        """
        key = uuid.uuid4()
        credits.ensure_ready(key)

        assert _left(key) == settings.GUEST_INITIAL_TEXT_ACTIONS
        assert _left(key) > settings.FREE_MAX_DAILY_TEXT_ACTIONS

    def test_the_daily_handout_happens_once_a_day(self):
        key = uuid.uuid4()
        credits.ensure_ready(key)
        before = _left(key)

        credits.grant_daily(key)
        credits.grant_daily(key)

        assert _left(key) == before

    def test_a_lesson_hands_out_its_own_credit(self, settings):
        """Day7 に着いた人へ、画像を1回（CASE 12）。"""
        key = uuid.uuid4()

        credits.grant_for_lesson(key, "image_generation")

        assert (
            _left(key, AiActionType.IMAGE_GENERATION)
            == settings.DAY7_FREE_IMAGE_GENERATIONS
        )

    def test_revisiting_the_lesson_hands_out_nothing(self, settings):
        """開き直しても増えない（CASE 15・19）。"""
        key = uuid.uuid4()

        for _ in range(5):
            credits.grant_for_lesson(key, "image_generation")
            credits.grant_for_lesson(key, "image_edit")

        assert (
            _left(key, AiActionType.IMAGE_GENERATION)
            == settings.DAY7_FREE_IMAGE_GENERATIONS
        )
        assert _left(key, AiActionType.IMAGE_EDIT) == settings.DAY8_FREE_IMAGE_EDITS

    def test_image_generation_and_editing_are_separate(self, settings):
        """作る枠と直す枠を混ぜない。片方で使い切らせない。"""
        key = uuid.uuid4()
        credits.grant_for_lesson(key, "image_generation")
        credits.grant_for_lesson(key, "image_edit")

        entry = credits.reserve(
            key, AiActionType.IMAGE_GENERATION, uuid.uuid4()
        )
        credits.commit(entry)

        assert _left(key, AiActionType.IMAGE_GENERATION) == 0
        # 直すほうは減っていない
        assert _left(key, AiActionType.IMAGE_EDIT) == settings.DAY8_FREE_IMAGE_EDITS

    def test_text_and_image_are_separate(self, settings):
        """文章と画像を同じ枠にしない。"""
        key = uuid.uuid4()
        credits.ensure_ready(key)
        credits.grant_for_lesson(key, "image_generation")

        entry = credits.reserve(key, AiActionType.TEXT, uuid.uuid4())
        credits.commit(entry)

        assert (
            _left(key, AiActionType.IMAGE_GENERATION)
            == settings.DAY7_FREE_IMAGE_GENERATIONS
        )


class TestTrapsWeAlreadyFellInto:
    """一度やらかしたところ。名指しで残す。"""

    def test_a_once_in_a_lifetime_grant_really_happens_once(self):
        """`on_date` が空の付与でも、重複が止まること。

        一意制約を1本にまとめて `on_date` を含めていたとき、
        **まったく止まっていなかった**。SQL は `NULL` どうしを
        「違う値」として扱うので、日付の入らない付与は何行でも入る。

        1回押すたびに最初の10がもう一度配られていて、気づいたのは
        残りが減るはずの検査で**増えていた**から。
        """
        key = uuid.uuid4()

        for _ in range(5):
            credits.grant_guest_initial(key)

        assert (
            AiCreditGrant.objects.filter(
                learner_key=key, reason="guest_initial"
            ).count()
            == 1
        )

    def test_spending_down_does_not_unlock_another_daily_handout(self, settings):
        """同じ日に使って減っても、その日のぶんをもう一度もらえない。

        「上限より多く持っているなら足さない」だけにして印を残さないと、
        使って上限を下回った時点でもう一度ここを通る。
        1日に何度でも +3 されることになる。
        """
        key = uuid.uuid4()
        credits.ensure_ready(key)

        # その日のうちに使い切る
        AiCreditBalance.objects.filter(learner_key=key).update(available=0)
        credits.grant_daily(key)

        assert _left(key) == 0


class TestRegistrationBonus:
    def test_signing_up_adds_text_and_one_image(self, settings):
        """登録の特典（CASE 11・16）。"""
        key = uuid.uuid4()
        credits.ensure_ready(key)
        before = _left(key)

        credits.grant_registration_bonus(key)

        assert _left(key) == before + settings.FREE_REGISTRATION_TEXT_BONUS
        assert (
            _left(key, AiActionType.IMAGE_GENERATION)
            == settings.FREE_REGISTRATION_IMAGE_BONUS
        )
        # 画像を直すぶんは付かない
        assert _left(key, AiActionType.IMAGE_EDIT) == 0

    def test_it_is_handed_out_once(self, settings):
        """入り直しても、もう一度はもらえない。"""
        key = uuid.uuid4()
        credits.ensure_ready(key)
        credits.grant_registration_bonus(key)
        after_first = _left(key)

        credits.grant_registration_bonus(key)

        assert _left(key) == after_first

    def test_signing_up_over_the_api_hands_it_out(self, api_client, settings):
        """登録の口を通ったときに、実際に足される。"""
        api_client.get("/api/v1/accounts/csrf/")
        response = api_client.post(
            "/api/v1/accounts/signup/",
            {
                "email": "new@example.com",
                "password": "a-long-enough-passphrase",
                "accept_terms": True,
                "accept_privacy": True,
            },
            format="json",
        )
        assert response.status_code == 201

        key = uuid.UUID(api_client.cookies["learner_key"].value)
        assert AiCreditGrant.objects.filter(
            learner_key=key, reason="registration_bonus"
        ).exists()

    def test_signing_in_hands_out_nothing(self, api_client, django_user_model):
        """ログインしただけの人には足さない。"""
        django_user_model.objects.create_user(
            username="old@example.com",
            email="old@example.com",
            password="a-long-enough-passphrase",
        )
        api_client.get("/api/v1/accounts/csrf/")
        response = api_client.post(
            "/api/v1/accounts/signin/",
            {"email": "old@example.com", "password": "a-long-enough-passphrase"},
            format="json",
        )
        assert response.status_code == 200

        key = uuid.UUID(api_client.cookies["learner_key"].value)
        assert not AiCreditGrant.objects.filter(
            learner_key=key, reason="registration_bonus"
        ).exists()


# -------------------------------------------------------------- 減り方


class TestOnlySuccessCosts:
    def test_a_good_result_costs_one(self, api_client, mock_ai):
        """成功したら1つ減る（CASE 2）。"""
        key = _key(api_client)
        before = _left(key)

        _post(api_client)

        assert _left(key) == before - 1

    def test_a_provider_error_costs_nothing(self, api_client, broken_ai):
        """provider が落ちても減らない（CASE 3）。

        押しただけで回数を失うのが、いちばん直したかったところ。
        """
        key = _key(api_client)
        before = _left(key)

        response = _post(api_client)

        assert response.status_code == 502
        assert _left(key) == before

    def test_a_timeout_costs_nothing(self, api_client, monkeypatch, settings):
        """時間切れでも減らない（CASE 4）。"""
        settings.AI_PROVIDER = "mock"
        key = _key(api_client)
        before = _left(key)

        def _slow(self, request, schema):
            raise AITimeoutError("took too long")

        monkeypatch.setattr(
            "apps.ai.providers.mock.MockProvider.generate_structured",
            _slow,
            raising=False,
        )

        response = _post(api_client)

        assert response.status_code == 502
        assert _left(key) == before

    def test_a_failed_run_leaves_no_open_reservation(self, api_client, broken_ai):
        """押さえたものを閉じ忘れない。

        閉じ忘れると、その人の持ち分が減ったまま残る。
        """
        _key(api_client)
        _post(api_client)

        assert not AiCreditLedger.objects.filter(
            status=AiCreditStatus.RESERVED
        ).exists()

    def test_asking_again_costs_another(self, api_client, mock_ai):
        """自分でもう一度押したら、また1つ（CASE 6）。"""
        key = _key(api_client)
        before = _left(key)

        _post(api_client)
        _post(api_client)

        assert _left(key) == before - 2


class TestTheSameActionCostsOnce:
    def test_the_same_request_id_does_not_cost_twice(self, api_client, mock_ai):
        """連打しても1つだけ（CASE 7）。

        画面側の disabled には頼らない。同じ操作は同じ `request_id`
        で来るので、こちらで見分ける。
        """
        key = _key(api_client)
        before = _left(key)
        same = str(uuid.uuid4())

        first = _post(api_client, request_id=same)
        second = _post(api_client, request_id=same)

        assert first.status_code == 200
        assert second.status_code == 200
        assert _left(key) == before - 1

    def test_a_replay_returns_the_same_result(self, api_client, mock_ai):
        """切れたあとの送り直しで、作り直さない。

        作り直すと、成功しているのにもう1回ぶんの費用がかかる。
        """
        _key(api_client)
        same = str(uuid.uuid4())

        first = _post(api_client, request_id=same)
        second = _post(api_client, request_id=same)

        assert second.data["result"] == first.data["result"]
        assert second.data.get("replayed") is True

    def test_a_retry_after_failure_is_a_new_try(self, api_client, broken_ai):
        """失敗したあとに同じ id で押し直すのは、新しい試み。

        戻してあるので、もう一度押さえられる。
        """
        key = _key(api_client)
        before = _left(key)
        same = str(uuid.uuid4())

        _post(api_client, request_id=same)
        _post(api_client, request_id=same)

        # どちらも失敗しているので、減っていない
        assert _left(key) == before


class TestRunningOut:
    def test_it_stops_at_zero(self, api_client, mock_ai):
        """使い切ったら止まる（CASE 9）。"""
        key = _key(api_client)
        AiCreditBalance.objects.filter(
            learner_key=key, action_type=AiActionType.TEXT
        ).update(available=0)

        response = _post(api_client)

        assert response.status_code == 429
        assert response.data["code"] == "FREE_CREDITS_EXHAUSTED"

    def test_it_does_not_sound_like_a_breakage(self, api_client, mock_ai):
        """機械的な文言を出さない。

        押し直せば直るものではないので、「失敗しました」と言わない。
        """
        key = _key(api_client)
        AiCreditBalance.objects.filter(learner_key=key).update(available=0)

        detail = _post(api_client).data["errors"]["detail"][0]

        for banned in ["Quota", "Credit", "Limit", "上限", "エラー"]:
            assert banned not in detail
        assert "また明日" in detail

    def test_only_one_of_two_at_the_last_credit(self, mock_ai):
        """残り1で2本来たら、通るのは1本（CASE 8）。

        押さえるのは条件付き UPDATE 1文なので、読んでから書く隙間が無い。
        """
        key = uuid.uuid4()
        credits.ensure_ready(key)
        AiCreditBalance.objects.filter(learner_key=key).update(available=1)

        first = credits.reserve(key, AiActionType.TEXT, uuid.uuid4())
        with pytest.raises(credits.NoCreditsLeft):
            credits.reserve(key, AiActionType.TEXT, uuid.uuid4())

        assert first.status == AiCreditStatus.RESERVED
        assert _left(key) == 0


class TestReservationsDoNotLeak:
    def test_an_abandoned_reservation_comes_back(self, settings):
        """閉じられないまま残った予約は、時間が経てば戻る。

        予約したあとにプロセスが落ちると `RESERVED` の行が残り、
        その人の持ち分が減ったままになる。
        """
        key = uuid.uuid4()
        credits.ensure_ready(key)
        before = _left(key)

        credits.reserve(key, AiActionType.TEXT, uuid.uuid4())
        assert _left(key) == before - 1

        # 期限切れにする
        AiCreditLedger.objects.filter(learner_key=key).update(
            created_at=timezone.now()
            - timedelta(seconds=settings.AI_CREDIT_RESERVATION_TTL_SECONDS + 1)
        )

        assert credits.balance_of(key, AiActionType.TEXT) == before

    def test_closing_twice_does_not_give_two_back(self):
        """同じ予約を二度閉じても、戻るのは1つ。

        失敗の処理と期限切れの掃除が同時に走ることがある。
        """
        key = uuid.uuid4()
        credits.ensure_ready(key)
        before = _left(key)

        entry = credits.reserve(key, AiActionType.TEXT, uuid.uuid4())
        credits.release(entry)
        credits.release(entry)

        assert _left(key) == before


class TestSignedInLearners:
    def test_they_are_not_counted_against_the_free_stock(
        self, api_client, django_user_model, mock_ai
    ):
        """登録した人の文章は、持ち分では数えない。

        上限は `AI_DAILY_REQUEST_LIMIT_USER`（1日50回）のまま。
        登録したら「毎日たくさん試せる」に変わる線を残す。
        """
        user = django_user_model.objects.create_user(
            username="member@example.com",
            email="member@example.com",
            password="a-long-enough-passphrase",
        )
        key = _key(api_client)
        before = _left(key)
        api_client.force_authenticate(user=user)

        _post(api_client)

        assert _left(key) == before
