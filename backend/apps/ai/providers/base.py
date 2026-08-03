"""AIプロバイダの共通インターフェース。

プロバイダ固有の SDK・型を、教材エンジンや View へ漏らさない。
差し替えるのは `AI_PROVIDER` 環境変数だけで済むようにする。

  MockProvider      … 外部へ出ない。開発とテストの既定
  OpenAIProvider    … MVP の本番用
  GoogleProvider    … 将来（モデル比較コース用の枠だけ用意）
  AnthropicProvider … 将来（同上）

将来のモデル比較コースのために、**1回の呼び出しごとに**
provider と model を指定できる形にしてある。
教材データ側が持つ値をそのまま渡せば、同じ課題を別のモデルへ
送れる（同時実行は MVP では作らない）。
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field


class AIProviderError(Exception):
    """AI 呼び出しに失敗した。呼び出し側はフォールバックへ倒す。"""

    #: 記録用の種別。本文は残さないので、ここが唯一の手がかりになる。
    kind = "provider_error"


class AITimeoutError(AIProviderError):
    kind = "timeout"


class AIRefusedError(AIProviderError):
    kind = "refused"


class AIMalformedError(AIProviderError):
    """スキーマに合わない返答が来た。"""

    kind = "malformed"


@dataclass(frozen=True)
class AIRequest:
    """1回の呼び出しに必要なものだけを持つ。

    会話履歴は持たない。教材の1ステップは1リクエストで完結させる
    （履歴を持つとコストが読めなくなり、前の回答に引きずられる）。
    """

    system_prompt: str
    user_content: str
    #: 呼び出しごとの上書き。無ければ settings の既定を使う。
    model: str | None = None
    timeout_seconds: float | None = None
    max_output_tokens: int | None = None


@dataclass(frozen=True)
class AIUsage:
    """1回の呼び出しの実績。教材の結果とは別に必ず記録する。"""

    provider: str = ""
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0

    def as_dict(self) -> dict:
        return {
            "provider": self.provider,
            "model": self.model,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "latency_ms": self.latency_ms,
        }


@dataclass(frozen=True)
class AIResult:
    """テキストと構造化データの両方を1つの型で扱う。

    `generate_text` は text だけ、`generate_structured` は data だけを埋める。
    呼び出し側が型を分岐しなくて済むようにしている。
    """

    text: str = ""
    data: dict = field(default_factory=dict)
    usage: AIUsage = field(default_factory=AIUsage)


class AIProvider(abc.ABC):
    """すべてのプロバイダが満たす契約。

    実装側は例外を必ず `AIProviderError` の系統へ変換すること。
    SDK 固有の例外がそのまま上がると、View がプロバイダを知ることになる。
    """

    #: 記録に残す名前。`AI_PROVIDER` の値と一致させる。
    name: str = ""

    @abc.abstractmethod
    def generate_text(self, request: AIRequest) -> AIResult:
        """自由文を1件返す。"""

    @abc.abstractmethod
    def generate_structured(self, request: AIRequest, response_schema: dict) -> AIResult:
        """スキーマに適合する JSON を1件返す。

        返ってきた中身は**必ず呼び出し側でも検証すること**。
        構造化出力に対応していても、モデルは形を外すことがある。
        """
