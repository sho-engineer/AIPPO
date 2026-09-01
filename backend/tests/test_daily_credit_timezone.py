"""毎日のぶんを、**その人の暦の 00:00** で配る。

なぜ要るか
----------
前はサーバーの時計（Asia/Tokyo）で切っていた。クアラルンプールの人は
毎日 23:00 に日が変わることになり、夜に少しだけ触る人は1日ぶんを
丸ごと落とす。シンガポールも、ロンドンも、同じ理由でずれる。

「最後に使ってから24時間後」でもない。00:00 で切るからこそ、
画面に「また明日」と書ける。

ここで見張るもの
----------------
1. 席ごとに、日が変わる瞬間が違うこと
2. 一度決めた席が、要求のたびに推し直されないこと
   （VPN を切り替えるだけで席が動くと、毎日のぶんが再び配られる）
3. 席が動いても、**同じ1日に二度配られない**こと
4. 席を偽っても、無限には先取りできないこと
5. DBへ入る時刻は UTC のままであること

3 と 4 は、この仕組みでいちばん壊れやすいところ。毎日のぶんは
`(鍵, 種類, daily, その日の日付)` で一意にしてあるので、
**日付が動けば鍵が変わり、もう一度配られる。**
"""

from __future__ import annotations

import datetime as dt
import uuid
import zoneinfo

import pytest
from django.test import RequestFactory

from apps.lessons.models import (
    AiActionType,
    AiCreditBalance,
    AiCreditGrant,
    LearnerTimezone,
    TimezoneSource,
)
from apps.lessons.services import credits, localtime

pytestmark = pytest.mark.django_db


@pytest.fixture
def mock_ai(settings):
    """作り物の AI。成功を返す。"""
    settings.AI_PROVIDER = "mock"
    return settings


def _utc(year, month, day, hour=0, minute=0) -> dt.datetime:
    return dt.datetime(
        year, month, day, hour, minute, tzinfo=dt.UTC
    )


"""時計を止める瞬間。

東京は UTC+9、ホノルルは UTC-10。**19時間離れているが、1日じゅう
日付が違うわけではない**——UTC の 10:00〜15:00 は、どちらも同じ暦日
になる。その5時間に走らせると「旅行しても二度配らない」という検査は
何も確かめておらず、「東へ飛べば次の日が配られる」ほうは落ちる
（実際に 11:00 UTC で落ちた）。

止める先は 00:00 UTC。東京は 9/1 の朝、ホノルルは 8/31 の昼。
見たかったのはこの状況で、時刻を止めない限り作れない。
"""
FROZEN = dt.datetime(2026, 9, 1, 0, 0, tzinfo=dt.UTC)


@pytest.fixture
def frozen_clock(monkeypatch):
    """`timezone.now()` を FROZEN に固定する。

    差し替えるのは `django.utils.timezone` の属性なので、これを
    読んでいる側（`localtime` も `credits` も）すべてに効く。
    """
    monkeypatch.setattr(localtime.timezone, "now", lambda: FROZEN)
    return FROZEN


def _seat(learner_key: uuid.UUID, name: str, source=TimezoneSource.BROWSER) -> None:
    LearnerTimezone.objects.update_or_create(
        learner_key=learner_key, defaults={"name": name, "source": source}
    )


def _available(learner_key: uuid.UUID) -> int:
    row = AiCreditBalance.objects.filter(
        learner_key=learner_key, action_type=AiActionType.TEXT
    ).first()
    return row.available if row else 0


def _daily_grants(learner_key: uuid.UUID) -> list[dt.date]:
    return list(
        AiCreditGrant.objects.filter(learner_key=learner_key, reason="daily")
        .order_by("on_date")
        .values_list("on_date", flat=True)
    )


# --------------------------------------------------------------- 席の決め方


class TestWhichSeat:
    """どこから席が分かるか。**上の出どころが勝つ。**"""

    def _request(self, **headers):
        return RequestFactory().get("/api/v1/ai/generate/", **headers)

    def test_browser_wins(self):
        request = self._request(
            HTTP_X_AIPPO_TIMEZONE="Asia/Kuala_Lumpur",
            HTTP_CF_IPCOUNTRY="JP",
        )
        assert localtime.detect(request) == (
            "Asia/Kuala_Lumpur",
            TimezoneSource.BROWSER,
        )

    def test_cdn_timezone_when_browser_is_silent(self):
        request = self._request(HTTP_X_VERCEL_IP_TIMEZONE="Asia/Singapore")
        assert localtime.detect(request) == ("Asia/Singapore", TimezoneSource.GEO)

    @pytest.mark.parametrize(
        ("country", "expected"),
        [("JP", "Asia/Tokyo"), ("MY", "Asia/Kuala_Lumpur"), ("SG", "Asia/Singapore")],
    )
    def test_country_when_only_the_country_is_known(self, country, expected):
        request = self._request(HTTP_CF_IPCOUNTRY=country)
        assert localtime.detect(request) == (expected, TimezoneSource.GEO)

    def test_default_when_nothing_is_known(self):
        assert localtime.detect(self._request()) == (
            "Asia/Tokyo",
            TimezoneSource.DEFAULT,
        )

    def test_a_country_split_across_seats_is_not_guessed(self):
        """アメリカは1国4席。**当てずっぽうで保存しない。**

        国は当たっているのに席は外れている、を自信たっぷりに保存する
        より、既定のままでブラウザが言ってくるのを待つほうがよい。
        """
        request = self._request(HTTP_CF_IPCOUNTRY="US")
        assert localtime.detect(request) == ("Asia/Tokyo", TimezoneSource.DEFAULT)

    def test_a_made_up_seat_name_is_ignored(self):
        """ヘッダは誰でも好きな値を入れられる。

        知らない名前を保存すると、次に読むたびに変換が落ちて、
        その人だけ日付が決まらなくなる。
        """
        request = self._request(HTTP_X_AIPPO_TIMEZONE="Mars/Olympus_Mons")
        assert localtime.detect(request) == ("Asia/Tokyo", TimezoneSource.DEFAULT)

    def test_a_very_long_header_is_ignored(self):
        request = self._request(HTTP_X_AIPPO_TIMEZONE="A" * 500)
        assert localtime.detect(request) == ("Asia/Tokyo", TimezoneSource.DEFAULT)


class TestRemembering:
    """覚え方。**弱い出どころが強い出どころを押しのけない。**"""

    def _request(self, **headers):
        return RequestFactory().get("/", **headers)

    def test_the_first_visit_is_remembered(self):
        key = uuid.uuid4()
        localtime.remember(
            key, self._request(HTTP_X_AIPPO_TIMEZONE="Asia/Singapore")
        )

        row = LearnerTimezone.objects.get(learner_key=key)
        assert row.name == "Asia/Singapore"
        assert row.source == TimezoneSource.BROWSER

    def test_geo_does_not_overwrite_what_the_browser_said(self):
        """ここが VPN 対策の要。

        接続元から推した席が、本人のブラウザが言った席を押しのけると、
        VPN を切り替えるだけで席が動く。席が動けば日付が動き、
        日付が動けば毎日のぶんがもう一度配られる。
        """
        key = uuid.uuid4()
        localtime.remember(
            key, self._request(HTTP_X_AIPPO_TIMEZONE="Asia/Tokyo")
        )

        localtime.remember(key, self._request(HTTP_CF_IPCOUNTRY="SG"))

        assert LearnerTimezone.objects.get(learner_key=key).name == "Asia/Tokyo"

    def test_the_default_does_not_overwrite_anything(self):
        key = uuid.uuid4()
        localtime.remember(key, self._request(HTTP_CF_IPCOUNTRY="MY"))

        localtime.remember(key, self._request())

        assert (
            LearnerTimezone.objects.get(learner_key=key).name == "Asia/Kuala_Lumpur"
        )

    def test_moving_house_is_allowed(self):
        """引っ越しや移住はある。同じ強さなら入れ替える。

        入れ替わっても二度は配られない（日付が戻らないため。下の
        `TestTravelling`）。
        """
        key = uuid.uuid4()
        localtime.remember(key, self._request(HTTP_X_AIPPO_TIMEZONE="Asia/Tokyo"))

        localtime.remember(
            key, self._request(HTTP_X_AIPPO_TIMEZONE="Asia/Singapore")
        )

        assert LearnerTimezone.objects.get(learner_key=key).name == "Asia/Singapore"


# ------------------------------------------------------------ 日が変わる瞬間


class TestWhenTheDayTurns:
    """席ごとに、日が変わる瞬間が違う。"""

    @pytest.mark.parametrize(
        ("seat", "expected"),
        [
            # 2026-08-31 16:30 UTC のとき
            ("Asia/Tokyo", dt.date(2026, 9, 1)),  # +09:00 → もう 9/1 の 01:30
            ("Asia/Singapore", dt.date(2026, 9, 1)),  # +08:00 → 9/1 の 00:30
            ("Asia/Kuala_Lumpur", dt.date(2026, 9, 1)),  # +08:00 → 9/1 の 00:30
            ("Europe/London", dt.date(2026, 8, 31)),  # +01:00 → まだ 8/31 の 17:30
        ],
    )
    def test_the_local_date_follows_the_seat(self, seat, expected):
        key = uuid.uuid4()
        _seat(key, seat)

        assert (
            localtime.local_date_for(key, now=_utc(2026, 8, 31, 16, 30)) == expected
        )

    def test_kuala_lumpur_gets_a_full_evening(self):
        """23:00 に触っても、まだ同じ日。

        前はサーバーの時計（Asia/Tokyo）で切っていたので、ここで
        日が変わっていた。夜に少しだけ触る人が、1日ぶんを落としていた。
        """
        key = uuid.uuid4()
        _seat(key, "Asia/Kuala_Lumpur")

        # 現地 9/1 の 22:00 と 23:30。どちらも 9/1 のまま
        evening = localtime.local_date_for(key, now=_utc(2026, 9, 1, 14, 0))
        late = localtime.local_date_for(key, now=_utc(2026, 9, 1, 15, 30))

        assert evening == late == dt.date(2026, 9, 1)

    def test_no_seat_falls_back_to_tokyo(self):
        assert localtime.local_date_for(
            uuid.uuid4(), now=_utc(2026, 8, 31, 16, 30)
        ) == dt.date(2026, 9, 1)

    def test_next_reset_is_the_local_midnight(self):
        """「24時間後」ではなく、**次の 00:00**。"""
        key = uuid.uuid4()
        _seat(key, "Asia/Singapore")

        # 現地 9/1 の 20:00（= 12:00 UTC）→ 次は 9/2 の 00:00（= 9/1 16:00 UTC）
        assert localtime.local_midnight_utc(
            key, now=_utc(2026, 9, 1, 12, 0)
        ) == _utc(2026, 9, 1, 16, 0)


# ------------------------------------------------------- 毎日のぶんの配り方


class TestGrantingByLocalDay:
    def test_two_seats_turn_the_day_at_different_moments(
        self, settings, frozen_clock
    ):
        """同じ瞬間に、片方はもう新しい日、片方はまだ同じ日。"""
        settings.FREE_DAILY_TEXT_ACTIONS = 3
        settings.FREE_MAX_DAILY_TEXT_ACTIONS = 6

        tokyo, honolulu = uuid.uuid4(), uuid.uuid4()
        _seat(tokyo, "Asia/Tokyo")
        _seat(honolulu, "Pacific/Honolulu")

        credits.grant_daily(tokyo)
        credits.grant_daily(honolulu)

        # どちらも初回なので配られる
        assert len(_daily_grants(tokyo)) == 1
        assert len(_daily_grants(honolulu)) == 1
        # **日付そのものが違う。** ここを見ないと、この検査は
        # 「初回は配られる」としか言っていない
        assert _daily_grants(tokyo) == [dt.date(2026, 9, 1)]
        assert _daily_grants(honolulu) == [dt.date(2026, 8, 31)]

    def test_the_same_local_day_is_granted_once(self, settings):
        settings.FREE_DAILY_TEXT_ACTIONS = 3
        settings.FREE_MAX_DAILY_TEXT_ACTIONS = 6

        key = uuid.uuid4()
        _seat(key, "Asia/Singapore")

        assert credits.grant_daily(key) is True
        assert credits.grant_daily(key) is False
        assert credits.grant_daily(key) is False

        assert _available(key) == 3
        assert len(_daily_grants(key)) == 1


class TestTravelling:
    """旅行しても、同じ1日に二度は配られない。"""

    def test_flying_west_does_not_grant_twice(self, settings, frozen_clock):
        """東京の 9/1 朝は、ホノルルではまだ 8/31。

        席をそのまま信じると、その人の「今日」が昨日へ戻り、
        `(鍵, text, daily, 日付)` の鍵が変わって**もう一度配られる**。
        """
        settings.FREE_DAILY_TEXT_ACTIONS = 3
        settings.FREE_MAX_DAILY_TEXT_ACTIONS = 99

        key = uuid.uuid4()
        _seat(key, "Asia/Tokyo")
        credits.grant_daily(key)
        first = _available(key)

        # 飛行機を降りてブラウザの席が変わった。現地はまだ前日
        _seat(key, "Pacific/Honolulu")
        credits.grant_daily(key)

        assert _available(key) == first
        assert len(_daily_grants(key)) == 1

    def test_flying_east_still_grants_the_next_day(self, settings, frozen_clock):
        """先へ進むぶんには普通に配る。止めたいのは**戻り**だけ。"""
        settings.FREE_DAILY_TEXT_ACTIONS = 3
        settings.FREE_MAX_DAILY_TEXT_ACTIONS = 99

        key = uuid.uuid4()
        _seat(key, "Pacific/Honolulu")
        credits.grant_daily(key)

        _seat(key, "Asia/Tokyo")
        credits.grant_daily(key)

        assert len(_daily_grants(key)) == 2
        assert _available(key) == 6

    def test_a_first_visitor_who_never_said_a_seat_is_still_protected(self, settings, frozen_clock):
        """席を一度も言ってこなかった人にも、境目の控えは要る。

        控えを残さないと、この順で二度配られる。

            1. 席の行が無いまま、東京の 9/1 ぶんを受け取る
            2. ホノルルから来て、席の行ができる（控えは空）
            3. その人の今日は 8/31。**控えが空なので戻りを止められない**
        """
        settings.FREE_DAILY_TEXT_ACTIONS = 3
        settings.FREE_MAX_DAILY_TEXT_ACTIONS = 99

        key = uuid.uuid4()
        # 席をまだ言っていない（既定の Asia/Tokyo で動く）
        assert not LearnerTimezone.objects.filter(learner_key=key).exists()
        credits.grant_daily(key)
        first = _available(key)

        _seat(key, "Pacific/Honolulu")
        credits.grant_daily(key)

        assert _available(key) == first
        assert len(_daily_grants(key)) == 1

    def test_bouncing_between_seats_does_not_farm_credits(self, settings, frozen_clock):
        """行ったり来たりしても増えない。"""
        settings.FREE_DAILY_TEXT_ACTIONS = 3
        settings.FREE_MAX_DAILY_TEXT_ACTIONS = 99

        key = uuid.uuid4()
        for seat in [
            "Asia/Tokyo",
            "Pacific/Honolulu",
            "Asia/Tokyo",
            "Europe/London",
            "Asia/Tokyo",
        ]:
            _seat(key, seat)
            credits.grant_daily(key)

        # 東京がいちばん先の日付。そこまでの1日ぶんしか受け取れない
        assert _available(key) == 3
        assert len(_daily_grants(key)) == 1


class TestLyingAboutTheSeat:
    """席を偽っても、無限には先取りできない。

    先取りの幅を決めているのは**名前を確かめること**。実在する席の
    UTC とのずれは −12〜+14 時間しかないので、実在する名前しか
    通さない限り、名乗れる日付は前後1日に収まる。
    """

    def test_a_made_up_seat_never_reaches_the_stored_row(self):
        """名前を確かめずに受け取ると、ここが破れる。

        「UTC+300」のような席を名乗れれば、いくらでも先の日付を
        先取りできる。入口（`detect`）で弾いているので、保存にも
        判定にも届かない。
        """
        request = RequestFactory().get("/", HTTP_X_AIPPO_TIMEZONE="Etc/GMT-300")
        key = uuid.uuid4()

        localtime.remember(key, request)

        assert LearnerTimezone.objects.get(learner_key=key).name == "Asia/Tokyo"

    def test_every_real_seat_lands_within_a_day_of_utc(self):
        """実在する席から出る日付は、UTC の今日の前後1日に必ず収まる。

        これが「先取りは1日まで」の根拠。tz データベースが将来
        もっと極端な席を足したら、ここが落ちて気づける。
        """
        now = _utc(2026, 9, 1, 12, 0)
        utc_today = now.date()
        key = uuid.uuid4()

        for seat in sorted(zoneinfo.available_timezones()):
            _seat(key, seat)
            local = localtime.local_date_for(key, now=now)
            assert abs((local - utc_today).days) <= 1, seat

    def test_seat_hopping_gives_at_most_one_extra_day(self, settings):
        """東の端と西の端を何度往復しても、増えるのは1日ぶんまで。"""
        settings.FREE_DAILY_TEXT_ACTIONS = 3
        settings.FREE_MAX_DAILY_TEXT_ACTIONS = 99

        key = uuid.uuid4()
        _seat(key, "Etc/GMT+12")  # UTC−12。世界でいちばん遅い
        credits.grant_daily(key)

        for _ in range(10):
            _seat(key, "Pacific/Kiritimati")  # UTC+14
            credits.grant_daily(key)
            _seat(key, "Etc/GMT+12")
            credits.grant_daily(key)

        # 西の端の「今日」と東の端の「明日」で、最大2日ぶん
        assert len(_daily_grants(key)) <= 2
        assert _available(key) <= 6


class TestTimestampsStayUtc:
    def test_grants_are_stored_in_utc(self, settings):
        """DBの時刻は UTC のまま。席は**判定のときだけ**使う。"""
        settings.FREE_DAILY_TEXT_ACTIONS = 3
        settings.FREE_MAX_DAILY_TEXT_ACTIONS = 6

        key = uuid.uuid4()
        _seat(key, "Asia/Kuala_Lumpur")
        credits.grant_daily(key)

        row = AiCreditGrant.objects.get(learner_key=key, reason="daily")
        assert row.created_at.utcoffset() == dt.timedelta(0)


class TestThroughTheApi:
    """入口から通したときも、席が覚えられていること。"""

    def test_the_header_reaches_the_stored_seat(self, api_client, mock_ai, settings):
        settings.GUEST_INITIAL_TEXT_ACTIONS = 10

        response = api_client.post(
            "/api/v1/ai/generate/",
            {
                "lesson_id": "rewrite_text",
                "step_id": "generate_first",
                "action": "rewrite",
                "input": {
                    "original_text": (
                        "先日の件ですが、諸事情ございまして、追ってご連絡差し上げます。"
                    ),
                    "audience": "社外のお客様",
                    "tone": "ていねいに",
                    "length": "3行くらい",
                },
                "request_id": str(uuid.uuid4()),
            },
            format="json",
            HTTP_X_AIPPO_TIMEZONE="Asia/Kuala_Lumpur",
        )
        assert response.status_code == 200

        key = uuid.UUID(api_client.cookies["learner_key"].value)
        assert (
            LearnerTimezone.objects.get(learner_key=key).name == "Asia/Kuala_Lumpur"
        )
