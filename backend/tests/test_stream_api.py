"""書けたところから流す経路のテスト。

守りたいこと:
- 実際に**分割して**届くこと（まとめて届くなら流す意味がない）
- 記録（Attempt / 学習イベント）が通常の経路と同じであること
- 断るときも同じ形式で返り、受け手が2通りを扱わずに済むこと
- 途中で溜め込まれない指示が付いていること
"""

import json

import pytest
from django.urls import reverse

from apps.lessons.models import (
    Attempt,
    AttemptStatus,
    LearningEvent,
    LearningEventType,
    LearningSession,
)
from apps.tutor.services.base import AiProviderError, AiTimeoutError

VALID_REQUEST = {
    "original_text": "先日の件ですが、諸事情ございまして、現在調整中でございます。",
    "audience": "社外のお客様",
    "tone": "ていねいに",
    "length": "3行くらい",
}


def _parse(response) -> list[tuple[str, dict]]:
    """SSE の本文を (イベント名, データ) の並びにする。"""
    raw = b"".join(response.streaming_content).decode()
    events = []
    for block in raw.split("\n\n"):
        if not block.strip():
            continue
        name = ""
        data = "{}"
        for line in block.splitlines():
            if line.startswith("event: "):
                name = line[len("event: ") :]
            elif line.startswith("data: "):
                data = line[len("data: ") :]
        events.append((name, json.loads(data)))
    return events


@pytest.fixture
def streaming_ai(monkeypatch):
    """任意の断片を流すプロバイダに差し替える。"""

    def _apply(chunks: list[str], error: Exception | None = None):
        class _Provider:
            def generate_json(self, **kwargs):
                raise AssertionError("流す経路では generate_json を使わない")

            def stream_text(self, *, meta_out, **kwargs):
                yield from chunks
                if error is not None:
                    raise error
                meta_out["model_name"] = "claude-opus-5"
                meta_out["token_usage"] = {"input": 120, "output": 30}

        monkeypatch.setattr(
            "apps.lessons.views_stream.get_provider", lambda: _Provider()
        )

    return _apply


def _post(api_client, **overrides):
    payload = {**VALID_REQUEST, **overrides}
    return api_client.post(
        reverse("rewrite-text-stream"), payload, format="json"
    )


@pytest.mark.django_db
class TestStreaming:
    def test_text_arrives_in_pieces(self, api_client, streaming_ai):
        """まとめて届くなら、待ち時間の体感は変わらない。"""
        streaming_ai(["書き", "直した", "文章です。"])
        events = _parse(_post(api_client))

        chunks = [data["text"] for name, data in events if name == "chunk"]
        assert chunks == ["書き", "直した", "文章です。"]

    def test_final_event_carries_the_whole_text(self, api_client, streaming_ai):
        streaming_ai(["書き", "直した", "文章です。"])
        events = _parse(_post(api_client))

        name, data = events[-1]
        assert name == "done"
        assert data["text"] == "書き直した文章です。"

    def test_accepts_the_header_browsers_actually_send(
        self, api_client, streaming_ai
    ):
        """ブラウザは SSE を読むとき Accept: text/event-stream を送る。

        これを受け付けないと、curl（`*/*`）では通るのに
        ブラウザからだけ 406 で弾かれ、流し込みが黙って使われなくなる。
        """
        streaming_ai(["あ", "い"])
        response = api_client.post(
            reverse("rewrite-text-stream"),
            VALID_REQUEST,
            format="json",
            HTTP_ACCEPT="text/event-stream",
        )

        assert response.status_code == 200
        assert [name for name, _ in _parse(response)][-1] == "done"

    def test_response_asks_proxies_not_to_buffer(self, api_client, streaming_ai):
        """途中で溜め込まれると、流す意味が無くなる。"""
        streaming_ai(["あ", "い"])
        response = _post(api_client)

        assert response["Content-Type"].startswith("text/event-stream")
        assert response["X-Accel-Buffering"] == "no"
        assert "no-cache" in response["Cache-Control"]


@pytest.mark.django_db
class TestRecording:
    def test_records_the_same_things_as_the_normal_path(
        self, api_client, streaming_ai
    ):
        streaming_ai(["書き直した文章です。"])
        _parse(_post(api_client))

        attempt = Attempt.objects.get()
        assert attempt.status == AttemptStatus.SUCCEEDED
        assert attempt.generated_output == "書き直した文章です。"
        assert attempt.model_name == "claude-opus-5"
        assert attempt.token_usage == {"input": 120, "output": 30}
        assert attempt.latency_ms is not None

        assert LearningEvent.objects.filter(
            event_type=LearningEventType.AI_RUN_SUCCEEDED
        ).exists()

    def test_session_progresses(self, api_client, streaming_ai):
        streaming_ai(["書き直した文章です。"])
        _parse(_post(api_client, step="REAL_TASK"))

        session = LearningSession.objects.get()
        assert session.attempt_count == 1
        assert session.current_step == "REAL_TASK"

    def test_log_keeps_length_not_content(self, api_client, streaming_ai):
        """本文は操作ログに残さない（設計判断 Q-2）。"""
        streaming_ai(["書き直した文章です。"])
        _parse(_post(api_client))

        event = LearningEvent.objects.get(
            event_type=LearningEventType.AI_RUN_SUCCEEDED
        )
        assert event.input_length == len(VALID_REQUEST["original_text"])


@pytest.mark.django_db
class TestFailures:
    @pytest.mark.parametrize(
        "error,expected_status",
        [
            (AiProviderError("down"), AttemptStatus.FAILED),
            (AiTimeoutError("slow"), AttemptStatus.TIMEOUT),
        ],
        ids=["provider_error", "timeout"],
    )
    def test_failure_is_reported_and_recorded(
        self, api_client, streaming_ai, error, expected_status
    ):
        streaming_ai(["途中まで"], error=error)
        events = _parse(_post(api_client))

        assert events[-1][0] == "error"
        assert Attempt.objects.get().status == expected_status

    def test_error_message_has_no_jargon(self, api_client, streaming_ai):
        streaming_ai([], error=AiProviderError("boom"))
        events = _parse(_post(api_client))

        message = events[-1][1]["message"]
        assert "boom" not in message
        for word in ["API", "エラー", "例外", "タイムアウト"]:
            assert word not in message

    def test_provider_without_streaming_reports_an_error(
        self, api_client, monkeypatch
    ):
        """画面側はこれを見て、通常の生成へ倒す。"""

        class _NoStream:
            def generate_json(self, **kwargs):
                return {"rewritten_text": "x"}

        monkeypatch.setattr(
            "apps.lessons.views_stream.get_provider", lambda: _NoStream()
        )
        events = _parse(_post(api_client))
        assert events[-1][0] == "error"

    def test_empty_output_is_not_reported_as_success(
        self, api_client, streaming_ai
    ):
        streaming_ai(["   "])
        events = _parse(_post(api_client))

        assert events[-1][0] == "error"
        assert Attempt.objects.get().status == AttemptStatus.FAILED


@pytest.mark.django_db
class TestRefusalsUseTheSameShape:
    def test_invalid_input_is_refused_as_an_event(self, api_client, streaming_ai):
        """受け手が本文と例外の2通りを扱わずに済むよう、形式を揃える。"""
        streaming_ai(["x"])
        response = _post(api_client, original_text="")

        assert response.status_code == 400
        assert response["Content-Type"].startswith("text/event-stream")
        assert _parse(response)[-1][0] == "error"

    def test_session_limit_is_refused(self, api_client, streaming_ai, settings):
        settings.MAX_ATTEMPTS_PER_SESSION = 1
        streaming_ai(["書き直した文章です。"])

        _parse(_post(api_client))
        response = _post(api_client)

        assert response.status_code == 429
        assert _parse(response)[-1][0] == "error"

    def test_daily_limit_is_refused(self, api_client, streaming_ai, settings):
        settings.AI_RUNS_PER_IP_PER_DAY = 1
        settings.MAX_ATTEMPTS_PER_SESSION = 100
        streaming_ai(["書き直した文章です。"])

        _parse(_post(api_client))
        api_client.cookies.clear()
        response = _post(api_client)

        assert response.status_code == 429
        message = _parse(response)[-1][1]["message"]
        assert "また明日" in message

    def test_global_limit_is_refused_with_503(
        self, api_client, streaming_ai, settings
    ):
        settings.AI_RUNS_PER_DAY = 1
        settings.MAX_ATTEMPTS_PER_SESSION = 100
        streaming_ai(["書き直した文章です。"])

        _parse(_post(api_client))
        api_client.cookies.clear()
        assert _post(api_client).status_code == 503
