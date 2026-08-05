"""ゲストの記録を、登録した人へ引き継ぐ。

やることは1つだけ。
**その learner_key が誰のものかを記録する。**

学習の記録（LearningSession / Attempt / LearningEvent / SkillProgress /
LearnerProfile）は learner_key に紐づいたまま動かさない。書き換えないので、
途中で失敗しても壊れない。結びつけに失敗しても、記録は元の場所に残り、
もう一度実行すればよい。

冪等であること
--------------
二度実行しても、結びつきは1つのまま。登録の直後に画面を再読み込みされたり、
通信が切れて押し直されたりするのは普通に起きる。そのたびに記録が増えると、
「自分の課題で試した回数」のような数え上げが狂う。

失敗したときの扱い
------------------
引き継ぎに失敗しても、**登録そのものは成功させる**。
「登録できませんでした」と言われた人は、もう一度登録しようとして
「そのメールアドレスは使われています」に当たる。そこで詰む。
"""

from __future__ import annotations

import logging
import uuid

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import LearnerIdentity
from apps.lessons.models import LearningEventType, LearningSession

logger = logging.getLogger(__name__)


class MigrationResult:
    """引き継ぎの結果。画面と記録の両方に出す。"""

    def __init__(self, *, linked: bool, sessions: int, already: bool) -> None:
        self.linked = linked
        self.sessions = sessions
        #: すでに結びついていた（二度目の実行）
        self.already = already

    def as_dict(self) -> dict[str, object]:
        return {
            "linked": self.linked,
            "sessions": self.sessions,
            "already_linked": self.already,
        }


@transaction.atomic
def claim_guest_data(user, learner_key: uuid.UUID) -> MigrationResult:
    """`learner_key` の記録を `user` のものにする。

    何度呼んでも同じ結果になる。
    """
    identity, created = LearnerIdentity.objects.select_for_update().get_or_create(
        learner_key=learner_key,
        defaults={"user": user, "linked_at": timezone.now()},
    )

    already = False
    if not created:
        if identity.user_id == user.pk:
            # 二度目。何もしない
            already = True
        elif identity.user_id is None:
            identity.user = user
            identity.linked_at = timezone.now()
            identity.save(update_fields=["user", "linked_at"])
        else:
            """
            すでに別の人のものになっている。

            同じ端末を2人で使って、順に登録したときに起きる。
            奪わない。あとから来た人には、その端末に残っていた
            記録は渡さない（前の人の学習内容が混ざるほうが困る）。
            """
            logger.warning(
                "accounts.migration.key_belongs_to_another user=%s key=%s",
                user.pk,
                learner_key,
            )
            return MigrationResult(linked=False, sessions=0, already=False)

    sessions = LearningSession.objects.filter(learner_key=learner_key).count()

    return MigrationResult(linked=True, sessions=sessions, already=already)


def record_migration_event(learner_key: uuid.UUID, event_type: str, lesson_id: str = "") -> None:
    """引き継ぎの経過を残す。

    本文は入れない。入るのは「起きたこと」だけ。
    セッションが1つも無いときは何も残さない（記録の置き場が無い）。
    """
    session = (
        LearningSession.objects.filter(learner_key=learner_key)
        .order_by("-updated_at")
        .first()
    )
    if session is None:
        return

    session.events.create(
        lesson_id=lesson_id or session.lesson_id,
        step=session.current_step,
        event_type=event_type,
    )


#: 引き継ぎの経過。§28 の名前に合わせる。
MIGRATION_STARTED = LearningEventType.GUEST_DATA_MIGRATION_STARTED
MIGRATION_COMPLETED = LearningEventType.GUEST_DATA_MIGRATION_COMPLETED
MIGRATION_FAILED = LearningEventType.GUEST_DATA_MIGRATION_FAILED
