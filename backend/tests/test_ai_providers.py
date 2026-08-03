"""プロバイダの差し替え層。

守りたいこと:
- `AI_PROVIDER` を変えるだけで差し替わること
- 鍵が無いときに落ちず、mock へ倒れること（倒したことは分かる形で）
- SDK 固有の例外が View まで漏れないこと
- タイムアウトと上限が設定どおり渡ること
"""

import pytest

from apps.ai.providers.base import (
    AIMalformedError,
    AIProviderError,
    AIRequest,
    AITimeoutError,
)
from apps.ai.providers.mock import MockProvider
from apps.ai.providers.registry import available_providers, get_provider

REQUEST = AIRequest(system_prompt="決まり", user_content="やること\n\n--- 対象 ---\n本文")

SCHEMA = {
    "type": "object",
    "properties": {"result": {"type": "string"}},
    "required": ["result"],
    "additionalProperties": False,
}


class TestRegistry:
    def test_mock_is_selected_by_name(self, settings):
        settings.AI_PROVIDER = "mock"
        assert get_provider().name == "mock"

    def test_stub_is_an_alias_of_mock(self, settings):
        """以前の呼び名。設定を書き換えなくても動くようにしておく。"""
        settings.AI_PROVIDER = "stub"
        assert get_provider().name == "mock"

    def test_openai_is_selected_when_a_key_exists(self, settings):
        settings.AI_PROVIDER = "openai"
        settings.OPENAI_API_KEY = "sk-test"
        assert get_provider().name == "openai"

    def test_missing_key_falls_back_to_mock(self, settings, caplog):
        """鍵の入れ忘れでアプリ全体が動かないように見えるのを避ける。

        ただし黙って偽物を返すと、本番で気づけない。警告を必ず残す。
        """
        settings.AI_PROVIDER = "openai"
        settings.OPENAI_API_KEY = ""

        with caplog.at_level("WARNING"):
            provider = get_provider()

        assert provider.name == "mock"
        assert "missing_key" in caplog.text

    def test_unknown_name_falls_back_to_mock(self, settings, caplog):
        settings.AI_PROVIDER = "somethingelse"
        with caplog.at_level("WARNING"):
            assert get_provider().name == "mock"
        assert "unknown" in caplog.text

    def test_planned_providers_are_accepted_but_not_implemented(self, settings, caplog):
        """将来のモデル比較コース用。名前だけ受け付ける。"""
        settings.AI_PROVIDER = "google"
        with caplog.at_level("WARNING"):
            assert get_provider().name == "mock"
        assert "not_implemented" in caplog.text

    def test_call_site_can_override_provider_and_model(self, settings):
        """モデル比較コースは、呼び出しごとに指定する。"""
        settings.AI_PROVIDER = "openai"
        settings.OPENAI_API_KEY = "sk-test"

        provider = get_provider("mock", "mock-9")
        assert provider.name == "mock"
        assert provider.generate_text(REQUEST).usage.model == "mock-9"

    def test_future_providers_are_listed(self):
        assert {"mock", "openai", "anthropic", "google"} <= set(available_providers())


class TestMockProvider:
    def test_is_deterministic(self):
        provider = MockProvider()
        assert (
            provider.generate_text(REQUEST).text
            == provider.generate_text(REQUEST).text
        )

    def test_records_usage(self):
        usage = MockProvider().generate_text(REQUEST).usage
        assert usage.provider == "mock"
        assert usage.input_tokens > 0
        assert usage.output_tokens > 0
        assert usage.latency_ms >= 0

    def test_fills_every_required_key_of_the_schema(self):
        schema = {
            "type": "object",
            "properties": {
                "result": {"type": "string"},
                "steps": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "detail": {"type": "string"},
                        },
                        "required": ["title", "detail"],
                    },
                },
            },
            "required": ["result", "steps"],
        }
        data = MockProvider().generate_structured(REQUEST, schema).data

        assert isinstance(data["result"], str)
        assert len(data["steps"]) == 3
        assert set(data["steps"][0]) == {"title", "detail"}

    def test_never_reaches_the_network(self, monkeypatch):
        """モックが外へ出ていないこと。

        出ていたら、テストが鍵と回線に依存してしまう。
        """
        import socket

        def _boom(*args, **kwargs):
            raise AssertionError("外部へ接続しようとした")

        monkeypatch.setattr(socket.socket, "connect", _boom)
        assert MockProvider().generate_structured(REQUEST, SCHEMA).data["result"]


class _FakeOpenAI:
    """OpenAI SDK の最低限の振る舞いを真似る。

    本物を叩かずに、例外の翻訳と利用実績の取り出しだけを確かめたい。
    """

    def __init__(self, response=None, error=None) -> None:
        self._response = response
        self._error = error
        self.captured: dict = {}
        self.responses = self

    def with_options(self, **kwargs):
        self.captured["options"] = kwargs
        return self

    def create(self, **kwargs):
        self.captured.update(kwargs)
        if self._error is not None:
            raise self._error
        return self._response


class _FakeResponse:
    def __init__(self, text: str, model: str = "gpt-5-nano") -> None:
        self.output_text = text
        self.model = model
        self.output = []
        self.usage = type("U", (), {"input_tokens": 11, "output_tokens": 22})()


class TestOpenAIProvider:
    def _provider(self, client):
        from apps.ai.providers.openai_provider import OpenAIProvider

        return OpenAIProvider(client=client, model="gpt-5-nano")

    def test_structured_output_is_parsed_and_usage_recorded(self):
        client = _FakeOpenAI(_FakeResponse('{"result": "書き直した文章"}'))
        result = self._provider(client).generate_structured(REQUEST, SCHEMA)

        assert result.data["result"] == "書き直した文章"
        assert result.usage.provider == "openai"
        assert result.usage.model == "gpt-5-nano"
        assert result.usage.input_tokens == 11
        assert result.usage.output_tokens == 22

    def test_schema_is_sent_to_the_model(self):
        client = _FakeOpenAI(_FakeResponse('{"result": "x"}'))
        self._provider(client).generate_structured(REQUEST, SCHEMA)

        text_format = client.captured["text"]["format"]
        assert text_format["type"] == "json_schema"
        assert text_format["strict"] is True
        assert text_format["schema"] == SCHEMA

    def test_timeout_and_token_cap_are_applied(self, settings):
        settings.AI_REQUEST_TIMEOUT_SECONDS = 7
        settings.AI_MAX_OUTPUT_TOKENS = 123

        client = _FakeOpenAI(_FakeResponse('{"result": "x"}'))
        self._provider(client).generate_structured(REQUEST, SCHEMA)

        assert client.captured["options"]["timeout"] == 7
        assert client.captured["max_output_tokens"] == 123

    def test_timeout_is_translated(self):
        import openai

        error = openai.APITimeoutError(request=None)
        client = _FakeOpenAI(error=error)

        with pytest.raises(AITimeoutError):
            self._provider(client).generate_structured(REQUEST, SCHEMA)

    def test_api_error_is_translated(self):
        import openai

        error = openai.APIError("boom", request=None, body=None)
        client = _FakeOpenAI(error=error)

        with pytest.raises(AIProviderError):
            self._provider(client).generate_structured(REQUEST, SCHEMA)

    def test_malformed_json_is_translated(self):
        client = _FakeOpenAI(_FakeResponse("これはJSONではない"))

        with pytest.raises(AIMalformedError):
            self._provider(client).generate_structured(REQUEST, SCHEMA)

    def test_empty_text_is_translated(self):
        client = _FakeOpenAI(_FakeResponse("   "))

        with pytest.raises(AIMalformedError):
            self._provider(client).generate_text(REQUEST)
