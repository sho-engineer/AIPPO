"""POST /api/v1/ai/generate/

教材から AI を呼ぶ、唯一の入口。

ここでやること（順番に意味がある）:

1. 入力を検証する — 形が違うものは AI へ送らない
2. 同じ内容の連打を弾く — 押し間違いで費用が倍にならないように
3. 実行回数を消費する — AI を呼ぶ**直前**に。呼んでから数えると、
   落ちたときに数え漏れる
4. AI を呼ぶ
5. 返ってきた中身を検証する — 構造化出力でも形は崩れる
6. 記録する — provider / model / token / latency / エラー種別

本文（利用者が貼った文章）は、既定では保存しない。
"""

from __future__ import annotations

import hashlib
import logging

from django.conf import settings
from django.core.cache import cache
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.scope import device_key, readable_keys
from apps.ai.actions import Action, get_action
from apps.ai.models_catalog import available_models
from apps.ai.providers.base import (
    AIProviderError,
    AIRequest,
    AIResult,
    AITimeoutError,
)
from apps.ai.providers.registry import AIServiceNotConfigured, get_provider
from apps.ai.serializers import GenerateRequestSerializer, store_raw_input
from apps.ai.tutor import build_tutor, failure_tutor, limit_tutor
from apps.catalog.access import LessonNotStartable, require_startable
from apps.lessons.models import (
    Attempt,
    AttemptStatus,
    LearningEventType,
    LearningSession,
)
from apps.lessons.services.quota import (
    QuotaExceeded,
    consume_ai_run,
    limit_message,
)

logger = logging.getLogger(__name__)

#: 同じ内容をこの秒数のあいだに送り直しても、AI は呼ばない。
#: 二重押下と、戻る操作からの送り直しを吸収する。
DUPLICATE_WINDOW_SECONDS = 5


class GenerateView(APIView):
    """教材のどのレッスンからも、ここを通して AI を呼ぶ。"""

    def post(self, request: Request) -> Response:
        serializer = GenerateRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST
            )

        data = serializer.validated_data
        action = get_action(data["action"])
        values = data["input"]

        """
        近日公開の教材は、ここでも止める。

        画面から開始ボタンを消すだけでは足りない。URL を直接叩く、
        古いタブが残っている、開発者ツールから呼ぶ——どれでも通ってしまう。
        教材が DB に無い環境（取り込み前）では素通しにする。
        止めたいのは「近日公開と分かっているもの」だけで、
        取り込み前の環境まで動かなくする必要はない。
        """
        try:
            require_startable(data["lesson_id"])
        except LessonNotStartable as exc:
            if exc.code == "LESSON_COMING_SOON":
                logger.info(
                    "ai.generate.coming_soon lesson=%s", data["lesson_id"]
                )
                return Response(
                    {
                        "code": exc.code,
                        "errors": {"detail": [exc.detail]},
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            # 教材が DB に無いだけなら止めない（取り込み前の環境で動かなくなる）

        if self._is_duplicate(request, data, values):
            logger.info("ai.generate.duplicate lesson=%s", data["lesson_id"])
            return Response(
                {
                    "errors": {
                        "detail": ["いま送ったところです。結果が出るまで待ってみましょう。"]
                    }
                },
                status=status.HTTP_409_CONFLICT,
            )

        """
        AI が使える設定になっているかを、**回数を消費する前**に確かめる。

        あとで見ると、設定が抜けているだけで利用者の1日の回数が削れる。
        設定が無いのは運営側の落ち度で、利用者に払わせるものではない。
        """
        try:
            provider = get_provider(
                data.get("provider") or None, data.get("model") or None
            )
        except AIServiceNotConfigured as exc:
            logger.error("ai.generate.not_configured detail=%s", exc)
            return Response(
                {
                    "code": AIServiceNotConfigured.code,
                    "errors": {"detail": [AIServiceNotConfigured.detail]},
                    "tutor": failure_tutor(),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        session = self._session(request, data["lesson_id"])

        try:
            consume_ai_run(request)
        except QuotaExceeded as exc:
            message = limit_message(exc)
            return Response(
                {"errors": {"detail": [message]}, "tutor": limit_tutor(message)},
                status=(
                    status.HTTP_503_SERVICE_UNAVAILABLE
                    if exc.is_global
                    else status.HTTP_429_TOO_MANY_REQUESTS
                ),
            )

        ai_request = AIRequest(
            system_prompt=action.system_prompt,
            user_content=action.build(values),
            model=data.get("model") or None,
            timeout_seconds=settings.AI_REQUEST_TIMEOUT_SECONDS,
            max_output_tokens=settings.AI_MAX_OUTPUT_TOKENS,
        )

        session.events.create(
            lesson_id=data["lesson_id"],
            step=data["step_id"],
            event_type=LearningEventType.AI_REQUEST_STARTED,
            input_length=self._body_length(action, values),
        )

        try:
            result = provider.generate_structured(ai_request, action.schema)
            text = self._validate(action, result)
        except (AIProviderError, AITimeoutError) as exc:
            return self._on_failure(session, data, action, values, exc)

        sequence = session.attempts.count() + 1
        Attempt.objects.create(
            session=session,
            sequence=sequence,
            lesson_id=data["lesson_id"],
            step=data["step_id"],
            action=action.id,
            user_input=store_raw_input(self._body(action, values)),
            input_length=self._body_length(action, values),
            conditions=self._conditions(action, values),
            generated_output=result.text or text,
            status=AttemptStatus.SUCCEEDED,
            provider=result.usage.provider,
            model_name=result.usage.model,
            token_usage={
                "input": result.usage.input_tokens,
                "output": result.usage.output_tokens,
            },
            latency_ms=result.usage.latency_ms,
        )
        session.attempt_count = sequence
        session.current_step = data["step_id"]
        session.save(update_fields=["attempt_count", "current_step", "updated_at"])

        session.events.create(
            lesson_id=data["lesson_id"],
            step=data["step_id"],
            event_type=LearningEventType.AI_REQUEST_SUCCEEDED,
            input_length=self._body_length(action, values),
        )

        return Response(
            {
                "result": text,
                "tutor": build_tutor(action, is_retry=sequence > 1),
                "usage": result.usage.as_dict(),
                "extras": self._extras(action, result),
            },
            status=status.HTTP_200_OK,
        )

    # -- 補助 --------------------------------------------------------------

    @staticmethod
    def _session(request: Request, lesson_id: str) -> LearningSession:
        """続きを探す。作るのはいまの端末の鍵で。

        探す範囲は「その人が読んでよい鍵ぜんぶ」。別端末で途中まで
        進めていた人が、ここで最初からやり直しにならないようにする。
        """
        session = (
            LearningSession.objects.filter(
                learner_key__in=readable_keys(request),
                lesson_id=lesson_id,
                completed_at__isnull=True,
            )
            .order_by("-updated_at")
            .first()
        )
        if session is None:
            session = LearningSession.objects.create(
                learner_key=device_key(request), lesson_id=lesson_id
            )
        return session

    @staticmethod
    def _body(action: Action, values: dict) -> str:
        return values.get(action.body_field, "") if action.body_field else ""

    @classmethod
    def _body_length(cls, action: Action, values: dict) -> int:
        return len(cls._body(action, values))

    @staticmethod
    def _conditions(action: Action, values: dict) -> dict:
        """本文以外の選んだ条件。これは残す。

        「どの条件を選んだか」は実証実験で見たい情報で、
        本文と違って個人情報にならない。
        """
        return {
            field.key: values.get(field.key, "")
            for field in action.fields
            if field.key != action.body_field
        }

    def _is_duplicate(self, request: Request, data: dict, values: dict) -> bool:
        """同じ内容の連打かどうか。

        画面側でもボタンを止めているが、それだけでは足りない。
        通信が遅いときに再読み込みされると、同じ内容がもう一度届く。

        判定は cache.get() の「読めるか」だけで行い、cache.set() の成否は見ない。

        以前は cache.add()（無ければ書く、を1回で行う）の戻り値だけで
        判定していた。だが Django の DatabaseCache は、書き込みが
        DatabaseError で失敗したときも例外を投げずに False を返す仕様
        （django/core/cache/backends/db.py）。SQLite はファイル単位の
        書き込みロックを取るため、操作ログの記録など他の書き込みと
        重なるとこの失敗が起きる。その False を「連打だ」と読むと、
        書き込み待ちが少しでも重なっただけで**初回の送信まで**拒んでしまう
        （実際に負荷のかかる状況で再現した）。

        読み取りだけで判定すれば、書き込みが失敗しても実害は
        「本当にまれな連打を取りこぼす」側にしか倒れない。
        取りこぼしよりも、初回を拒むほうが害が大きい。
        """
        learner_key = getattr(request, "learner_key", None)
        if learner_key is None:
            return False

        payload = "|".join(
            [
                str(learner_key),
                data["lesson_id"],
                data["step_id"],
                data["action"],
                *(f"{key}={values.get(key, '')}" for key in sorted(values)),
            ]
        )
        key = "ai:dedupe:" + hashlib.sha256(payload.encode()).hexdigest()

        try:
            already_recorded = cache.get(key) is not None
        except Exception:
            already_recorded = False

        if already_recorded:
            return True

        try:
            cache.set(key, 1, DUPLICATE_WINDOW_SECONDS)
        except Exception:
            pass

        return False

    @staticmethod
    def _validate(action: Action, result: AIResult) -> str:
        """返ってきた中身を、こちら側でも確かめる。

        構造化出力を指定していても、モデルは形を外すことがある。
        空文字が来たときに画面へそのまま出すと、
        「AIが動いていない」ことに気づけない。
        """
        from apps.ai.providers.base import AIMalformedError

        payload = result.data or {}
        for key in action.schema.get("required", []):
            if key not in payload:
                raise AIMalformedError(f"missing key: {key}")

        text = payload.get("result", result.text)
        if not isinstance(text, str) or not text.strip():
            raise AIMalformedError("empty result")
        return text.strip()

    @staticmethod
    def _extras(action: Action, result: AIResult) -> dict:
        """result 以外に返す情報。

        比較なら確認が必要な項目、計画なら手順の一覧。
        画面はここが空でも壊れないように作ること。
        """
        payload = dict(result.data or {})
        payload.pop("result", None)
        payload.update(action.extras)
        return payload

    def _on_failure(
        self,
        session: LearningSession,
        data: dict,
        action: Action,
        values: dict,
        exc: Exception,
    ) -> Response:
        kind = getattr(exc, "kind", "provider_error")
        logger.warning(
            "ai.generate.failed lesson=%s action=%s kind=%s",
            data["lesson_id"],
            action.id,
            kind,
        )

        Attempt.objects.create(
            session=session,
            sequence=session.attempts.count() + 1,
            lesson_id=data["lesson_id"],
            step=data["step_id"],
            action=action.id,
            user_input=store_raw_input(self._body(action, values)),
            input_length=self._body_length(action, values),
            conditions=self._conditions(action, values),
            status=(
                AttemptStatus.TIMEOUT
                if isinstance(exc, AITimeoutError)
                else AttemptStatus.FAILED
            ),
            error_kind=kind,
        )
        session.events.create(
            lesson_id=data["lesson_id"],
            step=data["step_id"],
            event_type=LearningEventType.AI_REQUEST_FAILED,
            input_length=self._body_length(action, values),
        )

        # ここは AI の出力そのものが目的なので、固定文で代替できない。
        # 画面は入力を保持したまま再実行させる。
        return Response(
            {
                "errors": {"detail": ["うまく届かなかったようです。もう一度おくってみましょう。"]},
                "tutor": failure_tutor(),
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )


class ModelsView(APIView):
    """GET /api/v1/ai/models/

    学習者が選べるモデルの一覧。

    画面にモデル名を持たせないための口。設定画面はここで受け取った
    ものをそのまま並べるだけで、どんな名前があるかを知らない。
    誰でも読めてよい（秘密は含まない）。
    """

    def get(self, request: Request) -> Response:
        return Response(
            {
                "models": available_models(),
                # いま何が選ばれていなくても、既定がどれかは示せるようにする
                "default": settings.AI_MODEL,
            }
        )
