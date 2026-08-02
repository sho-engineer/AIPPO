"""AIプロバイダのインターフェース。

プロバイダ固有の型・SDKをドメイン層／ビュー層へ漏らさない
（憲章 Technology Constraints）。
"""

from collections.abc import Iterator
from typing import Protocol, runtime_checkable


class AiProviderError(Exception):
    """AI呼び出しに失敗したことを表す。呼び出し側はフォールバックへ倒す。"""


class AiTimeoutError(AiProviderError):
    """AI呼び出しがタイムアウトした。"""


class AiProvider(Protocol):
    def generate_json(
        self,
        *,
        system_prompt: str,
        user_content: str,
        schema: dict,
        timeout_seconds: float,
        max_retries: int,
    ) -> dict:
        """スキーマに適合する JSON を1件返す。

        失敗時は AiProviderError（またはそのサブクラス）を送出する。
        戻り値のスキーマ適合は呼び出し側でも必ず検証すること。
        """
        ...


@runtime_checkable
class StreamingAiProvider(Protocol):
    """書きかけの文章を少しずつ返せるプロバイダ。

    学習者の待ち時間は、ほぼすべてAIの応答待ち。
    書き上がるまで黙って待たせるより、途中から見せたほうが体感が変わる。

    対応していないプロバイダもあるので、呼び出し側は
    `isinstance(provider, StreamingAiProvider)` で確認してから使い、
    駄目なら `generate_json` へ倒すこと。
    """

    def stream_text(
        self,
        *,
        system_prompt: str,
        user_content: str,
        timeout_seconds: float,
        meta_out: dict,
    ) -> Iterator[str]:
        """本文の断片を順に返す。

        利用料の記録用メタデータ（model_name / token_usage）は、
        流し終えたあとに `meta_out` へ書き込む。
        本文の流れに混ぜると、取り違えたときに学習者へ見えてしまう。

        失敗時は AiProviderError（またはそのサブクラス）を送出する。
        """
        ...
