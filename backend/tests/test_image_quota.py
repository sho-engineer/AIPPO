"""画像の1日あたり上限（文章とは別枠）。

なぜ画像を別に数えるか
----------------------
画像1枚は文章1回の**数十倍**かかる（docs/image-lessons.md）。文章の枠を
そのまま使うと、文章の目安で決めた回数がそのまま画像の枚数を許すことに
なり、1日の請求が桁で変わる。

別枠にするのは費用のためだけではない。混ぜると、画像を数枚作った人が
その日の**文章のレッスンまで使えなくなる**。逆も同じ。片方の使いすぎで
もう片方が止まるのは、学習者から見て理由が分からない。

画像のレッスン（Day7・Day8）はまだ開いていない。**歯止めを先に置く**の
は順番の問題で、無いまま口を開けると開けた初日の請求が読めない。

ここで確かめること:

  1. 文章と画像が食い合わないこと（どちらの向きも）
  2. 上限に達したら止まること（全体・接続元・学習者の3段とも）
  3. 弾いたときに、広いほうの消費を戻していること
  4. 文章側のカウンタ名を変えていないこと（動いている枠を作り直さない）
"""

from __future__ import annotations

import os
import uuid

import pytest
from django.utils import timezone

from apps.lessons.models import AiUsageCounter
from apps.lessons.services import quota
from apps.lessons.services.quota import QuotaExceeded, RunKind


class _Request:
    """`consume_ai_run` が見るところだけを持つ、最小のリクエスト。

    本物を組み立てると、上限の話と関係のない都合（Cookie・認証・URL）が
    テストに入り込む。ここで確かめたいのは数え方だけ。
    """

    def __init__(self, ip: str = "203.0.113.9", learner_key=None, signed_in: bool = False):
        self.META = {"REMOTE_ADDR": ip}
        self.learner_key = learner_key or uuid.uuid4()
        self.user = _User(signed_in)


class _User:
    def __init__(self, authenticated: bool) -> None:
        self.is_authenticated = authenticated


def _count(scope: str) -> int:
    row = AiUsageCounter.objects.filter(
        scope=scope, date=timezone.localdate()
    ).first()
    return row.count if row else 0


@pytest.fixture
def limits(settings):
    """数えられる大きさに絞る。既定値そのものはここでは見ない。"""
    settings.AI_RUNS_PER_DAY = 100
    settings.AI_RUNS_PER_IP_PER_DAY = 100
    settings.AI_DAILY_REQUEST_LIMIT_USER = 100
    settings.AI_DAILY_REQUEST_LIMIT_GUEST = 100

    settings.AI_IMAGE_RUNS_PER_DAY = 10
    settings.AI_IMAGE_RUNS_PER_IP_PER_DAY = 5
    settings.AI_IMAGE_DAILY_REQUEST_LIMIT_USER = 4
    settings.AI_IMAGE_DAILY_REQUEST_LIMIT_GUEST = 2
    return settings


@pytest.mark.django_db
class TestTheTwoBudgetsDoNotShare:
    def test_making_images_does_not_use_up_the_writing_lessons(self, limits):
        """画像を上限まで作っても、文章はそのまま使える。

        ここが繋がっていると、画像を数枚作った人が、その日の文章の
        レッスンまで使えなくなる。理由が画面から分からない。
        """
        request = _Request()
        for _ in range(limits.AI_IMAGE_DAILY_REQUEST_LIMIT_GUEST):
            quota.consume_image_run(request)

        with pytest.raises(QuotaExceeded):
            quota.consume_image_run(request)

        # 文章は1回も使っていないので、まだ通る
        quota.consume_ai_run(request)

    def test_writing_does_not_use_up_the_image_budget(self, limits):
        request = _Request()
        for _ in range(limits.AI_IMAGE_DAILY_REQUEST_LIMIT_GUEST + 3):
            quota.consume_ai_run(request)

        # 画像はまだ1枚も作っていない
        quota.consume_image_run(request)

    def test_they_are_counted_in_separate_rows(self, limits):
        request = _Request()
        quota.consume_ai_run(request)
        quota.consume_image_run(request)

        text = quota.learner_scope(request.learner_key)
        image = f"{quota.IMAGE_PREFIX}{text}"

        assert _count(text) == 1
        assert _count(image) == 1

    def test_the_text_counter_name_did_not_change(self, limits):
        """動いている枠を作り直さない。

        文章側のカウンタ名を変えると、入れ替えたその日だけ上限が
        リセットされ、1日の請求が読めなくなる。
        """
        request = _Request()
        quota.consume_ai_run(request)

        assert _count(quota.learner_scope(request.learner_key)) == 1
        assert _count(AiUsageCounter.GLOBAL_SCOPE) == 1
        assert _count(quota.fingerprint("203.0.113.9")) == 1


@pytest.mark.django_db
class TestEachTierStops:
    def test_the_learner_tier_stops(self, limits):
        request = _Request()
        for _ in range(limits.AI_IMAGE_DAILY_REQUEST_LIMIT_GUEST):
            quota.consume_image_run(request)

        with pytest.raises(QuotaExceeded) as caught:
            quota.consume_image_run(request)
        assert caught.value.scope == quota.QuotaScope.LEARNER

    def test_signing_in_raises_the_learner_tier(self, limits):
        """登録した人のほうが多く作れる。登録する理由を残す。"""
        guest = _Request()
        member = _Request(signed_in=True)

        for _ in range(limits.AI_IMAGE_DAILY_REQUEST_LIMIT_GUEST):
            quota.consume_image_run(guest)
        with pytest.raises(QuotaExceeded):
            quota.consume_image_run(guest)

        # 同じ回数では、登録した人はまだ止まらない
        for _ in range(limits.AI_IMAGE_DAILY_REQUEST_LIMIT_GUEST):
            quota.consume_image_run(member)
        quota.consume_image_run(member)

    def test_the_ip_tier_stops_even_when_the_cookie_is_cleared(self, limits):
        """Cookie を消して作り直しても、同じ接続元なら止まる。"""
        for _ in range(limits.AI_IMAGE_RUNS_PER_IP_PER_DAY):
            # 毎回まっさらな learner_key（＝Cookie を消した人）
            quota.consume_image_run(_Request(learner_key=uuid.uuid4()))

        with pytest.raises(QuotaExceeded) as caught:
            quota.consume_image_run(_Request(learner_key=uuid.uuid4()))
        assert caught.value.scope == quota.QuotaScope.IP

    def test_the_global_tier_stops(self, limits):
        """最後の安全弁。想定外が起きても請求が跳ねない。"""
        limits.AI_IMAGE_RUNS_PER_IP_PER_DAY = 1000
        limits.AI_IMAGE_DAILY_REQUEST_LIMIT_GUEST = 1000

        for index in range(limits.AI_IMAGE_RUNS_PER_DAY):
            quota.consume_image_run(
                _Request(ip=f"198.51.100.{index}", learner_key=uuid.uuid4())
            )

        with pytest.raises(QuotaExceeded) as caught:
            quota.consume_image_run(
                _Request(ip="198.51.100.254", learner_key=uuid.uuid4())
            )
        assert caught.value.is_global


@pytest.mark.django_db
class TestRefusingDoesNotEatTheWiderBudget:
    def test_the_global_count_is_given_back_when_a_narrower_tier_refuses(self, limits):
        """狭いほうで弾いたら、先に消費した広いほうを戻す。

        戻さないと、1人が上限まで叩いただけで**全体の安全弁**が
        削られ、ほかの人が使えなくなる。
        """
        request = _Request()
        for _ in range(limits.AI_IMAGE_DAILY_REQUEST_LIMIT_GUEST):
            quota.consume_image_run(request)

        before = _count(f"{quota.IMAGE_PREFIX}{AiUsageCounter.GLOBAL_SCOPE}")
        with pytest.raises(QuotaExceeded):
            quota.consume_image_run(request)

        assert _count(f"{quota.IMAGE_PREFIX}{AiUsageCounter.GLOBAL_SCOPE}") == before


@pytest.mark.django_db
class TestWhatTheLearnerSees:
    def test_the_remaining_count_is_reported_per_kind(self, limits):
        """上限は見えていないと、当たってはじめて存在を知ることになる。"""
        request = _Request()
        quota.consume_image_run(request)

        image = quota.remaining_today(request, kind=RunKind.IMAGE)
        assert image["limit"] == limits.AI_IMAGE_DAILY_REQUEST_LIMIT_GUEST
        assert image["used"] == 1

        # 文章のほうは減っていない
        text = quota.remaining_today(request)
        assert text["used"] == 0


class TestScopeFitsTheColumn:
    """画像の印を足しても、カウンタ名が入れ物に収まっていること。

    SQLite は長さを無視して書けてしまい、PostgreSQL で初めて落ちる。
    しかも落ちるのは画像を作る直前なので、開けた初日に分かる。
    """

    def test_the_longest_image_scope_fits(self):
        scope = f"{quota.IMAGE_PREFIX}{quota.learner_scope(uuid.uuid4())}"
        limit = AiUsageCounter._meta.get_field("scope").max_length

        assert len(scope) <= limit, (
            f"画像のカウンタ名が {len(scope)} 文字で、"
            f"入れ物の {limit} 文字に収まっていない"
        )


#: 画像の上限を決めている設定。
_IMAGE_LIMIT_SETTINGS = (
    "AI_IMAGE_RUNS_PER_DAY",
    "AI_IMAGE_RUNS_PER_IP_PER_DAY",
    "AI_IMAGE_DAILY_REQUEST_LIMIT_USER",
    "AI_IMAGE_DAILY_REQUEST_LIMIT_GUEST",
)


def _shipped_default(name: str) -> bool:
    """環境変数で上書きされていない（＝出荷時の既定のまま）か。

    見るのは**出荷時の既定**だけにする。env で意図して外すのは
    その人の判断（E2E で画像を待たせたくない、など）で、
    そこまで止めると、外せない代わりに誰かが既定のほうを 0 にする。
    """
    return os.getenv(name) is None


class TestTheShippedDefaultsAreACap:
    """既定のまま動かすと、必ず上限が掛かること。

    0以下は「上限なし」として扱われる。文章では通る設定だが、
    画像でやると歯止めそのものが消える。**外すつもりの無い外し方**
    ——たとえば「とりあえず 0 にしておく」を止める。
    """

    @pytest.mark.parametrize("name", _IMAGE_LIMIT_SETTINGS)
    def test_no_image_limit_ships_switched_off(self, settings, name):
        if not _shipped_default(name):
            pytest.skip(f"{name} は環境変数で上書きされている")

        assert getattr(settings, name) > 0, (
            f"{name} の既定が上限なしになっている。"
            "画像は1枚が文章1回の数十倍かかる（docs/image-lessons.md）"
        )

    def test_a_guest_can_finish_one_lesson(self, settings):
        """1本ぶん（最初の1枚＋条件を足した1枚＋自分の課題で1枚）は作れる。

        ここを下回ると、登録前の人は画像のレッスンを1本も終えられない。
        安いほうへ倒しすぎて、教材が成立しなくなるのを止める。
        """
        if not _shipped_default("AI_IMAGE_DAILY_REQUEST_LIMIT_GUEST"):
            pytest.skip("環境変数で上書きされている")

        assert settings.AI_IMAGE_DAILY_REQUEST_LIMIT_GUEST >= 3

    def test_signing_in_gives_more_than_guests(self, settings):
        """登録した人のほうが多く作れる。登録する理由を残す。"""
        for name in (
            "AI_IMAGE_DAILY_REQUEST_LIMIT_USER",
            "AI_IMAGE_DAILY_REQUEST_LIMIT_GUEST",
        ):
            if not _shipped_default(name):
                pytest.skip(f"{name} は環境変数で上書きされている")

        assert (
            settings.AI_IMAGE_DAILY_REQUEST_LIMIT_USER
            > settings.AI_IMAGE_DAILY_REQUEST_LIMIT_GUEST
        )
