"""スタンプと Credit を、画面へ返す。

出すのは自分のことだけ。順位も他人との比較も出さない（憲章）。

Credit は account が要る
------------------------
ゲストのままでもスタンプは埋まる。ただし Credit は account が要るので、
ゲストには「残高」ではなく **獲得できる見込み** を返す。
「スタンプは埋まっています。Credit を受け取るには進捗を保存してください」
と案内するための材料で、達成そのものを無かったことにはしない。
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.scope import readable_keys
from apps.rewards.models import (
    CreditTransaction,
    LearningPath,
    UserRewardClaim,
    UserStamp,
)

#: 履歴に出す件数。全部返すと、長く使った人ほど重くなる。
RECENT_TRANSACTIONS = 20


def _signed_in(request: Request) -> bool:
    user = getattr(request, "user", None)
    return bool(user and user.is_authenticated)


class CreditView(APIView):
    """GET /api/v1/rewards/credits/

    残高・獲得・使用と、最近の動き。
    """

    def get(self, request: Request) -> Response:
        if not _signed_in(request):
            """
            ゲストには残高を持たせない。

            0 を返すと「使い切った」ようにも読めるので、
            残高そのものを出さず、account が要ることを伝える。
            """
            return Response(
                {
                    "requires_account": True,
                    "balance": None,
                    "lifetime_earned": None,
                    "lifetime_spent": None,
                    "transactions": [],
                },
                status=status.HTTP_200_OK,
            )

        from apps.rewards.ledger import wallet_for

        wallet = wallet_for(request.user)
        recent = CreditTransaction.objects.filter(user=request.user).order_by(
            "-created_at"
        )[:RECENT_TRANSACTIONS]

        return Response(
            {
                "requires_account": False,
                "balance": wallet.balance,
                "lifetime_earned": wallet.lifetime_earned,
                "lifetime_spent": wallet.lifetime_spent,
                "transactions": [
                    {
                        "type": row.type,
                        "amount": row.amount,
                        "reason": row.reason,
                        "balance_after": row.balance_after,
                        "created_at": row.created_at.isoformat(),
                    }
                    for row in recent
                ],
            },
            status=status.HTTP_200_OK,
        )


class StampView(APIView):
    """GET /api/v1/rewards/stamps/

    学習パスごとの、スタンプの埋まり具合と次の節目。

    ゲストでも返す。スタンプはゲストのままでも埋まるため。
    """

    def get(self, request: Request) -> Response:
        keys = readable_keys(request)
        signed_in = _signed_in(request)

        earned = set(
            UserStamp.objects.filter(learner_key__in=keys).values_list(
                "stamp_definition_id", flat=True
            )
        )
        claimed = (
            set(
                UserRewardClaim.objects.filter(user=request.user).values_list(
                    "milestone_id", flat=True
                )
            )
            if signed_in
            else set()
        )

        paths = []
        for path in LearningPath.objects.filter(status="published").prefetch_related(
            "stamp_definitions", "milestones"
        ):
            definitions = [d for d in path.stamp_definitions.all() if d.active]
            done = sum(1 for d in definitions if d.id in earned)
            total = len(definitions)

            milestones = [
                {
                    "required_stamp_count": m.required_stamp_count,
                    "reward_credits": m.reward_credits,
                    "badge_name": m.badge_name,
                    "reached": done >= m.required_stamp_count,
                    # 受け取り済みか。ゲストは常に False（account が要る）
                    "claimed": m.id in claimed,
                }
                for m in path.milestones.all()
                if m.active
            ]

            paths.append(
                {
                    "path_id": path.slug,
                    "title": path.title,
                    "done": done,
                    "total": total,
                    "stamps": [
                        {
                            "id": d.id,
                            "title": d.title,
                            "stamp_type": d.stamp_type,
                            "earned": d.id in earned,
                        }
                        for d in definitions
                    ],
                    "milestones": milestones,
                }
            )

        return Response(
            {
                "paths": paths,
                "signed_in": signed_in,
                # 届いているのに受け取れていない特典があるか。
                # ゲストへ「保存すれば受け取れます」と案内するために使う
                "unclaimed_waiting": any(
                    m["reached"] and not m["claimed"] and m["reward_credits"] > 0
                    for path in paths
                    for m in path["milestones"]
                ),
            },
            status=status.HTTP_200_OK,
        )


class ClaimRewardsView(APIView):
    """POST /api/v1/rewards/claim/

    届いている節目の特典を、まとめて受け取る。

    **どの節目に届いたかはサーバーが決める。** 画面からは「受け取る」と
    しか言えず、金額も節目も指定できない（設計方針 §36）。
    二重の受け取りは UserRewardClaim の unique 制約が止める。
    """

    def post(self, request: Request) -> Response:
        if not _signed_in(request):
            return Response(
                {
                    "requires_account": True,
                    "detail": "Credit を受け取るには、進捗の保存が必要です。",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        from apps.rewards.ledger import wallet_for
        from apps.rewards.stamps import claim_due_milestones

        keys = readable_keys(request)
        granted = 0
        for path in LearningPath.objects.filter(status="published"):
            for claim in claim_due_milestones(request.user, keys, path):
                granted += claim.milestone.reward_credits

        return Response(
            {
                "granted": granted,
                "balance": wallet_for(request.user).balance,
            },
            status=status.HTTP_200_OK,
        )


class LearningPathView(APIView):
    """GET /api/v1/rewards/paths/

    学習パスの一覧と、そのレッスン・レシピ。

    教材そのもの（ステップ）は返さない。あちらは `/api/v1/catalog/` が
    持っている。ここが返すのは「どのレッスンが、どの順で、どのパスに
    属するか」という束ね方だけ——同じレッスンを複数のパスから
    使い回せるようにしてあるので、束ね方は教材とは別に持つ。
    """

    def get(self, request: Request) -> Response:
        keys = readable_keys(request)
        earned = set(
            UserStamp.objects.filter(learner_key__in=keys).values_list(
                "stamp_definition_id", flat=True
            )
        )

        paths = []
        for path in (
            LearningPath.objects.filter(status="published")
            .prefetch_related(
                "path_lessons__lesson",
                "stamp_definitions",
                "milestones",
                "recipe_links__recipe",
            )
            .order_by("sort_order", "id")
        ):
            definitions = [d for d in path.stamp_definitions.all() if d.active]
            done = sum(1 for d in definitions if d.id in earned)

            next_milestone = next(
                (
                    m
                    for m in sorted(
                        (m for m in path.milestones.all() if m.active),
                        key=lambda m: m.required_stamp_count,
                    )
                    if m.required_stamp_count > done
                ),
                None,
            )

            paths.append(
                {
                    "id": path.slug,
                    "title": path.title,
                    "description": path.description,
                    "short_description": path.short_description,
                    "category": path.category,
                    "difficulty": path.difficulty,
                    "access_type": path.access_type,
                    "availability": path.availability_status,
                    "badge_name": path.badge_name,
                    "estimated_total_minutes": path.estimated_total_minutes,
                    "lessons": [
                        {
                            "lesson_id": membership.lesson.slug,
                            "title": membership.lesson.title,
                            "order": membership.order,
                            "day_number": membership.day_number,
                            "is_required": membership.is_required,
                        }
                        for membership in sorted(
                            path.path_lessons.all(), key=lambda m: m.order
                        )
                    ],
                    "recipes": [
                        {
                            "id": link.recipe.slug,
                            "title": link.recipe.title,
                            "description": link.recipe.description,
                            "access_type": link.recipe.access_type,
                        }
                        for link in path.recipe_links.all()
                        if link.recipe.status == "published"
                    ],
                    "stamp_done": done,
                    "stamp_total": len(definitions),
                    "next_milestone": (
                        {
                            "required_stamp_count": next_milestone.required_stamp_count,
                            "reward_credits": next_milestone.reward_credits,
                        }
                        if next_milestone
                        else None
                    ),
                }
            )

        return Response({"paths": paths}, status=status.HTTP_200_OK)


class SkillDexView(APIView):
    """GET /api/v1/rewards/skills/

    AI技図鑑。**いま何ができるか**を並べる。

    出すのは自分のことだけ。誰が何個持っているか、順位、平均——
    どれも出さない（憲章）。集めた数を人と比べさせない。

    まだ取っていない技も出す。ただし「どのレッスンで取れるか」が
    書けるものだけ（`AiSkillLesson` がある技だけ）。行き先の無い枠を
    並べると、押しても何も無い項目になる。
    """

    def get(self, request: Request) -> Response:
        from apps.lessons.models import SkillProgress
        from apps.rewards import xp as xp_module
        from apps.rewards.models import AiSkill
        from apps.rewards.skills import SKILL_COMBOS

        keys = readable_keys(request)
        acquired_at = dict(
            SkillProgress.objects.filter(learner_key__in=keys)
            .values_list("skill_key", "acquired_at")
        )

        skills = (
            AiSkill.objects.filter(lesson_links__isnull=False)
            .prefetch_related("lesson_links__lesson__course")
            .distinct()
        )

        rows = []
        for skill in skills:
            when = acquired_at.get(skill.slug)
            rows.append(
                {
                    "slug": skill.slug,
                    "name": skill.name,
                    "one_line": skill.one_line,
                    "description": skill.description,
                    "example": skill.example,
                    "acquired": when is not None,
                    "acquired_at": when.isoformat() if when else None,
                    "lessons": [
                        {
                            "slug": link.lesson.slug,
                            "title": link.lesson.title,
                            "course_slug": link.lesson.course.slug,
                        }
                        for link in skill.lesson_links.all()
                    ],
                }
            )

        have = {row["slug"] for row in rows if row["acquired"]}
        total = xp_module.total_xp(keys)
        level = xp_module.level_for(total)

        return Response(
            {
                "skills": rows,
                "acquired_count": len(have),
                "total_count": len(rows),
                # 組み合わせは見せ方。持ち物として数えない（表も作っていない）
                "combos": [
                    {
                        "skills": list(combo),
                        "name": name,
                        "one_line": one_line,
                        "complete": set(combo) <= have,
                    }
                    for combo, name, one_line in SKILL_COMBOS
                ],
                "xp": {
                    "total": level.total,
                    "level": level.name,
                    "next_level": level.next_name,
                    "to_next": level.to_next,
                },
            },
            status=status.HTTP_200_OK,
        )
