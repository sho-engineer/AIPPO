"""操作記録を残す口。

呼ぶ側が失敗しないことが第一。**記録に失敗しても、元の操作は通す。**
逆にすると、監査のために足した仕組みが、アカウント削除を
落とす原因になる。消せないほうが利用者にとって重い。
"""

from __future__ import annotations

import logging
from typing import Any

from apps.ops.models import AuditAction, AuditLog

logger = logging.getLogger(__name__)

#: 学習者の記録を持つ表。管理画面で開いたときに記録する対象。
#:
#: 教材（catalog）は入れない。教材は誰のものでもないので、
#: 見られて困るものではない。全部を対象にすると、
#: 教材を1つ直すたびに記録が増えて、肝心の1件が埋もれる。
WATCHED_MODELS = {
    "lessons.attempt",
    "lessons.learningsession",
    "lessons.learningevent",
    "lessons.skillprogress",
    "lessons.survey",
    "accounts.userprofile",
    "accounts.learneridentity",
    "accounts.socialaccount",
    "accounts.passkey",
    "profiles.learnerprofile",
}


def record(
    action: str,
    *,
    actor: str = "",
    target_model: str = "",
    target_id: str = "",
    ip: str | None = None,
    **detail: Any,
) -> None:
    """1件残す。

    例外を外へ出さない。ここで落ちると、記録したかった操作そのものが
    失敗する。残せなかったことは通常のログに出して、先へ進める。
    """
    try:
        AuditLog.objects.create(
            action=action,
            actor=actor or "",
            target_model=target_model or "",
            target_id=str(target_id or ""),
            ip=ip,
            detail=detail,
        )
    except Exception:  # noqa: BLE001 - 記録の失敗で本体を止めない
        logger.exception("audit.record.failed action=%s", action)


def is_watched(model_label: str) -> bool:
    """その表は、見たことを残す対象か。"""
    return model_label.lower() in WATCHED_MODELS


__all__ = ["AuditAction", "is_watched", "record"]
