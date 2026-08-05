"""AI実行回数の上限（AI利用料の暴走を止める）。

セッション単位の上限（`MAX_ATTEMPTS_PER_SESSION`）だけでは足りない。
learner_key は Cookie なので、消せば毎回まっさらなセッションになり、
1人でいくらでもAIを実行できてしまう。公開すれば利用料は青天井になる。

そこで3段構えにする。

1. セッション単位 — 1回の練習での試行錯誤の範囲を決める（体験の設計）
2. 接続元単位・1日 — 1人が使いすぎるのを止める（悪用対策）
3. 全体・1日 — 想定外が起きても請求が跳ねないようにする（最後の安全弁）

**IPアドレスそのものは保存しない**（憲章 原則 VI）。
SECRET_KEY を鍵にした HMAC だけを持つ。元のIPは復元できない。
"""

import hmac
import logging
from hashlib import sha256

from django.conf import settings
from django.db import IntegrityError
from django.db.models import F
from django.utils import timezone

from apps.lessons.models import AiUsageCounter

logger = logging.getLogger(__name__)


class QuotaScope:
    IP = "ip"
    LEARNER = "learner"
    GLOBAL = "global"


#: 学習者ごとのカウンタにだけ付ける印。
#: IPのHMACと同じ長さの文字列なので、印が無いと区別できない。
LEARNER_PREFIX = "learner:"


class QuotaExceeded(Exception):
    """上限に達した。`scope` でどの上限かが分かる。"""

    def __init__(self, scope: str) -> None:
        super().__init__(scope)
        self.scope = scope

    @property
    def is_global(self) -> bool:
        return self.scope == QuotaScope.GLOBAL


def client_ip(request) -> str:
    """接続元のIPを取り出す。

    ロードバランサ越しの場合は X-Forwarded-For の**左端**が本来の接続元。
    ただしこのヘッダは詐称できるため、信頼するのはプロキシ配下に置くと
    明示したとき（`TRUST_FORWARDED_FOR=true`）だけにする。
    """
    if settings.TRUST_FORWARDED_FOR:
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "") or "unknown"


def fingerprint(value: str) -> str:
    """IPを復元できない形に変換する。同じIPかどうかの判定にだけ使う。"""
    return hmac.new(
        settings.SECRET_KEY.encode(), value.encode(), sha256
    ).hexdigest()


def _scope_kind(scope: str) -> str:
    if scope == AiUsageCounter.GLOBAL_SCOPE:
        return QuotaScope.GLOBAL
    if scope.startswith(LEARNER_PREFIX):
        return QuotaScope.LEARNER
    return QuotaScope.IP


def _consume(scope: str, limit: int) -> None:
    """1つ消費する。上限に達していれば増やさずに例外を投げる。

    数え上げは **UPDATE 1文** で行う。
    「読んでから書く」形にすると行を掴んだまま待つことになり、
    同時に何人も来たときに詰まって 500 になる（SQLite では特に顕著）。
    条件付き UPDATE なら、上限の判定と加算がデータベース側で一度に済む。
    """
    if limit <= 0:  # 0以下は「上限なし」として扱う
        return

    today = timezone.localdate()

    updated = AiUsageCounter.objects.filter(
        scope=scope, date=today, count__lt=limit
    ).update(count=F("count") + 1)
    if updated:
        return

    # 更新できなかったのは、行がまだ無いか、上限に達しているかのどちらか。
    if AiUsageCounter.objects.filter(scope=scope, date=today).exists():
        raise QuotaExceeded(_scope_kind(scope))

    try:
        AiUsageCounter.objects.create(scope=scope, date=today, count=1)
    except IntegrityError:
        # ほぼ同時に別のリクエストが作った。作られた行に対してもう一度試す。
        updated = AiUsageCounter.objects.filter(
            scope=scope, date=today, count__lt=limit
        ).update(count=F("count") + 1)
        if not updated:
            raise QuotaExceeded(_scope_kind(scope)) from None


def learner_scope(learner_key) -> str:
    """学習者ごとのカウンタ名。

    learner_key は Cookie なので消せば作り直せる。
    これは悪用対策ではなく、**ふつうに使っている人が
    1日に使いすぎないための目安**として置いている。
    悪用対策は接続元単位のほうが受け持つ。
    """
    return f"{LEARNER_PREFIX}{fingerprint(str(learner_key))}"


def consume_ai_run(request) -> None:
    """AIを1回実行する権利を消費する。

    上限に達していれば `QuotaExceeded` を投げる。
    呼び出し側は AI を呼ぶ**直前**に実行すること。

    消費する順は「広いほうから」。狭いほうで弾いたときは、
    先に消費した広いほうを戻す。戻さないと、1人の使いすぎで
    全体の安全弁が先に落ちてしまう。
    """
    consumed: list[str] = []

    def _take(scope: str, limit: int) -> None:
        try:
            _consume(scope, limit)
        except QuotaExceeded:
            for done in consumed:
                _release(done)
            raise
        if limit > 0:
            consumed.append(scope)

    _take(AiUsageCounter.GLOBAL_SCOPE, settings.AI_RUNS_PER_DAY)
    _take(fingerprint(client_ip(request)), settings.AI_RUNS_PER_IP_PER_DAY)

    """
    1人あたりの上限は、登録しているかどうかで変える。

    登録前に無制限で使えると、費用の見通しが立たないうえ、
    登録する理由も無くなる。逆に登録した人を絞りすぎると、
    せっかく登録したのに使えないことになる。
    """
    learner_key = getattr(request, "learner_key", None)
    if learner_key is not None:
        user = getattr(request, "user", None)
        signed_in = bool(user is not None and user.is_authenticated)
        limit = (
            settings.AI_DAILY_REQUEST_LIMIT_USER
            if signed_in
            else settings.AI_DAILY_REQUEST_LIMIT_GUEST
        )
        _take(learner_scope(learner_key), limit)


def _release(scope: str) -> None:
    """消費した1つを戻す。ここも UPDATE 1文で済ませる。"""
    AiUsageCounter.objects.filter(
        scope=scope, date=timezone.localdate(), count__gt=0
    ).update(count=F("count") - 1)


#: 上限に達したときの文言。専門用語を出さない（憲章 原則 I）。
IP_LIMIT_MESSAGE = (
    "今日はここまでにしましょう。"
    "また明日、続きから試してみてください。"
)
GLOBAL_LIMIT_MESSAGE = (
    "いまたくさんの方が使っています。"
    "少し時間をおいてから、もう一度お試しください。"
)


LEARNER_LIMIT_MESSAGE = (
    "今日はたくさん練習しましたね。"
    "続きは、また明日ここから試してみてください。"
)


def limit_message(exc: QuotaExceeded) -> str:
    if exc.is_global:
        return GLOBAL_LIMIT_MESSAGE
    if exc.scope == QuotaScope.LEARNER:
        return LEARNER_LIMIT_MESSAGE
    return IP_LIMIT_MESSAGE
