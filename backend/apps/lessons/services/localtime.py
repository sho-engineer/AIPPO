"""その人の暦。**毎日のぶんを配る境目を決める。**

何を決めているか
----------------
毎日のぶんは「最後に使ってから24時間後」ではなく、**その人の 00:00**
に配る。サーバーの時計（Asia/Tokyo）で切ると、クアラルンプールの人は
毎日 23:00 に日が変わることになり、夜に少しだけ触る人は1日ぶんを
丸ごと落とす。

DBに入る時刻は、これまでどおり全部 UTC。ここは**配るかどうかを
決める一瞬だけ**使う。保存する時刻の意味を地域ごとに変えると、
あとから集計できなくなる。

どこから分かるか（強い順）
--------------------------
    1. すでに保存してあるもの
    2. ブラウザが言ってきたもの（Intl の resolvedOptions().timeZone）
    3. 接続元から推したもの（CDN が付ける手がかり）
    4. 既定（Asia/Tokyo）

弱い出どころは、強い出どころを**上書きしない**。接続元から推した席が
本人のブラウザの席を押しのけると、VPN を切り替えるだけで席が動く。

なぜ「毎回推し直さない」が要るのか
----------------------------------
席が動くと、その人の「今日」が動く。毎日のぶんは
`(鍵, 種類, daily, その日の日付)` で一意にしてあるので、日付が動けば
**同じ1日にもう一度配られる**。ここが、この仕組みでいちばん
壊れやすいところ。

止め方を3つ重ねてある。

    a. 保存したものを最優先にする（毎要求では推し直さない）
    b. 席の名前は**tzデータベースに実在するものだけ**を受け取る
    c. 配る日付は**戻らない**（`last_daily_date` より前では配らない）

b が効くのは、実在する席の UTC とのずれが **−12〜+14 時間**しか
ないから。名前を確かめずに受け取ると「UTC+300」のような席を
名乗って、いくらでも先の日付を先取りできる。実在する名前しか
通さない限り、先取りできる幅は1日に収まる。

c があるので、西へ移動しても同じ日を二度もらえない。

b と c を合わせると、東の端と西の端を何度往復しても、
**増えるのは一生に1日ぶんだけ**（先取りしたぶん、ずっと1日
ずれたまま1日1回に戻る）。
"""

from __future__ import annotations

import datetime as dt
import logging
import zoneinfo

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.lessons.models import LearnerTimezone, TimezoneSource

logger = logging.getLogger(__name__)

#: 何も分からなかったときの席。
DEFAULT_TIMEZONE = "Asia/Tokyo"

#: 出どころの強さ。大きいほど強い。
_RANK: dict[str, int] = {
    TimezoneSource.DEFAULT: 0,
    TimezoneSource.GEO: 1,
    TimezoneSource.BROWSER: 2,
}

#: ブラウザが言ってきた席を運ぶヘッダ。
#:
#: 本文ではなくヘッダにしてあるのは、**どの入口から来ても同じ場所に
#: 載る**ようにするため。教材を読むだけの要求にも付く。
BROWSER_HEADER = "HTTP_X_AIPPO_TIMEZONE"

#: 接続元から推すための手がかり。CDN が付けてくれるものだけを見る。
#:
#: 自前で IP から国を引く表は持たない。持つと、月に一度は更新が要る
#: 表を1つ抱えることになり、更新が止まった日から静かに間違え始める。
#: 前に置くものが教えてくれるなら、それを使う。
GEO_TIMEZONE_HEADER = "HTTP_X_VERCEL_IP_TIMEZONE"
GEO_COUNTRY_HEADERS = ("HTTP_CF_IPCOUNTRY", "HTTP_X_VERCEL_IP_COUNTRY")

#: 国から席へ。**1国に1席の地域だけ**を載せる。
#:
#: アメリカやオーストラリアのように国の中で席が分かれるところは
#: 入れない。入れると「国は当たっているのに席は外れている」を
#: 自信たっぷりに保存することになる——分からないなら既定のままで、
#: ブラウザが言ってくるのを待つほうがよい。
COUNTRY_TIMEZONES: dict[str, str] = {
    "JP": "Asia/Tokyo",
    "MY": "Asia/Kuala_Lumpur",
    "SG": "Asia/Singapore",
    "KR": "Asia/Seoul",
    "TW": "Asia/Taipei",
    "HK": "Asia/Hong_Kong",
    "TH": "Asia/Bangkok",
    "VN": "Asia/Ho_Chi_Minh",
    "PH": "Asia/Manila",
    "ID": "Asia/Jakarta",  # 3つに分かれるが、人口の6割が西部標準時
    "IN": "Asia/Kolkata",
    "GB": "Europe/London",
    "FR": "Europe/Paris",
    "DE": "Europe/Berlin",
    "NZ": "Pacific/Auckland",
}


def _known(name: str) -> str | None:
    """本当にある席の名前か。**入ってきた文字をそのまま信じない。**

    ヘッダは誰でも好きな値を入れられる。知らない名前を保存すると、
    次に読んだときに毎回 `ZoneInfoNotFoundError` が出て、
    その人だけ日付が決まらなくなる。
    """
    if not name or len(name) > 64:
        return None
    try:
        zoneinfo.ZoneInfo(name)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        return None
    return name


def _from_browser(request) -> str | None:
    return _known((request.META.get(BROWSER_HEADER) or "").strip())


def _from_geo(request) -> str | None:
    """接続元から推す。席を直接くれるならそれ、無ければ国から。"""
    direct = _known((request.META.get(GEO_TIMEZONE_HEADER) or "").strip())
    if direct:
        return direct

    for header in GEO_COUNTRY_HEADERS:
        country = (request.META.get(header) or "").strip().upper()
        found = COUNTRY_TIMEZONES.get(country)
        if found:
            return found
    return None


def detect(request) -> tuple[str, str]:
    """この要求から分かる席と、その出どころ。**保存はしない。**"""
    browser = _from_browser(request)
    if browser:
        return browser, TimezoneSource.BROWSER

    geo = _from_geo(request)
    if geo:
        return geo, TimezoneSource.GEO

    return DEFAULT_TIMEZONE, TimezoneSource.DEFAULT


def remember(learner_key, request) -> str:
    """この人の席を決めて、覚えておく。

    すでに覚えているなら、**より強い出どころが来たときだけ**入れ替える。
    同じ強さでの入れ替えもする——引っ越しや旅行で、ブラウザが前と
    違う席を言ってくることはある。そのとき日付が戻っても、
    `local_date_for` が戻さないので二度は配られない。

    推した結果は middleware が `request.timezone_hint` に載せている。
    無ければここで推す（middleware を通らない道——管理コマンドや
    テストの直呼び——のため）。
    """
    if learner_key is None:
        return DEFAULT_TIMEZONE

    hint = getattr(request, "timezone_hint", None)
    name, source = hint if hint else detect(request)
    row = LearnerTimezone.objects.filter(learner_key=learner_key).first()

    if row is None:
        try:
            with transaction.atomic():
                LearnerTimezone.objects.create(
                    learner_key=learner_key, name=name, source=source
                )
            return name
        except IntegrityError:
            # ほぼ同時に2本来た。相手が入れたものを使う
            row = LearnerTimezone.objects.filter(learner_key=learner_key).first()
            if row is None:
                return name

    if _RANK.get(source, 0) < _RANK.get(row.source, 0):
        # 弱い出どころは、強い出どころを押しのけない
        return row.name

    if row.name != name or row.source != source:
        LearnerTimezone.objects.filter(pk=row.pk).update(name=name, source=source)
    return name


def timezone_name_for(learner_key) -> str:
    """覚えている席。覚えていなければ既定。"""
    if learner_key is None:
        return DEFAULT_TIMEZONE
    row = LearnerTimezone.objects.filter(learner_key=learner_key).first()
    return row.name if row else DEFAULT_TIMEZONE


def local_date_for(learner_key, *, now: dt.datetime | None = None) -> dt.date:
    """毎日のぶんを配るときに使う「その人の今日」。

    **戻らない。** 席が西へ動くと、その人の今日は昨日へ戻りうる
    （東京の 9/1 朝は、ホノルルではまだ 8/31）。戻ったところで配ると
    鍵が変わるので、同じ1日に2回配られる。前に配った日付より
    前の日付は返さない。
    """
    moment = now or timezone.now()
    name = timezone_name_for(learner_key)

    try:
        local = moment.astimezone(zoneinfo.ZoneInfo(name)).date()
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        # 保存したあとに tzdata から消えた席。既定へ落として続ける
        logger.warning("unknown timezone stored; falling back", extra={"name": name})
        local = moment.astimezone(zoneinfo.ZoneInfo(DEFAULT_TIMEZONE)).date()

    row = LearnerTimezone.objects.filter(learner_key=learner_key).first()
    if row is not None and row.last_daily_date and local < row.last_daily_date:
        return row.last_daily_date
    return local


def mark_daily_granted(learner_key, on_date: dt.date) -> None:
    """その日のぶんを配り終えた印。**進むときだけ書く。**

    条件に「いまの値より後ろ」を入れておく。入れないと、同時に2本
    走ったときに古いほうがあとから書き戻し、境目が過去へ戻る。

    行が無ければ作る
    ----------------
    席をまだ一度も言ってきていない人（既定の Asia/Tokyo で動いている
    人）にも、境目の控えは要る。作らずに済ませると、こうなる。

        1. 席の行が無いまま、東京の 9/1 ぶんを受け取る（控えは残らない）
        2. ホノルルから来て、席の行ができる（`last_daily_date` は空）
        3. その人の今日は 8/31。**控えが空なので戻りを止められない**

    実際にこの順で二度配られる。だから、配ったときに必ず控えを残す。
    """
    if learner_key is None:
        return

    updated = (
        LearnerTimezone.objects.filter(learner_key=learner_key)
        .exclude(last_daily_date__gte=on_date)
        .update(last_daily_date=on_date)
    )
    if updated:
        return
    if LearnerTimezone.objects.filter(learner_key=learner_key).exists():
        # すでに、この日以降の控えがある
        return

    try:
        with transaction.atomic():
            LearnerTimezone.objects.create(
                learner_key=learner_key,
                name=DEFAULT_TIMEZONE,
                source=TimezoneSource.DEFAULT,
                last_daily_date=on_date,
            )
    except IntegrityError:
        # ほぼ同時に相手が作った。控えだけ進める
        LearnerTimezone.objects.filter(learner_key=learner_key).exclude(
            last_daily_date__gte=on_date
        ).update(last_daily_date=on_date)


def local_midnight_utc(learner_key, *, now: dt.datetime | None = None) -> dt.datetime:
    """次に配られる時刻（UTC）。画面へ「いつ戻ってくればよいか」を出すため。

    「24時間後」ではなく**その人の次の 00:00**。
    """
    moment = now or timezone.now()
    name = timezone_name_for(learner_key)
    try:
        zone = zoneinfo.ZoneInfo(name)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        zone = zoneinfo.ZoneInfo(DEFAULT_TIMEZONE)

    here = moment.astimezone(zone)
    tomorrow = here.date() + dt.timedelta(days=1)
    midnight = dt.datetime.combine(tomorrow, dt.time.min, tzinfo=zone)
    return midnight.astimezone(dt.UTC)
