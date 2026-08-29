"""登録・ログイン・パスワード再設定の連打を止める。

なぜ要るか
----------
AI の実行回数には上限があるが、それを通るのは AI を呼ぶ経路だけ。
認証の経路は素通りしていた。公開すると、次の3つがそのまま通る。

- ログインへのパスワード総当たり
- 他人のメールアドレスへ、再設定の案内を何百通も送りつける
- 登録の大量作成で、1人あたりの AI 上限を回避する

2つの軸で数える
---------------
接続元だけで数えると、複数の場所から1つのアカウントを狙う形を止められない。
相手だけで数えると、1か所から多数のアカウントを順に試す形を止められない。
どちらも数え、**どちらかが上限に達したら断る**。

保存するもの
------------
IPアドレスもメールアドレスも、そのままでは保存しない。
SECRET_KEY を鍵にした HMAC だけを持つ（憲章 原則 VI）。
元の値は復元できず、「同じ相手か」の判定にだけ使える。

止め方
------
断るときも、そのメールアドレスが登録済みかどうかは漏らさない。
数えるのは「来た回数」で、相手が実在するかは見ない。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from django.conf import settings
from django.db import IntegrityError
from django.db.models import F
from django.utils import timezone

from apps.accounts.models import AuthThrottle
from apps.lessons.services.quota import client_ip, fingerprint

logger = logging.getLogger(__name__)


def cooldown_seconds(action: str) -> int:
    """**続けて送るまでの間隔。** 0以下なら間隔なし。

    上の `Rule`（窓ごとの回数）とは別の軸。窓の数えは「1時間に5回」の
    ような総量を押さえるもので、**連続した2回のあいだ**は押さえない。
    窓が切り替わる瞬間をまたげば、続けて2通送れてしまう。

    再設定の案内は他人の受信箱へ届くので、総量とは別に間隔も要る。
    ここは滑り窓ではなく、**最後に送った時刻からの経過**で見る。
    """
    return int(getattr(settings, f"AUTH_COOLDOWN_{action.upper()}", 0))


@dataclass(frozen=True)
class Rule:
    """1つの用途の上限。0以下なら「上限なし」。

    接続元と宛先で数を分ける。同じにしてはいけない。

    会社や学校からは、何人もが**同じ接続元**に見える。接続元の上限を
    宛先と同じ厳しさにすると、隣の席の人が数回試しただけで、
    その場の全員が締め出される。研修で使う場面ではこれが起きやすい。

    狙い撃ちを止めるのは宛先ごとの数え。接続元の数えは、
    多数のアカウントを順に試す形に効かせる**粗い網**として置く。
    """

    per_source: int
    per_target: int
    window_seconds: int


def _rule(action: str, source: int, target: int, window: int) -> Rule:
    """環境変数で上げ下げできるようにする。

    手元の確認や負荷試験で外せないと、上限そのものが検証できない。
    """
    prefix = f"AUTH_THROTTLE_{action.upper()}"
    return Rule(
        per_source=int(getattr(settings, f"{prefix}_MAX_SOURCE", source)),
        per_target=int(getattr(settings, f"{prefix}_MAX_TARGET", target)),
        window_seconds=int(getattr(settings, f"{prefix}_WINDOW", window)),
    )


def rules() -> dict[str, Rule]:
    """用途ごとの上限。

    数字の根拠
    ----------
    - ログイン … 宛先ごとに15分で10回。打ち間違いは数回で収まり、
                 総当たりには足りない。接続元は30回（相席の巻き添えを避ける）
    - 再設定  … 宛先ごとに1時間で5回。届かないと思って押し直す人は止めず、
                 他人への送りつけは成立しなくなる。接続元は20回
    - 登録    … 宛先という概念が無い（毎回ちがうメールアドレス）ので
                 接続元だけ。1時間に10回。研修で数人まとめて登録する場面を
                 通しつつ、機械的な大量作成は当たる
    - 2段階   … **いちばん狭くする。** 6桁は当てられる短さで、
                 100万通りを15分で回されると当たってしまう。
                 打ち間違いと時計のずれで数回は要るので、10回で切る
    """
    return {
        "signin": _rule("signin", source=30, target=10, window=15 * 60),
        "password_reset": _rule("password_reset", source=20, target=5, window=60 * 60),
        "signup": _rule("signup", source=10, target=0, window=60 * 60),
        "mfa": _rule("mfa", source=20, target=10, window=15 * 60),
    }


class TooManyAttempts(Exception):
    """上限に達した。`retry_after` は次に試せるまでの秒数。"""

    def __init__(self, retry_after: int) -> None:
        super().__init__(f"retry after {retry_after}s")
        self.retry_after = retry_after


def _window_start(rule: Rule):
    """いまの窓の開始時刻。窓の長さで切り捨てる。"""
    now = timezone.now()
    seconds = int(now.timestamp()) // rule.window_seconds * rule.window_seconds
    return timezone.datetime.fromtimestamp(seconds, tz=now.tzinfo)


def _consume(scope: str, limit: int, rule: Rule) -> None:
    """1つ消費する。上限に達していれば増やさずに例外。

    数え上げは **UPDATE 1文**。「読んでから書く」形にすると行を掴んだまま
    待つことになり、同時に来たときに詰まる（`services/quota.py` と同じ理由）。
    """
    if limit <= 0:
        return

    start = _window_start(rule)

    updated = AuthThrottle.objects.filter(
        scope=scope, window_start=start, count__lt=limit
    ).update(count=F("count") + 1)
    if updated:
        return

    if AuthThrottle.objects.filter(scope=scope, window_start=start).exists():
        raise TooManyAttempts(_retry_after(start, rule))

    try:
        AuthThrottle.objects.create(scope=scope, window_start=start, count=1)
    except IntegrityError:
        # ほぼ同時に別の要求が作った。作られた行へもう一度試す
        updated = AuthThrottle.objects.filter(
            scope=scope, window_start=start, count__lt=limit
        ).update(count=F("count") + 1)
        if not updated:
            raise TooManyAttempts(_retry_after(start, rule)) from None


def _retry_after(start, rule: Rule) -> int:
    elapsed = (timezone.now() - start).total_seconds()
    return max(1, int(rule.window_seconds - elapsed))


def _counters(action: str, request, identity: str | None, rule: Rule) -> list[tuple[str, int]]:
    """数える相手と、それぞれの上限。"""
    counters = [(f"{action}:ip:{fingerprint(client_ip(request))}", rule.per_source)]
    if identity:
        counters.append(
            (f"{action}:id:{fingerprint(identity.strip().lower())}", rule.per_target)
        )
    return counters


#: 間隔を数えるための、窓の数えとは別の場所。
#: 同じ表を使うが、`window_start` の意味が違う（窓の頭ではなく
#: **最後に送った時刻**）。混ざらないように前置きを分ける。
_COOLDOWN_PREFIX = "cooldown"


def _consume_cooldown(scope: str, seconds: int) -> None:
    """最後の1回から `seconds` 経つまで断る。

    経過で見るので、窓の切り替わりをまたいでも抜けられない。

    競合したときは断る側へ倒す
    --------------------------
    「読んで、まだなら書く」のあいだに別の要求が入ることがある。
    書き込みが自分のものでなかったら、相手が先に送ったということなので
    こちらは断る。取りこぼして2通送るより、1通遅れるほうが害が小さい。
    """
    if seconds <= 0:
        return

    now = timezone.now()
    last = (
        AuthThrottle.objects.filter(scope=scope)
        .order_by("-window_start")
        .values_list("window_start", flat=True)
        .first()
    )

    if last is not None:
        elapsed = (now - last).total_seconds()
        if elapsed < seconds:
            raise TooManyAttempts(max(1, int(seconds - elapsed)))

        # 冷めた。時刻を進める。進められるのは1つの要求だけ
        updated = AuthThrottle.objects.filter(scope=scope, window_start=last).update(
            window_start=now, count=F("count") + 1
        )
        if not updated:
            raise TooManyAttempts(seconds)
        return

    try:
        AuthThrottle.objects.create(scope=scope, window_start=now, count=1)
    except IntegrityError:
        # ほぼ同時に別の要求が作った。先に送ったのは相手
        raise TooManyAttempts(seconds) from None


def consume(action: str, request, identity: str | None = None) -> None:
    """1回ぶん消費する。上限に達していれば `TooManyAttempts`。

    `identity` は狙われている相手（メールアドレス）。
    実在するかは見ない。見ると、断り方で登録済みかどうかが漏れる。

    間隔（`cooldown_seconds`）を**先に**見る。窓の数えを先に増やすと、
    間隔で断られた要求まで総量を減らしてしまい、待って押し直した人が
    そのぶん早く上限に当たる。断る要求は数に入れない。
    """
    interval = cooldown_seconds(action)
    if interval > 0 and identity:
        _consume_cooldown(
            f"{action}:{_COOLDOWN_PREFIX}:{fingerprint(identity.strip().lower())}",
            interval,
        )

    rule = rules()[action]
    for scope, limit in _counters(action, request, identity, rule):
        _consume(scope, limit, rule)


def clear(action: str, request, identity: str | None = None) -> None:
    """数えたぶんを消す。**成功したときに呼ぶ。**

    呼ばないと、打ち間違いを数回したあとで正しく入れた人が、
    次に開いたときにまだ上限の近くにいることになる。
    """
    rule = rules()[action]
    AuthThrottle.objects.filter(
        scope__in=[scope for scope, _ in _counters(action, request, identity, rule)],
        window_start=_window_start(rule),
    ).delete()

    """
    間隔の記録は**消さない。**

    ここが呼ばれるのは「成功したとき」。ログインの打ち間違いを
    帳消しにするのは正しいが、間隔のほうは「もう1通送った」という
    事実そのもので、成功したからこそ残す必要がある。
    消すと、送信に成功した直後だけ間隔を空けずに送り直せてしまう。
    """
