"""Credit の受け渡し。**残高を直接書き換えるコードをここ以外に書かないこと。**

守っていること（設計方針 §25 への回答）:

- **ledger方式**: `CreditWallet.balance` は必ず `CreditTransaction` を
  1件作ってから書き換える。残高だけを直接 `save()` しない
- **行ロック**: `select_for_update()` で `CreditWallet` の行をロックしてから
  読み書きする。django.db.transaction.atomic の中でのみ呼べる
- **冪等性**: `source_type` + `source_id` の組が同じ動きは1回しか通らない
  （`CreditTransaction` の unique constraint）。AI送信の二重実行や、
  節目特典ボタンの連打で二重に付与・消費しない。呼び出し側は、
  二重に呼ばれうる操作には必ず `source_id`（例: attempt の id、
  milestone の id）を渡すこと
- **消費は成功後にだけ**: 呼び出し側の責務。`consume_credit()` は
  AI呼び出しが成功した**あと**にだけ呼ぶ（失敗した実行では呼ばない）。
  reserve（仮押さえ）はいまは作っていない——画像生成など実際に
  消費するAI機能がまだ無いため、実際の失敗パターンを見てから
  reserve/refund が要るか判断する
"""

from __future__ import annotations

from django.db import IntegrityError, transaction

from apps.rewards.models import CreditTransaction, CreditTransactionType, CreditWallet


class InsufficientCredit(Exception):
    """残高が足りない。呼び出し側は「Creditが足りません」＋獲得導線を出す。"""


class DuplicateCreditOperation(Exception):
    """同じ source_type/source_id の動きが、既に記録されている（冪等性で弾いた）。"""


def wallet_for(user) -> CreditWallet:
    """残高を作らずに見るだけ（無ければ0扱い）。"""
    wallet, _ = CreditWallet.objects.get_or_create(user=user)
    return wallet


@transaction.atomic
def grant_credit(
    user,
    amount: int,
    *,
    type: str = CreditTransactionType.REWARD,
    reason: str = "",
    source_type: str = "",
    source_id: str = "",
) -> CreditTransaction | None:
    """Creditを渡す。同じ source_type/source_id では2回目以降は何もしない。"""
    if amount <= 0:
        raise ValueError("amount must be positive")

    try:
        with transaction.atomic():
            wallet = CreditWallet.objects.select_for_update().get_or_create(user=user)[0]
            wallet.balance += amount
            wallet.lifetime_earned += amount
            wallet.save(update_fields=["balance", "lifetime_earned", "updated_at"])
            return CreditTransaction.objects.create(
                user=user,
                type=type,
                amount=amount,
                reason=reason,
                source_type=source_type,
                source_id=source_id,
                balance_after=wallet.balance,
            )
    except IntegrityError:
        # 同じきっかけからの付与は、既に記録済み。二重には配らない
        if source_type and source_id:
            return None
        raise


@transaction.atomic
def consume_credit(
    user,
    amount: int,
    *,
    reason: str = "",
    source_type: str = "",
    source_id: str = "",
) -> CreditTransaction | None:
    """Creditを使う。**AI呼び出しが成功したあとにだけ呼ぶこと**（失敗時は呼ばない）。"""
    if amount <= 0:
        raise ValueError("amount must be positive")

    try:
        with transaction.atomic():
            wallet = CreditWallet.objects.select_for_update().get_or_create(user=user)[0]
            if wallet.balance < amount:
                raise InsufficientCredit(
                    f"残高{wallet.balance}に対して{amount}を消費できません"
                )
            wallet.balance -= amount
            wallet.lifetime_spent += amount
            wallet.save(update_fields=["balance", "lifetime_spent", "updated_at"])
            return CreditTransaction.objects.create(
                user=user,
                type=CreditTransactionType.CONSUME,
                amount=-amount,
                reason=reason,
                source_type=source_type,
                source_id=source_id,
                balance_after=wallet.balance,
            )
    except IntegrityError:
        # 同じきっかけからの消費は、既に記録済み。二重には減らさない
        if source_type and source_id:
            return None
        raise
