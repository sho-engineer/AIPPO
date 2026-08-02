"""AIプロバイダのインターフェース。

プロバイダ固有の型・SDKをドメイン層／ビュー層へ漏らさない
（憲章 Technology Constraints）。
"""

from typing import Protocol


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
