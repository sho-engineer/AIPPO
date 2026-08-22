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
from apps.ai.providers.registry import (
    AIServiceNotConfigured,
    available_providers,
    check_configured,
    get_provider,
)

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

    def test_missing_key_fails_loudly(self, settings, caplog):
        """鍵が無いのに openai を指定したら、はっきり失敗すること。

        以前はここで黙って mock へ倒していた。それはやってはいけない。
        倒すと、利用者には**固定の偽の結果が本物の AI の答えとして出る**。
        運営側も画面が動いているので、鍵の入れ忘れに気づけない。
        """
        settings.AI_PROVIDER = "openai"
        settings.OPENAI_API_KEY = ""

        with caplog.at_level("ERROR"), pytest.raises(AIServiceNotConfigured):
            get_provider()

        assert "missing_key" in caplog.text

    def test_unknown_name_fails_loudly(self, settings, caplog):
        settings.AI_PROVIDER = "somethingelse"

        with caplog.at_level("ERROR"), pytest.raises(AIServiceNotConfigured):
            get_provider()

        assert "unknown" in caplog.text

    def test_planned_providers_fail_loudly(self, settings, caplog, monkeypatch):
        """名前だけで実体が無い先も、黙って別の先へ回さない。"""
        import apps.ai.providers.registry as registry

        monkeypatch.setattr(registry, "PLANNED", ("future_provider",))
        settings.AI_PROVIDER = "future_provider"

        with caplog.at_level("ERROR"), pytest.raises(AIServiceNotConfigured):
            get_provider()

        assert "not_implemented" in caplog.text

    def test_gemini_is_selected_when_a_key_exists(self, settings):
        settings.AI_PROVIDER = "gemini"
        settings.GEMINI_API_KEY = "test-key"
        assert get_provider().name == "gemini"

    def test_google_is_an_alias_of_gemini(self, settings):
        """以前の仮の呼び名。設定を書き換えなくても動くようにしておく。"""
        settings.AI_PROVIDER = "google"
        settings.GEMINI_API_KEY = "test-key"
        assert get_provider().name == "gemini"

    def test_gemini_missing_key_fails_loudly(self, settings, caplog):
        settings.AI_PROVIDER = "gemini"
        settings.GEMINI_API_KEY = ""

        with caplog.at_level("ERROR"), pytest.raises(AIServiceNotConfigured):
            get_provider()

        assert "missing_key" in caplog.text

    def test_the_error_carries_a_code_and_a_message_for_users(self, settings):
        """画面がコードで分岐でき、利用者には言い訳がましくない文が出ること。"""
        settings.AI_PROVIDER = "openai"
        settings.OPENAI_API_KEY = ""

        with pytest.raises(AIServiceNotConfigured) as caught:
            get_provider()

        assert caught.value.code == "AI_SERVICE_NOT_CONFIGURED"
        assert "利用できません" in caught.value.detail

    def test_check_configured_passes_on_mock(self, settings):
        settings.AI_PROVIDER = "mock"
        check_configured()

    def test_check_configured_fails_without_a_key(self, settings):
        settings.AI_PROVIDER = "openai"
        settings.OPENAI_API_KEY = ""

        with pytest.raises(AIServiceNotConfigured):
            check_configured()

    def test_call_site_can_override_provider_and_model(self, settings):
        """モデル比較コースは、呼び出しごとに指定する。"""
        settings.AI_PROVIDER = "openai"
        settings.OPENAI_API_KEY = "sk-test"

        provider = get_provider("mock", "mock-9")
        assert provider.name == "mock"
        assert provider.generate_text(REQUEST).usage.model == "mock-9"

    def test_future_providers_are_listed(self):
        assert {"mock", "openai", "anthropic", "gemini", "google"} <= set(
            available_providers()
        )


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


class _FakeGeminiModels:
    """google-genai SDK の `client.models` の最低限の振る舞いを真似る。

    本物を叩かずに、例外の翻訳と利用実績の取り出しだけを確かめたい。
    """

    def __init__(self, response=None, error=None) -> None:
        self._response = response
        self._error = error
        self.captured: dict = {}

    def generate_content(self, **kwargs):
        self.captured.update(kwargs)
        if self._error is not None:
            raise self._error
        return self._response


class _FakeGeminiClient:
    def __init__(self, response=None, error=None) -> None:
        self.models = _FakeGeminiModels(response, error)


class _FakeGeminiUsage:
    def __init__(self, prompt: int = 11, candidates: int = 22) -> None:
        self.prompt_token_count = prompt
        self.candidates_token_count = candidates


class _FakeGeminiCandidate:
    def __init__(self, finish_reason: str = "STOP") -> None:
        self.finish_reason = finish_reason


class _FakeGeminiResponse:
    def __init__(
        self, text: str, model: str = "gemini-2.5-flash", finish_reason: str = "STOP"
    ) -> None:
        self.text = text
        self.model_version = model
        self.usage_metadata = _FakeGeminiUsage()
        self.candidates = [_FakeGeminiCandidate(finish_reason)]


class TestGeminiProvider:
    def _provider(self, client):
        from apps.ai.providers.gemini_provider import GeminiProvider

        return GeminiProvider(client=client, model="gemini-2.5-flash")

    def test_structured_output_is_parsed_and_usage_recorded(self):
        client = _FakeGeminiClient(_FakeGeminiResponse('{"result": "書き直した文章"}'))
        result = self._provider(client).generate_structured(REQUEST, SCHEMA)

        assert result.data["result"] == "書き直した文章"
        assert result.usage.provider == "gemini"
        assert result.usage.model == "gemini-2.5-flash"
        assert result.usage.input_tokens == 11
        assert result.usage.output_tokens == 22

    def test_schema_is_sent_to_the_model(self):
        client = _FakeGeminiClient(_FakeGeminiResponse('{"result": "x"}'))
        self._provider(client).generate_structured(REQUEST, SCHEMA)

        config = client.models.captured["config"]
        assert config.response_mime_type == "application/json"
        assert config.response_json_schema == SCHEMA

    def test_timeout_and_token_cap_are_applied(self, settings):
        settings.AI_REQUEST_TIMEOUT_SECONDS = 7
        settings.AI_MAX_OUTPUT_TOKENS = 123

        client = _FakeGeminiClient(_FakeGeminiResponse('{"result": "x"}'))
        self._provider(client).generate_structured(REQUEST, SCHEMA)

        config = client.models.captured["config"]
        assert config.http_options.timeout == 7000
        assert config.max_output_tokens == 123

    def test_timeout_is_translated(self):
        from google.genai import errors

        error = errors.APIError(504, {"error": {"message": "boom"}})
        client = _FakeGeminiClient(error=error)

        with pytest.raises(AITimeoutError):
            self._provider(client).generate_structured(REQUEST, SCHEMA)

    def test_api_error_is_translated(self):
        from google.genai import errors

        error = errors.APIError(500, {"error": {"message": "boom"}})
        client = _FakeGeminiClient(error=error)

        with pytest.raises(AIProviderError):
            self._provider(client).generate_structured(REQUEST, SCHEMA)

    def test_refusal_is_translated(self):
        from apps.ai.providers.base import AIRefusedError

        client = _FakeGeminiClient(_FakeGeminiResponse("", finish_reason="SAFETY"))

        with pytest.raises(AIRefusedError):
            self._provider(client).generate_text(REQUEST)

    def test_malformed_json_is_translated(self):
        client = _FakeGeminiClient(_FakeGeminiResponse("これはJSONではない"))

        with pytest.raises(AIMalformedError):
            self._provider(client).generate_structured(REQUEST, SCHEMA)

    def test_empty_text_is_translated(self):
        client = _FakeGeminiClient(_FakeGeminiResponse("   "))

        with pytest.raises(AIMalformedError):
            self._provider(client).generate_text(REQUEST)


class TestEveryKeyIsWiredUp:
    """鍵の設定名が、settings に**存在すること**。

    registry.py は settings しか見ない。環境変数を読む行を settings に
    書き忘れると、鍵を渡しているのに「設定されていません」で失敗する。
    エラーの文言が「鍵が無い」なので、渡している本人はまず疑わない。

    実際に ANTHROPIC_API_KEY がこれで死んでいた。
    .env.example にも compose にも載っていたのに、settings に無かった。
    """

    def test_each_provider_key_exists_in_settings(self, settings):
        from apps.ai.providers.registry import REQUIRED_KEYS

        missing = [
            name for name in REQUIRED_KEYS.values() if not hasattr(settings, name)
        ]

        assert not missing, f"settings に無い: {missing}（config/settings.py へ足す）"

    def test_a_key_given_through_the_environment_reaches_the_provider(self, settings):
        """鍵を入れたら、その先が実際に組み立てられること。"""
        from apps.ai.providers.registry import AIServiceNotConfigured, get_provider

        settings.ANTHROPIC_API_KEY = "test-key-not-a-real-one"
        settings.AI_PROVIDER = "anthropic"

        try:
            provider = get_provider()
        except AIServiceNotConfigured as exc:
            raise AssertionError(f"鍵を渡したのに断られた: {exc}") from exc
        except ImportError:
            pytest.skip("SDK が入っていない")

        assert provider is not None
