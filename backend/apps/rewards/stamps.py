"""スタンプの付与と、節目のCredit受け取り。

読み・書きの鍵の使い分けは、既存の学習記録（apps.accounts.scope）と同じ:

    書き込み … いまの端末の learner_key（1つ）
    読み取り … その人が読んでよい learner_key 全部（複数端末ぶん）

読み取りを「いまの端末だけ」にすると、別端末で埋めていたスタンプが
無かったことになり、まだ届いていない節目のCreditを再度渡してしまう。
"""

from __future__ import annotations

import uuid

from django.db import IntegrityError, transaction

from apps.rewards.ledger import grant_credit
from apps.rewards.models import (
    CreditTransactionType,
    LearningPath,
    PathRewardMilestone,
    StampDefinition,
    StampType,
    UserRewardClaim,
    UserStamp,
)


def award_lesson_stamp(learner_key: uuid.UUID, lesson_slug: str) -> list[UserStamp]:
    """このLessonを完了したことで埋まる、すべてのPathのスタンプ。

    `lesson_slug` は `apps.catalog.models.Lesson.slug`
    （= `LearningSession.lesson_id` に入っている値）。

    1つのLessonが複数のPathに属していれば、複数同時に埋まりうる
    （同じLessonを複数Pathで使い回せる設計そのものの帰結）。
    重複は UserStamp の (learner_key, stamp_definition) unique constraint で防ぐ。
    """
    definitions = StampDefinition.objects.filter(
        stamp_type=StampType.LESSON, lesson__slug=lesson_slug, active=True
    )
    awarded: list[UserStamp] = []
    for definition in definitions:
        stamp, created = UserStamp.objects.get_or_create(
            learner_key=learner_key, stamp_definition=definition
        )
        if created:
            awarded.append(stamp)
    return awarded


def stamps_done(learner_keys: list[uuid.UUID], learning_path: LearningPath) -> int:
    """このPathで、いままでに埋まったスタンプの数（全端末ぶん）。"""
    return UserStamp.objects.filter(
        learner_key__in=learner_keys, stamp_definition__learning_path=learning_path
    ).count()


def claim_due_milestones(
    user, learner_keys: list[uuid.UUID], learning_path: LearningPath
) -> list[UserRewardClaim]:
    """このPathで、いま届いている節目のうち、まだ受け取っていない分をすべて渡す。

    Credit は account が要る（apps/rewards/models.py の UserRewardClaim
    docstring 参照）。ゲストはここを呼ばない——スタンプは埋まっているが
    「Creditを受け取るには進捗を保存してください」でsignupへ誘導する。
    """
    done = stamps_done(learner_keys, learning_path)
    milestones = PathRewardMilestone.objects.filter(
        learning_path=learning_path, active=True, required_stamp_count__lte=done
    )

    claimed: list[UserRewardClaim] = []
    for milestone in milestones:
        try:
            with transaction.atomic():
                claim = UserRewardClaim.objects.create(user=user, milestone=milestone)
        except IntegrityError:
            continue  # 既に受け取り済み。二重には渡さない

        if milestone.reward_credits > 0:
            grant_credit(
                user,
                milestone.reward_credits,
                type=CreditTransactionType.REWARD,
                reason=f"{learning_path.title} {milestone.required_stamp_count}個達成",
                source_type="path_reward_milestone",
                source_id=str(milestone.id),
            )
        claimed.append(claim)

    return claimed
