"""POST /api/v1/ai/generate/ の入出力検証。

入力は「どのアクションか」で必要な項目が変わる。
アクションごとに Serializer を書き分けると数が増えるので、
`apps/ai/actions.py` の宣言から動的に組み立てる。
"""

from __future__ import annotations

from django.conf import settings
from rest_framework import serializers

from apps.ai.actions import Action, get_action
from apps.ai.models_catalog import is_selectable

#: 対象の本文に許す長さ。長いほど費用も待ち時間も増える。
#: 環境変数で下げられるようにしてある（AI_MAX_INPUT_CHARACTERS）。
MAX_BODY_LENGTH = settings.AI_MAX_INPUT_CHARACTERS
#: 条件（誰向け・長さ など）1つに許す長さ。
MAX_FIELD_LENGTH = 500


class GenerateRequestSerializer(serializers.Serializer):
    """入れ子の `input` を、アクションの宣言に照らして検証する。"""

    session_id = serializers.UUIDField(required=False, allow_null=True)
    #: この操作の名前。画面が作る。
    #:
    #: 同じ操作の送り直し（連打、通信が切れたあとの再送、戻る操作）は
    #: **同じ id** で来る。無料枠を二度減らさないための鍵で、
    #: 生成が成功したあとに切れた場合は、この id で前の結果を返せる。
    #:
    #: 省いてもよい。古い画面から来た要求を落とさないためで、
    #: そのときは毎回ちがう id を立てる（＝二重の判定が効かない）。
    request_id = serializers.UUIDField(required=False, allow_null=True)
    lesson_id = serializers.CharField(max_length=100)
    step_id = serializers.CharField(max_length=100)
    action = serializers.CharField(max_length=50)
    input = serializers.DictField(required=False, default=dict)
    #: 課題の重さ。教材はモデル名ではなくこれを言う（apps/ai/routing.py）。
    #: 空なら既定の段階。知らない段階も既定へ落として先へ進む
    #: （教材の書き間違いで、学習が止まらないようにする）。
    model_tier = serializers.CharField(
        max_length=40, required=False, allow_blank=True, default=""
    )
    #: モデル比較コース用。教材データが名指しできる。
    provider = serializers.CharField(
        max_length=40, required=False, allow_blank=True, default=""
    )
    model = serializers.CharField(
        max_length=100, required=False, allow_blank=True, default=""
    )

    def validate_action(self, value: str) -> str:
        if get_action(value) is None:
            raise serializers.ValidationError("この操作には対応していません。")
        return value

    def validate_model(self, value: str) -> str:
        """名簿に無いモデルは受け取らない。

        以前はここが素通しで、任意のモデル名を送りつけられた。
        高いモデルを指定されれば、そのぶん請求はこちらに来る。
        選べる先は apps/ai/models_catalog.py が持つ1か所に集めてある。
        """
        value = (value or "").strip()
        if value and not is_selectable(value):
            raise serializers.ValidationError("選べないモデルです。")
        return value

    def validate(self, attrs: dict) -> dict:
        action: Action = get_action(attrs["action"])

        # 教材の外から任意のプロンプトを流し込めないようにする。
        # action ごとに使えるレッスンを決めてある。
        if attrs["lesson_id"] not in action.lesson_ids:
            raise serializers.ValidationError(
                {"lesson_id": ["このレッスンでは使えない操作です。"]}
            )

        attrs["input"] = self._clean_input(action, attrs.get("input") or {})
        return attrs

    def _clean_input(self, action: Action, raw: dict) -> dict:
        errors: dict[str, list[str]] = {}
        cleaned: dict[str, str] = {}

        for field in action.fields:
            value = raw.get(field.key, "")
            if not isinstance(value, str):
                errors[field.key] = ["文字で入力してください。"]
                continue

            value = value.strip()
            if not value:
                if field.required:
                    errors[field.key] = [f"{field.label}を入力してみましょう。"]
                cleaned[field.key] = ""
                continue

            limit = min(field.max_length, MAX_BODY_LENGTH)
            if field.key != action.body_field:
                limit = min(limit, MAX_FIELD_LENGTH)
            if len(value) > limit:
                errors[field.key] = [f"{field.label}は{limit}文字までにしてみましょう。"]
                continue

            cleaned[field.key] = value

        if errors:
            raise serializers.ValidationError(errors)
        return cleaned


class UsageSerializer(serializers.Serializer):
    provider = serializers.CharField()
    model = serializers.CharField()
    input_tokens = serializers.IntegerField()
    output_tokens = serializers.IntegerField()
    latency_ms = serializers.IntegerField()


class TutorSerializer(serializers.Serializer):
    message = serializers.CharField()
    emotion = serializers.CharField()
    action = serializers.CharField()


class GenerateResponseSerializer(serializers.Serializer):
    result = serializers.CharField()
    tutor = TutorSerializer()
    usage = UsageSerializer()
    #: アクションによって付く追加情報（比較の確認項目、計画の手順など）。
    extras = serializers.DictField(required=False)


def store_raw_input(text: str) -> str:
    """本文を保存してよいかを1か所で決める。

    既定は保存しない。学習者は会社の文章を貼るので、
    黙って溜め込むと要らない責任を抱えることになる。
    調べたいときだけ AI_STORE_RAW_INPUT=true にする。
    """
    return text if settings.AI_STORE_RAW_INPUT else ""
