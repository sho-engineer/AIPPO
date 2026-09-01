"""POST /api/v1/ai/generate/

教材から AI を呼ぶ、唯一の入口。

ここでやること（順番に意味がある）:

1. 入力を検証する — 形が違うものは AI へ送らない
2. 同じ内容の連打を弾く — 押し間違いで費用が倍にならないように
3. 実行回数を消費する — AI を呼ぶ**直前**に。呼んでから数えると、
   落ちたときに数え漏れる
4. AI を呼ぶ
5. 返ってきた中身を検証する — 構造化出力でも形は崩れる
6. 記録する — provider / model / token / latency / 概算費用 / エラー種別

本文（利用者が貼った文章）は、既定では保存しない。
"""

from __future__ import annotations

import hashlib
import logging
import uuid

from django.conf import settings
from django.core.cache import cache
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.scope import device_key, readable_keys
from apps.ai import quality
from apps.ai.actions import Action, get_action
from apps.ai.models_catalog import available_models
from apps.ai.pricing import estimate_cost_usd
from apps.ai.providers.base import (
    AIProviderError,
    AIQualityError,
    AIRequest,
    AIResult,
    AITimeoutError,
)
from apps.ai.providers.registry import AIServiceNotConfigured, get_provider
from apps.ai.routing import resolve
from apps.ai.serializers import GenerateRequestSerializer, store_raw_input
from apps.ai.tutor import build_tutor, failure_tutor, limit_tutor
from apps.catalog.access import LessonNotStartable, require_startable
from apps.lessons.models import (
    AiActionType,
    Attempt,
    AttemptStatus,
    LearningEventType,
    LearningSession,
)
from apps.lessons.services import credits, localtime
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

        """
        同じ内容の送り直しを、5秒だけ弾く。

        **`request_id` が来ているときは通す。** あちらは「同じ操作か」を
        名前で見分けるので、こちらの当て推量より正確で、しかも
        「同じ文章でもう一度作ってみる」を邪魔しない——入力の中身で
        判定すると、**わざと同じ条件で作り直す人まで止めてしまう**。

        古い画面（`request_id` を送らない）のためだけに残す。
        """
        if not data.get("request_id") and self._is_duplicate(request, data, values):
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
        """
        どのモデルへ送るかを決める。

        教材が言うのは「課題の重さ（model_tier）」まで。モデル名は
        サーバー側で決める（apps/ai/routing.py）。モデル比較コースだけは
        教材が provider / model を名指しでき、そのときはそのまま通す。
        """
        route = resolve(
            tier=data.get("model_tier") or None,
            provider=data.get("provider") or None,
            model=data.get("model") or None,
        )

        try:
            provider = get_provider(route.provider, route.model)
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

        """
        費用の安全弁。**その人の持ち分とは別のもの。**

        こちらは全体・接続元・1日の合計を頭打ちにするためのもので、
        当たったときに言うのは「いま混み合っています」。
        持ち分（下の reserve）に当たったときの「今日はここまで」とは
        原因も次にすることも違う。
        """
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

        """
        その人の持ち分を1つ**押さえる**（まだ減らさない）。

        減らすのは成果を返せたときだけ。前はここで数えて、失敗しても
        戻していなかった——provider が落ちた日は、押しただけで回数を
        失っていた。

        押さえたものは、この下のどの道を通っても必ず閉じる
        （成功なら確定、失敗なら戻す）。閉じ忘れると、その人の
        持ち分が減ったまま残る。
        """
        learner_key = device_key(request)
        reservation = None
        credit_type = credits.credit_type_for(action.id)
        if learner_key is not None and self._counts_against_credits(
            request, credit_type
        ):
            # request を渡す。その人の暦（毎日のぶんを配る境目）を、
            # 配る直前に、いちばん新しい手がかりで確かめるため
            credits.ensure_ready(learner_key, request)
            # そのレッスンで渡すものがあれば、ここで渡す。
            # 二度は渡らない（AiCreditGrant の一意制約）
            credits.grant_for_lesson(learner_key, data["lesson_id"])
            try:
                reservation = credits.reserve(
                    learner_key,
                    credit_type,
                    data.get("request_id") or uuid.uuid4(),
                    lesson_id=data["lesson_id"],
                )
            except credits.AlreadyDone as done:
                return self._replay(done, session, data)
            except credits.NoCreditsLeft:
                return self._out_of_credits(request, session, data)
            session.events.create(
                lesson_id=data["lesson_id"],
                step=data["step_id"],
                event_type=LearningEventType.AI_ACTION_RESERVED,
            )

        ai_request = AIRequest(
            system_prompt=action.system_prompt,
            user_content=action.build(values),
            model=route.model,
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
            result, text, quality_kind = self._generate_usable(
                provider, ai_request, action, values, session, data
            )
        except (AIProviderError, AITimeoutError) as exc:
            # 成果を受け取っていないので、押さえた分は戻す
            if reservation is not None:
                credits.release(reservation, note=getattr(exc, "kind", "failed"))
                session.events.create(
                    lesson_id=data["lesson_id"],
                    step=data["step_id"],
                    event_type=LearningEventType.AI_ACTION_RELEASED,
                )
            return self._on_failure(session, data, action, values, exc)

        sequence = session.attempts.count() + 1
        attempt = Attempt.objects.create(
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
            # 一発で通ったなら空。入っていれば「一度落ちて、直った」
            quality_kind=quality_kind,
            provider=result.usage.provider,
            model_name=result.usage.model,
            token_usage={
                "input": result.usage.input_tokens,
                "output": result.usage.output_tokens,
            },
            latency_ms=result.usage.latency_ms,
            estimated_cost_usd=estimate_cost_usd(
                result.usage.provider,
                result.usage.input_tokens,
                result.usage.output_tokens,
            ),
        )
        session.attempt_count = sequence
        session.current_step = data["step_id"]
        session.save(update_fields=["attempt_count", "current_step", "updated_at"])

        """
        成果を返せた。**ここで初めて減る。**

        作った結果を予約に結び付けておく。通信が切れて画面が受け取れず、
        同じ `request_id` で送り直されたときに、作り直さずこれを返す。
        """
        if reservation is not None:
            credits.commit(reservation, attempt=attempt)
            session.events.create(
                lesson_id=data["lesson_id"],
                step=data["step_id"],
                event_type=LearningEventType.AI_ACTION_COMPLETED,
            )

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
    def _counts_against_credits(request: Request, credit_type: str) -> bool:
        """その人の持ち分から引くか。

        文章は**登録前の人だけ**。登録した人は
        `AI_DAILY_REQUEST_LIMIT_USER`（1日50回）が上限で、持ち分では
        数えない。登録したら「毎日たくさん試せる」に変わる、という線を
        そのまま残すため。

        画像は**登録の有無を問わず**持ち分で数える。毎日の配りが無く、
        レッスンで1回ずつ渡すものなので、登録しても増え方は変わらない。
        """
        if credit_type != AiActionType.TEXT:
            return True
        user = getattr(request, "user", None)
        return not (user is not None and user.is_authenticated)

    def _replay(
        self, done: credits.AlreadyDone, session: LearningSession, data: dict
    ) -> Response:
        """同じ操作で、もう作ってあるものを返す。

        通信が切れて画面が結果を受け取れず、送り直されたときの道。
        **作り直さない**——作り直すと、成功しているのにもう1回ぶんの
        費用がかかり、持ち分も2つ減る。

        肝心の結果が見つからないときだけ、ふつうの失敗として返す。
        作り直すよりは、もう一度押してもらうほうがよい。
        """
        attempt = (
            Attempt.objects.filter(pk=done.attempt_id).first()
            if done.attempt_id
            else None
        )
        if attempt is None or not attempt.generated_output:
            logger.warning("ai.generate.replay_missing lesson=%s", data["lesson_id"])
            return Response(
                {
                    "errors": {
                        "detail": ["うまく届かなかったようです。もう一度おくってみましょう。"]
                    },
                    "tutor": failure_tutor(),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        logger.info("ai.generate.replayed lesson=%s", data["lesson_id"])
        return Response(
            {
                "result": attempt.generated_output,
                "tutor": build_tutor(
                    get_action(data["action"]), is_retry=attempt.sequence > 1
                ),
                "replayed": True,
            },
            status=status.HTTP_200_OK,
        )

    def _out_of_credits(
        self, request: Request, session: LearningSession, data: dict
    ) -> Response:
        """持ち分を使い切った。**失敗ではない。**

        押し直せば直るものではないので、画面は「もう一度」を出さない。
        次にできることは2つだけ——明日また来るか、いま登録するか。
        その2つを選べるように、`code` で見分けが付く形で返す。
        """
        session.events.create(
            lesson_id=data["lesson_id"],
            step=data["step_id"],
            event_type=LearningEventType.GUEST_TEXT_LIMIT_REACHED,
        )
        message = "今日はここまで！　また明日、続きから試してみましょう。"
        """
        次に配られる時刻を、UTC の一点として添える。

        「あと n 時間」とは書かない。**その人の 00:00** で切っているので、
        時間で言うと、時計を見て計算し直さないと分からない。
        画面側が受け取った時刻を、その端末の暦で書けばよい。

        残りの数は返さない（ここは 0 と決まっている）。
        """
        return Response(
            {
                "code": "FREE_CREDITS_EXHAUSTED",
                "errors": {"detail": [message]},
                "tutor": limit_tutor(message),
                "resets_at": localtime.local_midnight_utc(
                    device_key(request)
                ).isoformat(),
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    def _generate_usable(
        self,
        provider,
        ai_request: AIRequest,
        action: Action,
        values: dict,
        session: LearningSession,
        data: dict,
    ) -> tuple[AIResult, str, str]:
        """**使える結果**が返るまで作る。作り直しは1回だけ。

        ここが「1回のUser Action」の中身。**呼び出し元は
        `credits.reserve()` を既に1回だけ済ませていて、この中では
        絶対に呼ばない**——だから内部で何回 provider を叩いても、
        その人の持ち分は1つしか動かない。押した人から見て、
        押した回数と減った数が一致する。

        なぜ1回だけか
        --------------
        2回にすると、駄目な日は1アクションで3回叩くことになり、
        費用が3倍になる。1回で戻らないものは、たいてい2回でも
        戻らない——待たせるだけ長くなる。

        直し方を添える
        --------------
        ただもう一度同じことを頼んでも、同じものが返る。**どこが
        駄目だったかを、直し方の言葉で足して**から頼み直す。

        戻り値の3つ目は、落ちた検査の名前。作り直して通ったときも
        残す——**何が起きていたか**は、通ったかどうかとは別に要る
        （Quality Failure Rate と Recovery Rate が、これで出る）。
        """
        result = provider.generate_structured(ai_request, action.schema)
        text = self._validate(action, result)

        verdict = quality.inspect(action.id, values, text)
        if verdict.ok:
            return result, text, ""

        logger.info(
            "ai.generate.quality_failed lesson=%s action=%s reason=%s",
            data["lesson_id"],
            action.id,
            verdict.reason,
        )
        self._log_quality(session, data, LearningEventType.GENERATION_QUALITY_FAILED)
        self._log_quality(session, data, LearningEventType.INTERNAL_RETRY_STARTED)

        retried = provider.generate_structured(
            AIRequest(
                system_prompt=ai_request.system_prompt,
                user_content=(
                    f"{ai_request.user_content}\n\n"
                    f"- 特に守ること: {quality.retry_hint(verdict.reason)}"
                ),
                model=ai_request.model,
                timeout_seconds=ai_request.timeout_seconds,
                max_output_tokens=ai_request.max_output_tokens,
            ),
            action.schema,
        )
        retried_text = self._validate(action, retried)

        if quality.inspect(action.id, values, retried_text).ok:
            self._log_quality(session, data, LearningEventType.INTERNAL_RETRY_SUCCESS)
            return retried, retried_text, verdict.reason

        """
        作り直しても通らなかった。

        **微妙な結果をそのまま見せない。** 見せると、学習者は
        「AIとはこういうもの」と覚えて帰る。ここは失敗として扱い、
        押さえた分は呼び出し元が戻す——**受け取っていないものに
        課金しない**という約束のほうを守る。

        行き止まりにはならない。画面が「別の方法で試す」を出す
        （frontend の course/rescue.ts）。
        """
        raise AIQualityError(verdict.reason)

    @staticmethod
    def _log_quality(
        session: LearningSession, data: dict, event_type: str
    ) -> None:
        session.events.create(
            lesson_id=data["lesson_id"],
            step=data["step_id"],
            event_type=event_type,
        )

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
            # 品質で落ちた回は、どの検査だったかも残す。
            # 「届かなかった」と「使えるものにならなかった」は別の問題で、
            # 直し方も違う（前者は経路、後者は教材か指示）
            quality_kind=getattr(exc, "reason", ""),
        )
        session.events.create(
            lesson_id=data["lesson_id"],
            step=data["step_id"],
            event_type=LearningEventType.AI_REQUEST_FAILED,
            input_length=self._body_length(action, values),
        )

        """
        ここは AI の出力そのものが目的なので、固定文で代替できない。
        画面は入力を保持したまま再実行させる。

        「届かなかった」と「使えるものにならなかった」を分ける。
        前者は押し直せば直ることが多い。後者は**同じ頼み方では
        たぶんまた同じになる**ので、画面は別の道（例文で試す・
        頼み方を変える・ヒント）を出す（frontend の course/rescue.ts）。

        **どちらの文も、利用者を評価しない。** 「入力が正しくありません」
        とは書かない——起きたのは AI の出力のばらつきで、
        書いた人のせいではない。
        """
        if kind == "quality":
            return Response(
                {
                    "code": "AI_RESULT_UNUSABLE",
                    "errors": {
                        "detail": [
                            "うまく変わりませんでした。別の頼み方で試してみましょう。"
                        ]
                    },
                    "tutor": failure_tutor(),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

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
