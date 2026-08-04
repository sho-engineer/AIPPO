"""外部へ出ないプロバイダ。

`AI_PROVIDER=mock` のとき使う。開発とテストの既定。

守っていること:
- **決定論的**。同じ入力からは必ず同じ出力が出る
- 依頼の条件を出力に映す。条件を変えると結果が変わることが
  画面で確認できないと、教材として意味がない
- 待ち時間をわざと足さない

テストは必ずこれを使う。本物のAPIを叩くテストは、
鍵の有無で落ちたり、費用がかかったりして、誰も回さなくなる。
"""

from __future__ import annotations

import hashlib
import json
import time

from apps.ai.providers.base import (
    AIProvider,
    AIRequest,
    AIResult,
    AIUsage,
)

MOCK_MODEL = "mock-1"

#: 元の文章の見出しに使う目印。プロンプト側と合わせてある。
SOURCE_MARKER = "--- 対象 ---"


def _split_prompt(user_content: str) -> tuple[str, str]:
    """依頼の条件部分と、対象の本文に分ける。"""
    index = user_content.find(SOURCE_MARKER)
    if index < 0:
        return user_content.strip(), ""
    return (
        user_content[:index].strip(),
        user_content[index + len(SOURCE_MARKER) :].strip(),
    )


def _digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:6]


def _estimate_tokens(text: str) -> int:
    """おおよそのトークン数。

    実際の数え方はモデルごとに違うので、ここは目安でよい。
    記録の経路が動いていることを確かめるために入れている。
    """
    return max(1, len(text) // 3)


class MockProvider(AIProvider):
    name = "mock"

    def __init__(self, model: str | None = None) -> None:
        self._model = model or MOCK_MODEL

    def _usage(self, request: AIRequest, output: str, started: float) -> AIUsage:
        return AIUsage(
            provider=self.name,
            model=request.model or self._model,
            input_tokens=_estimate_tokens(request.system_prompt + request.user_content),
            output_tokens=_estimate_tokens(output),
            latency_ms=int((time.monotonic() - started) * 1000),
        )

    def generate_text(self, request: AIRequest) -> AIResult:
        started = time.monotonic()
        text = self._compose(request.user_content)
        return AIResult(text=text, usage=self._usage(request, text, started))

    def generate_structured(self, request: AIRequest, response_schema: dict) -> AIResult:
        started = time.monotonic()
        data = self._compose_structured(request.user_content, response_schema)
        rendered = json.dumps(data, ensure_ascii=False)
        return AIResult(
            text=data.get("result", ""),
            data=data,
            usage=self._usage(request, rendered, started),
        )

    # -- 中身の組み立て ---------------------------------------------------

    def _compose(self, user_content: str) -> str:
        """条件を映した固定応答。

        **指定した条件を必ず出力へ映す**のが肝心。
        条件を変えても結果が同じだと、教材の要である
        「伝え方を変えると答えが変わる」が画面で確認できない。

        「（テスト用）」と明示する。本物の出力だと誤解されると、
        AI が動いていない事故を見逃す。
        """
        condition, body = _split_prompt(user_content)
        head = body[:80] + ("…" if len(body) > 80 else "")

        lines = ["（テスト用の応答です）"]
        chosen = [line for line in condition.splitlines() if line.startswith("- ")]
        if chosen:
            lines.append("指定された条件: " + " / ".join(c[2:] for c in chosen))
        if head:
            lines.append(head)
        return "\n".join(lines)

    def _compose_structured(self, user_content: str, schema: dict) -> dict:
        """スキーマの必須項目を埋める。

        型に合わせて機械的に埋めるので、教材が増えて
        スキーマが変わっても、モック側を直す必要がない。
        """
        properties: dict = schema.get("properties", {})
        required = schema.get("required", list(properties))
        body = self._compose(user_content)
        seed = _digest(user_content)

        payload: dict = {}
        for key in required:
            spec = properties.get(key, {})
            payload[key] = self._fill(key, spec, body, seed)
        return payload

    def _fill(self, key: str, spec: dict, body: str, seed: str):
        kind = spec.get("type", "string")

        if kind == "array":
            item = spec.get("items", {})
            if item.get("type") == "object":
                return [self._fill_object(item, body, seed, index) for index in range(3)]
            return [f"（テスト用）{key} {index + 1}" for index in range(3)]

        if kind == "object":
            return self._fill_object(spec, body, seed, 0)

        if kind in ("integer", "number"):
            return 0

        if kind == "boolean":
            return False

        if key in ("result", "text", "output"):
            return body
        return f"（テスト用）{key} #{seed}"

    def _fill_object(self, spec: dict, body: str, seed: str, index: int) -> dict:
        properties: dict = spec.get("properties", {})
        required = spec.get("required", list(properties))
        return {
            key: self._fill(key, properties.get(key, {}), body, f"{seed}{index}")
            for key in required
        }
