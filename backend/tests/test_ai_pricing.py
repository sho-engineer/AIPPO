"""AI呼び出しの概算費用（apps/ai/pricing.py）。

守りたいこと:
- 単価を設定していないプロバイダは None（0円と混同しない）
- 設定してあれば、入力・出力それぞれの単価で正しく計算する
"""

from decimal import Decimal

from apps.ai.pricing import estimate_cost_usd


class TestEstimateCostUsd:
    def test_returns_none_when_provider_has_no_pricing(self, settings):
        settings.AI_PRICE_PER_1K_TOKENS = {}

        assert estimate_cost_usd("gemini", 1000, 1000) is None

    def test_returns_none_when_only_input_price_is_set(self, settings):
        """片方だけ設定されている状態は「未設定」として扱う。"""
        settings.AI_PRICE_PER_1K_TOKENS = {"gemini": (0.001, None)}

        assert estimate_cost_usd("gemini", 1000, 1000) is None

    def test_computes_cost_from_input_and_output_tokens(self, settings):
        settings.AI_PRICE_PER_1K_TOKENS = {"gemini": (0.10, 0.40)}

        # 入力2000トークン(0.10 × 2) + 出力1000トークン(0.40 × 1) = 0.60
        cost = estimate_cost_usd("gemini", 2000, 1000)

        assert cost == Decimal("0.600000")

    def test_zero_price_is_a_real_price_not_unknown(self, settings):
        """0円は「設定されている」うちに入る（未設定=Noneとは別）。"""
        settings.AI_PRICE_PER_1K_TOKENS = {"gemini": (0.0, 0.0)}

        assert estimate_cost_usd("gemini", 1000, 1000) == Decimal("0.000000")

    def test_zero_tokens_cost_nothing(self, settings):
        settings.AI_PRICE_PER_1K_TOKENS = {"gemini": (0.10, 0.40)}

        assert estimate_cost_usd("gemini", 0, 0) == Decimal("0.000000")
