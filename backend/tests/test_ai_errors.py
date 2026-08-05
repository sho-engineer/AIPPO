"""AI が使えないとき、何が起きるか。

第一リリースでいちばん怖いのは「動いているように見えて、実は偽物」。
鍵の入れ忘れを黙って mock で埋めると、学習者は固定の文を
本物の AI の答えとして覚え、運営側は画面が動くので気づけない。

エラーは**コード**で返す。文言で分岐させると、文言を直した日に
画面の出し分けが黙って壊れる。
"""

from __future__ import annotations

import pytest

GENERATE_URL = "/api/v1/ai/generate/"

REWRITE_INPUT = {
    "original_text": "先日の件ですが、諸事情ございまして、追ってご連絡差し上げます。",
    "audience": "社外のお客様",
    "tone": "ていねいに",
    "length": "3行くらい",
}


def _post(api_client, **over):
    body = {
        "lesson_id": "rewrite_text",
        "step_id": "generate_first",
        "action": "rewrite",
        "input": REWRITE_INPUT,
    }
    body.update(over)
    return api_client.post(GENERATE_URL, body, format="json")


@pytest.mark.django_db
class TestNotConfigured:
    """鍵が無いのに実 AI を指定したとき。"""

    def test_returns_a_code_the_screen_can_branch_on(self, api_client, settings):
        settings.AI_PROVIDER = "openai"
        settings.OPENAI_API_KEY = ""

        response = _post(api_client)

        assert response.status_code == 503
        assert response.data["code"] == "AI_SERVICE_NOT_CONFIGURED"

    def test_tells_the_learner_without_blaming_them(self, api_client, settings):
        settings.AI_PROVIDER = "openai"
        settings.OPENAI_API_KEY = ""

        detail = _post(api_client).data["errors"]["detail"][0]

        assert "利用できません" in detail
        # 設定の話は利用者に見せない。直せるのは運営だけ
        assert "OPENAI_API_KEY" not in detail
        assert "AI_PROVIDER" not in detail

    def test_never_returns_a_fake_result(self, api_client, settings):
        """偽の結果を実 AI の答えとして返さないこと。ここが肝。"""
        settings.AI_PROVIDER = "openai"
        settings.OPENAI_API_KEY = ""

        response = _post(api_client)

        assert "result" not in response.data

    def test_does_not_spend_the_daily_quota(self, api_client, settings):
        """設定の抜けで、利用者の1日の回数を削らないこと。

        設定が無いのは運営側の落ち度で、利用者に払わせるものではない。
        """
        from apps.lessons.models import AiUsageCounter

        settings.AI_PROVIDER = "openai"
        settings.OPENAI_API_KEY = ""

        _post(api_client)

        assert AiUsageCounter.objects.count() == 0

    def test_mock_still_works_for_development(self, api_client, settings):
        settings.AI_PROVIDER = "mock"

        assert _post(api_client).status_code == 200


@pytest.mark.django_db
class TestInputLimit:
    """長すぎる入力は送らない。費用も待ち時間も伸びる。"""

    @pytest.fixture(autouse=True)
    def _mock(self, settings):
        settings.AI_PROVIDER = "mock"

    def test_too_long_input_is_refused(self, api_client, settings):
        response = _post(
            api_client,
            input={**REWRITE_INPUT, "original_text": "あ" * 6000},
        )

        assert response.status_code == 400

    def test_the_limit_comes_from_settings(self, api_client, settings):
        """環境変数で下げられること。"""
        from apps.ai import serializers

        assert serializers.MAX_BODY_LENGTH == settings.AI_MAX_INPUT_CHARACTERS


@pytest.mark.django_db
class TestGuestAndUserLimits:
    """ゲストと登録ユーザーで、1日の回数を分ける。"""

    @pytest.fixture(autouse=True)
    def _mock(self, settings):
        settings.AI_PROVIDER = "mock"

    def test_guest_limit_applies_when_not_signed_in(self, api_client, settings):
        settings.AI_DAILY_REQUEST_LIMIT_GUEST = 1
        settings.AI_DAILY_REQUEST_LIMIT_USER = 50

        assert _post(api_client).status_code == 200
        # 同じ内容の連打は別の理由（409）で弾かれるので、少し変える
        assert (
            _post(
                api_client,
                input={**REWRITE_INPUT, "original_text": "別の文章です。確認をお願いします。"},
            ).status_code
            == 429
        )

    def test_the_message_tells_them_to_come_back_tomorrow(self, api_client, settings):
        settings.AI_DAILY_REQUEST_LIMIT_GUEST = 0 if False else 1

        _post(api_client)
        detail = _post(
            api_client,
            input={**REWRITE_INPUT, "original_text": "別の文章です。確認をお願いします。"},
        ).data["errors"]["detail"][0]

        assert "明日" in detail
