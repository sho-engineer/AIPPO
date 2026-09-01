"""無料でAIを試せる持ち分。

`quota.py` との違い
-------------------
役割がまったく違う。両方を通す。

    quota.py   費用の安全弁。全体・接続元・その人の**1日の合計**を頭打ちに
               する。当たったときに言うのは「いま混み合っています」
    ここ       その人の**持ち分**。使うと減り、付与で増える。
               当たったときに言うのは「今日はここまで」

混ぜると、1人の使いすぎで全体が止まったときに理由を説明できなくなる。

いちばん大事な決まり
--------------------
**成果を受け取っていないなら減らさない。**

いまの `quota.py` は AI を呼ぶ前に数え、失敗しても戻さない。
つまり provider が落ちた日は、押しただけで回数を失う。ここでは
送る前に **予約** し、結果が返ってから **確定** するか **戻す**。

    available 10
      → 予約      available 9 / reserved 1
      → 成功      available 9 / reserved 0 / consumed 1
      → 失敗      available 10 / reserved 0

誰の持ち分か
------------
`learner_key`（端末のCookie）に付ける。登録前の人にも持たせたいので、
ユーザーには紐づけない。登録するとその鍵は本人のものとして結ばれる
（`apps/accounts/migration.py`）。

文章と画像で線が違う
--------------------
    文章 … 登録前の人だけ持ち分で数える。登録した人は
           `AI_DAILY_REQUEST_LIMIT_USER`（1日50回）が上限
    画像 … 登録の有無を問わず持ち分で数える。毎日の配りは無い

登録すると「毎日たくさん試せる」に変わる、という線をそのまま残すため。
"""

from __future__ import annotations

import logging
import uuid

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from apps.lessons.models import (
    AiActionType,
    AiCreditBalance,
    AiCreditGrant,
    AiCreditGrantReason,
    AiCreditLedger,
    AiCreditStatus,
)
from apps.lessons.services import localtime

logger = logging.getLogger(__name__)


class NoCreditsLeft(Exception):
    """持ち分が尽きた。**失敗ではない。**

    押し直せば直るものではないので、画面は「もう一度」ではなく
    「また明日」と「いま登録する」の2つを出す。
    """

    def __init__(self, action_type: str) -> None:
        super().__init__(action_type)
        self.action_type = action_type


class AlreadyDone(Exception):
    """同じ `request_id` で、もう成果を受け取っている。

    通信が切れて画面が結果を受け取れなかったときの送り直しがこれ。
    **作り直さない**——同じ id の結果をそのまま返す。
    """

    def __init__(self, attempt_id: int | None) -> None:
        super().__init__(str(attempt_id))
        self.attempt_id = attempt_id


# ------------------------------------------------------------------ 付与


def _grant(
    learner_key: uuid.UUID,
    action_type: str,
    reason: str,
    amount: int,
    *,
    on_date=None,
) -> bool:
    """足す。同じ理由で二度足さない。

    二度足さないのを**一意制約**で止めるのが要。アプリ側で
    「もう足したか」を見てから足すと、同時に2本来たときにすり抜ける。

    返すのは「実際に足したか」。二度目は False。

    `amount` が 0 でも**記録は残す**。「今日のぶんは配り終えた」を
    残すためで、これが無いと同じ日に何度でもここを通る。実際、
    上限より多く持っている人が使って減ったあとに、もう一度その日の
    ぶんを受け取れてしまった。
    """
    if amount < 0:
        return False

    try:
        with transaction.atomic():
            AiCreditGrant.objects.create(
                learner_key=learner_key,
                action_type=action_type,
                reason=reason,
                on_date=on_date,
                amount=amount,
            )
            if amount > 0:
                balance, _ = AiCreditBalance.objects.get_or_create(
                    learner_key=learner_key, action_type=action_type
                )
                AiCreditBalance.objects.filter(pk=balance.pk).update(
                    available=F("available") + amount
                )
    except IntegrityError:
        # すでに足してある。二度目は何もしない
        return False

    return True


def grant_guest_initial(learner_key: uuid.UUID) -> bool:
    """登録前の最初の持ち出し。一生に一度。

    毎日配る分とは別の考え方で、初日にレッスンを通せる量を渡す。
    「試す前に登録させない」は、ここが無いと成り立たない。
    """
    return _grant(
        learner_key,
        AiActionType.TEXT,
        AiCreditGrantReason.GUEST_INITIAL,
        settings.GUEST_INITIAL_TEXT_ACTIONS,
    )


def grant_daily(learner_key: uuid.UUID) -> bool:
    """日が変わったら足す。**貯まる上限がある。**

    上限を超えるぶんは足さない。しばらく来なかった人が大量に持って
    戻ってくると、その日の費用が読めなくなる。

    最初の持ち出し（10）は上限を超えて持てる。あちらは別の考え方で、
    ここで削ると初日の途中で急に減ることになる——だから
    **「上限より少ないときだけ、上限まで」**足す。

    「日が変わった」は誰の時計か
    ----------------------------
    **その人の暦**（`localtime.local_date_for`）。サーバーの時計では
    ない。前は `timezone.localdate()`（＝ Asia/Tokyo）で切っていたので、
    クアラルンプールの人は毎日 23:00 に日が変わっていた。
    夜に少しだけ触る人は、1日ぶんを丸ごと落とす。

    「最後に使ってから24時間後」でもない。00:00 で切るからこそ、
    「明日また来てください」と言える。
    """
    limit = settings.FREE_MAX_DAILY_TEXT_ACTIONS
    amount = settings.FREE_DAILY_TEXT_ACTIONS
    if amount <= 0:
        return False

    today = localtime.local_date_for(learner_key)
    balance = AiCreditBalance.objects.filter(
        learner_key=learner_key, action_type=AiActionType.TEXT
    ).first()
    have = balance.available if balance else 0

    """
    すでに上限以上持っているなら、今日は足さない。

    ただし**「今日は配り終えた」印は残す**。残さないと、その日のうちに
    使って残りが上限を下回った時点で、もう一度ここを通って受け取れる。
    1日に何度でも +3 されることになる。
    """
    if have >= limit:
        _grant(
            learner_key,
            AiActionType.TEXT,
            AiCreditGrantReason.DAILY,
            0,
            on_date=today,
        )
        localtime.mark_daily_granted(learner_key, today)
        return False

    granted = _grant(
        learner_key,
        AiActionType.TEXT,
        AiCreditGrantReason.DAILY,
        min(amount, limit - have),
        on_date=today,
    )
    """
    配った日付を控える。**席が動いても、この日より前へは戻らない。**

    控えないと、東京で 9/1 を受け取った人がホノルルへ飛んだ瞬間、
    その人の今日は 8/31 になり、鍵が変わってもう一度配られる
    （`localtime.local_date_for` の説明）。

    配れなかった回（すでにその日のぶんがある）でも控える。境目は
    「配ったか」ではなく「その日まで進んだか」なので、同じでよい。
    """
    localtime.mark_daily_granted(learner_key, today)
    return granted


def grant_registration_bonus(learner_key: uuid.UUID) -> dict[str, bool]:
    """登録したときに1回だけ。**ログインし直しただけでは足さない。**

    呼ぶのは登録の口だけ（signup / passkey signup / 外部ログインで
    新しく作られたとき）。ログインの口からは呼ばない。
    """
    return {
        AiActionType.TEXT: _grant(
            learner_key,
            AiActionType.TEXT,
            AiCreditGrantReason.REGISTRATION_BONUS,
            settings.FREE_REGISTRATION_TEXT_BONUS,
        ),
        AiActionType.IMAGE_GENERATION: _grant(
            learner_key,
            AiActionType.IMAGE_GENERATION,
            AiCreditGrantReason.REGISTRATION_BONUS,
            settings.FREE_REGISTRATION_IMAGE_BONUS,
        ),
    }


#: レッスンに着いたときに渡すもの。
#:
#: 開き直しても、ログインし直しても、端末を再起動しても増えない
#: （`AiCreditGrant` の一意制約）。
LESSON_GRANTS: dict[str, tuple[str, str, str]] = {
    "image_generation": (
        AiActionType.IMAGE_GENERATION,
        AiCreditGrantReason.DAY7_LESSON,
        "DAY7_FREE_IMAGE_GENERATIONS",
    ),
    "image_edit": (
        AiActionType.IMAGE_EDIT,
        AiCreditGrantReason.DAY8_LESSON,
        "DAY8_FREE_IMAGE_EDITS",
    ),
}


def grant_for_lesson(learner_key: uuid.UUID, lesson_id: str) -> bool:
    """そのレッスンに初めて着いた人へ渡す。

    渡すものが決まっていないレッスンでは何もしない。
    """
    entry = LESSON_GRANTS.get(lesson_id)
    if entry is None:
        return False

    action_type, reason, setting_name = entry
    return _grant(
        learner_key, action_type, reason, getattr(settings, setting_name, 0)
    )


def ensure_ready(learner_key: uuid.UUID, request=None) -> None:
    """使う前に、配るべきものを配っておく。

    最初の持ち出しと、その日のぶん。どちらも二度は配られない。

    移行で全員へ先に配らないのは、まだ来ていない人のぶんまで行を
    作ることになるため。**来た人に、来たときに配る。**

    暦を覚えるのもここ
    ------------------
    その人の席（タイムゾーン）を保存するのは、**この直前だけ**。
    middleware で毎要求書くと、教材を1枚読むだけの要求にも書き込みが
    増える。席が要るのは「今日はいつか」を決める一瞬なので、
    決める直前に、いちばん新しい手がかりで確かめる。

    `request` を渡さない呼び方（テストや管理コマンド）では、
    すでに覚えている席——無ければ既定——をそのまま使う。
    """
    if learner_key is None:
        return
    if request is not None:
        localtime.remember(learner_key, request)
    grant_guest_initial(learner_key)
    grant_daily(learner_key)


#: AIの操作が、どの枠から引くか。
#:
#: 載っていない操作は文章として数える。画像の操作はまだ無い
#: （providers に画像を作る口が無く、Day7・Day8 は近日公開のまま）。
#: **口を開けるときは、まずここに1行足す**——足さないと、画像1枚が
#: 文章1回として数えられ、文章の目安で決めた回数がそのまま
#: 画像の枚数を許してしまう。
ACTION_CREDIT_TYPE: dict[str, str] = {
    # "image_create": AiActionType.IMAGE_GENERATION,
    # "image_edit": AiActionType.IMAGE_EDIT,
}


def credit_type_for(action_id: str) -> str:
    """その操作が引く枠。"""
    return ACTION_CREDIT_TYPE.get(action_id, AiActionType.TEXT)


# ------------------------------------------------------------ 予約と結末


def _expire_stale(learner_key: uuid.UUID, action_type: str) -> None:
    """使われないまま残った予約を解く。

    予約したあとにプロセスが落ちると `RESERVED` の行が残り、その人の
    持ち分が減ったままになる。掃除の常駐は置かない——**読むたびに、
    古いものだけ解く**。
    """
    cutoff = timezone.now() - timezone.timedelta(
        seconds=settings.AI_CREDIT_RESERVATION_TTL_SECONDS
    )
    stale = AiCreditLedger.objects.filter(
        learner_key=learner_key,
        action_type=action_type,
        status=AiCreditStatus.RESERVED,
        created_at__lt=cutoff,
    )
    for entry in stale:
        _finish(entry, AiCreditStatus.RELEASED, note="expired")


def balance_of(learner_key: uuid.UUID, action_type: str) -> int:
    """いま使える数。古い予約は解いてから数える。"""
    if learner_key is None:
        return 0
    _expire_stale(learner_key, action_type)
    row = AiCreditBalance.objects.filter(
        learner_key=learner_key, action_type=action_type
    ).first()
    return row.available if row else 0


def reserve(
    learner_key: uuid.UUID,
    action_type: str,
    request_id: uuid.UUID,
    *,
    lesson_id: str = "",
) -> AiCreditLedger:
    """送る前に1つ押さえる。

    同じ `request_id` で二度来たときは**新しく押さえない**。

        まだ送信中   … その予約をそのまま返す（二重送信を止める）
        もう成功済み … `AlreadyDone`。作り直さず、前の結果を返す
        戻したあと   … 新しい試みとして押さえ直す

    押さえるのは**条件付き UPDATE 1文**。読んでから書く形にすると
    行を掴んだまま待つことになり、同時に何人も来たときに詰まる
    （SQLite では特に顕著。`quota.py` と同じ理由）。
    """
    _expire_stale(learner_key, action_type)

    existing = AiCreditLedger.objects.filter(
        learner_key=learner_key, action_type=action_type, request_id=request_id
    ).first()
    if existing is not None:
        if existing.status == AiCreditStatus.RESERVED:
            return existing
        if existing.status == AiCreditStatus.CONSUMED:
            raise AlreadyDone(existing.attempt_id)
        # 戻したあと。もう一度やってよい
        existing.delete()

    balance, _ = AiCreditBalance.objects.get_or_create(
        learner_key=learner_key, action_type=action_type
    )
    taken = AiCreditBalance.objects.filter(pk=balance.pk, available__gte=1).update(
        available=F("available") - 1, reserved=F("reserved") + 1
    )
    if not taken:
        raise NoCreditsLeft(action_type)

    try:
        return AiCreditLedger.objects.create(
            learner_key=learner_key,
            action_type=action_type,
            status=AiCreditStatus.RESERVED,
            request_id=request_id,
            lesson_id=lesson_id,
        )
    except IntegrityError:
        # ほぼ同時に同じ id で入ってきた。押さえた分は戻す
        AiCreditBalance.objects.filter(pk=balance.pk, reserved__gte=1).update(
            available=F("available") + 1, reserved=F("reserved") - 1
        )
        found = AiCreditLedger.objects.filter(
            learner_key=learner_key, action_type=action_type, request_id=request_id
        ).first()
        if found is None:
            raise
        if found.status == AiCreditStatus.CONSUMED:
            raise AlreadyDone(found.attempt_id) from None
        return found


def _finish(entry: AiCreditLedger, status: str, *, note: str = "", attempt=None) -> None:
    """予約を閉じる。**同じ行を二度閉じない。**

    条件に `status=RESERVED` を入れておく。入れないと、失敗の処理と
    期限切れの掃除が同時に走ったときに、2回ぶん戻してしまう。
    """
    closed = AiCreditLedger.objects.filter(
        pk=entry.pk, status=AiCreditStatus.RESERVED
    ).update(status=status, note=note, attempt=attempt)
    if not closed:
        return

    if status == AiCreditStatus.CONSUMED:
        AiCreditBalance.objects.filter(
            learner_key=entry.learner_key,
            action_type=entry.action_type,
            reserved__gte=1,
        ).update(reserved=F("reserved") - 1, consumed=F("consumed") + 1)
    else:
        AiCreditBalance.objects.filter(
            learner_key=entry.learner_key,
            action_type=entry.action_type,
            reserved__gte=1,
        ).update(reserved=F("reserved") - 1, available=F("available") + 1)


def commit(entry: AiCreditLedger, *, attempt=None) -> None:
    """成果を返せた。ここで初めて減る。"""
    _finish(entry, AiCreditStatus.CONSUMED, attempt=attempt)


def release(entry: AiCreditLedger, *, note: str = "failed") -> None:
    """成果を返せなかった。押さえた分を戻す。"""
    _finish(entry, AiCreditStatus.RELEASED, note=note)
