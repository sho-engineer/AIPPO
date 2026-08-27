"""取っておいた成果物。

    GET    /api/lessons/saved/        取っておいたものの一覧
    POST   /api/lessons/saved/        取っておく
    PATCH  /api/lessons/saved/<id>/   名前を変える
    DELETE /api/lessons/saved/<id>/   捨てる

「作ったもの」との違い
----------------------
`views_history` の「作ったもの」は、AIを動かすたびに自動でたまる。
試した回数ぶん並ぶので、あとから探すと目的の1つが埋もれる。
そのうえ、古いセッションは `prune_data` で消える。

ここは**本人が取っておくと決めたもの**だけを、名前を付けて残す場所。
本文を写して持つので、元の `Attempt` が消えても残る。

    作ったもの      … 自動。試した分だけ並ぶ。いずれ消える
    取っておいたもの … 手動。名前が付く。消えない

二重に取っておかない
--------------------
同じ教材で同じ出力を何度でも取っておけると、やり直すたびに似た文が
並んで探せなくなる。弾く単位は (鍵, 教材, 出力のハッシュ)。
同じものを押し直したときは**失敗にしない**——押した結果は同じ
（取ってある）なので、赤い字を出す理由が無い。

取っておけるのは登録した人だけ
------------------------------
ゲストの鍵は7日で切れる（`apps/accounts/scope.py` の `can_keep`）。
残らないものを取っておかせて黙って消すより、取っておくには登録が
要るとその場で言うほうがよい。目印・修了証と同じ線を引いている。

学ぶこと自体は止めない。ゲストのままでも教材は最後まで通るし、
作ったものは「作ったもの」の一覧から取り出せる。
"""

from __future__ import annotations

import hashlib

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.scope import can_keep, device_key, readable_keys
from apps.lessons.models import SavedArtifact

#: 1人が取っておける上限。
#:
#: 取っておく場所であって、集める場所ではない。上限が無いと、
#: 機械で叩かれたときに一覧が無限に伸びる。
MAX_SAVED = 100

#: 取っておく本文の長さの上限。画面でも読み切れない長さは切る。
MAX_OUTPUT_CHARS = 4000

#: 名前の長さ（モデルの max_length と揃える）。
MAX_TITLE_CHARS = 120


def _requires_account() -> Response:
    """403。「認証が要る」の意味であって、間違いではない。

    画面はこの鍵を見て、登録のお誘いに切り替える。
    """
    return Response(
        {"errors": {"requires_account": ["取っておくには、登録が必要です"]}},
        status=status.HTTP_403_FORBIDDEN,
    )


def _as_dict(artifact: SavedArtifact) -> dict[str, object]:
    return {
        "id": str(artifact.id),
        "lesson_id": artifact.lesson_id,
        "title": artifact.title,
        "output": artifact.output,
        "conditions": artifact.conditions,
        "skills": artifact.skills,
        "created_at": artifact.created_at.isoformat(),
    }


class SavedArtifactView(APIView):
    """一覧と、取っておく。

    書き込みはいまの端末の鍵で、読み出しはその人の鍵ぜんぶで行う
    （`apps/accounts/scope.py` の作法）。揃えないと、別の端末で
    取っておいたものが消えたように見える。
    """

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        """一覧。

        ゲストには一覧そのものを出さない。取っておけないのに前の分だけ
        並ぶと、消し方の分からない行が残る。`requires_account` を添えて、
        画面が「登録すると使えます」と言えるようにしておく
        （空と、使えないは別のこと）。
        """
        if not can_keep(request):
            return Response({"items": [], "requires_account": True})

        keys = readable_keys(request)
        if not keys:
            return Response({"items": []})

        items = SavedArtifact.objects.filter(learner_key__in=keys)[:MAX_SAVED]
        return Response({"items": [_as_dict(item) for item in items]})

    def post(self, request: Request) -> Response:
        if not can_keep(request):
            return _requires_account()

        key = device_key(request)
        if key is None:
            return Response(
                {"errors": {"detail": ["この端末では取っておけません"]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        body = request.data or {}
        lesson_id = str(body.get("lesson_id") or "").strip()
        output = str(body.get("output") or "").strip()

        if not lesson_id:
            return Response(
                {"errors": {"lesson_id": ["教材が指定されていません"]}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not output:
            return Response(
                {"errors": {"output": ["取っておく中身がありません"]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output = output[:MAX_OUTPUT_CHARS]
        title = str(body.get("title") or "").strip()[:MAX_TITLE_CHARS]
        if not title:
            title = self._default_title(lesson_id)

        conditions = body.get("conditions")
        if not isinstance(conditions, dict):
            conditions = {}
        # 値は表示にしか使わないので、文字列だけを残す
        conditions = {
            str(name): str(value)
            for name, value in conditions.items()
            if isinstance(value, str) and value
        }

        keys = readable_keys(request)
        if SavedArtifact.objects.filter(learner_key__in=keys).count() >= MAX_SAVED:
            return Response(
                {"errors": {"detail": [f"取っておけるのは{MAX_SAVED}件までです"]}},
                status=status.HTTP_409_CONFLICT,
            )

        digest = hashlib.sha256(output.encode("utf-8")).hexdigest()

        """
        すでに取ってあるなら、そのまま返す。

        押し直しただけの人に赤い字を出さない——押した結果は同じ
        （取ってある）。**別の端末で取ってあった場合も同じ扱い**にする
        ので、読める鍵ぜんぶから探す。
        """
        existing = SavedArtifact.objects.filter(
            learner_key__in=keys, lesson_id=lesson_id, output_hash=digest
        ).first()
        if existing is not None:
            return Response({"artifact": _as_dict(existing), "already_saved": True})

        try:
            """
            `transaction.atomic()` で囲むのが要。囲まずに IntegrityError を
            拾うと、取引そのものが壊れた印のまま残り、この後の問い合わせが
            全部 TransactionManagementError で落ちる。
            """
            with transaction.atomic():
                artifact = SavedArtifact.objects.create(
                    learner_key=key,
                    lesson_id=lesson_id,
                    title=title,
                    output=output,
                    conditions=conditions,
                    skills=self._skills_for(lesson_id),
                    output_hash=digest,
                )
        except IntegrityError:
            # 同時に2回押された。あとから来たほうは、すでにある分を返す
            artifact = SavedArtifact.objects.filter(
                learner_key=key, lesson_id=lesson_id, output_hash=digest
            ).first()
            if artifact is None:
                raise
            return Response({"artifact": _as_dict(artifact), "already_saved": True})

        return Response(
            {"artifact": _as_dict(artifact), "already_saved": False},
            status=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _default_title(lesson_id: str) -> str:
        """既定の名前。教材名が引ければ使う。

        引けなくても落とさない——教材を消したあとや、まだ入っていない
        環境でも、取っておくこと自体はできるようにする。
        """
        from apps.catalog.models import Lesson

        lesson = Lesson.objects.filter(slug=lesson_id).first()
        name = lesson.title if lesson is not None else lesson_id
        return f"{name}で作ったもの"[:MAX_TITLE_CHARS]

    @staticmethod
    def _skills_for(lesson_id: str) -> list[str]:
        """この教材で使ったAI技。図鑑から辿れるようにするため。

        取れなくても落とさない。技が空でも、成果物としては成り立つ。
        """
        from apps.rewards.skills import skills_for_lesson

        return [skill.slug for skill in skills_for_lesson(lesson_id)]


class SavedArtifactDetailView(APIView):
    """名前を変える・捨てる。"""

    permission_classes = [AllowAny]

    def patch(self, request: Request, artifact_id: str) -> Response:
        if not can_keep(request):
            return _requires_account()

        artifact = self._find(request, artifact_id)
        if artifact is None:
            return Response(
                {"errors": {"detail": ["見つかりません"]}},
                status=status.HTTP_404_NOT_FOUND,
            )

        title = str((request.data or {}).get("title") or "").strip()
        if not title:
            return Response(
                {"errors": {"title": ["名前を入れてください"]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        artifact.title = title[:MAX_TITLE_CHARS]
        artifact.save(update_fields=["title", "updated_at"])
        return Response({"artifact": _as_dict(artifact)})

    def delete(self, request: Request, artifact_id: str) -> Response:
        if not can_keep(request):
            return _requires_account()

        artifact = self._find(request, artifact_id)
        if artifact is not None:
            artifact.delete()

        # 無くても成功にする。押した結果は同じ（もう無い）
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _find(request: Request, artifact_id: str) -> SavedArtifact | None:
        """自分のものだけ。

        読める鍵ぜんぶから探す。別の端末で取っておいたものを消せないと、
        それは二度と消せなくなる。
        """
        keys = readable_keys(request)
        if not keys:
            return None
        try:
            return SavedArtifact.objects.filter(
                learner_key__in=keys, id=artifact_id
            ).first()
        except (ValueError, ValidationError):
            # id の形が違う。他人のものを探しに行かせない
            return None
