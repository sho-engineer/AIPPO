"""課題の重さ（model_tier）から、行き先を決める層（apps/ai/routing.py）。

守りたいこと:
- 教材はモデル名を知らなくてよい。段階を言えば行き先が決まる
- モデル比較コースの名指しは、そのまま通す（上書きしない）
- 知らない段階でも学習は止めない。既定へ落として、警告は残す
- Credit消費量はコードに直書きしない（管理画面の AiTaskPricing が決める）
- 単価を入れ忘れた課題は 0。勝手に有料にしない
"""

from __future__ import annotations

import pytest

from apps.ai.routing import DEFAULT_TIER, credit_cost, resolve

pytestmark = pytest.mark.django_db


class TestResolve:
    def test_a_known_tier_picks_its_destination(self, settings):
        settings.AI_MODEL_TIERS = {
            "basic": {"provider": "gemini", "model": "gemini-2.5-flash"}
        }

        route = resolve(tier="basic")

        assert route.provider == "gemini"
        assert route.model == "gemini-2.5-flash"
        assert route.tier == "basic"

    def test_no_tier_falls_back_to_the_default_tier(self, settings):
        settings.AI_MODEL_TIERS = {DEFAULT_TIER: {"provider": "gemini", "model": None}}

        route = resolve()

        assert route.tier == DEFAULT_TIER
        assert route.provider == "gemini"

    def test_an_unknown_tier_falls_back_and_says_so(self, settings, caplog):
        """教材の書き間違いで学習を止めない。ただし黙って倒さない。"""
        settings.AI_MODEL_TIERS = {DEFAULT_TIER: {"provider": "gemini", "model": None}}

        with caplog.at_level("WARNING"):
            route = resolve(tier="tier_that_does_not_exist")

        assert route.tier == DEFAULT_TIER
        assert "unknown_tier" in caplog.text

    def test_an_empty_tier_map_still_returns_the_configured_provider(self, settings):
        """対応表を空にしても落ちない。AI_PROVIDER の設定で動く。"""
        settings.AI_MODEL_TIERS = {}
        settings.AI_PROVIDER = "mock"

        route = resolve(tier="basic")

        assert route.provider == "mock"
        assert route.model is None

    def test_the_model_is_left_to_the_provider_when_the_tier_does_not_name_one(
        self, settings
    ):
        """model が空なら、そのプロバイダの既定モデルに任せる。"""
        settings.AI_MODEL_TIERS = {"basic": {"provider": "gemini", "model": None}}

        assert resolve(tier="basic").model is None


class TestTheTierMapDoesNotFreezeTheProvider:
    """段階の表に、AI_PROVIDER の値を焼き付けないこと。

    焼き付けると、あとから AI_PROVIDER を変えても表は古いままになる。

        AI_PROVIDER=openai なのに鍵が無い
          → 表に残っていた mock へ流れる
          → **偽の答えが、本物のAIの答えとして利用者に出る**

    黙って mock へ倒すのは、この作りがいちばん避けたい失敗
    （apps/ai/providers/registry.py の AIServiceNotConfigured 参照）。
    一度これをやったので、ここで釘を刺しておく。
    """

    def test_changing_the_provider_afterwards_is_respected(self, settings):
        settings.AI_PROVIDER = "openai"

        assert resolve(tier="basic").provider == "openai"

    def test_the_shipped_map_does_not_name_a_provider_for_normal_tiers(self):
        """出荷時の設定そのものを見る（上書きしたものではなく）。"""
        from django.conf import settings as real_settings

        for tier in ("basic", "standard", "advanced"):
            entry = real_settings.AI_MODEL_TIERS[tier]
            assert not entry.get("provider"), (
                f"{tier} に行き先が焼き付いている。"
                "空にして、呼ばれた時点の AI_PROVIDER を見させること"
            )


class TestExplicitProviderIsNotOverridden:
    """モデル比較コースだけは、教材がモデル名を名指しできる。"""

    def test_an_explicit_model_is_passed_through(self, settings):
        settings.AI_MODEL_TIERS = {"basic": {"provider": "gemini", "model": "flash"}}

        route = resolve(tier="basic", provider="openai", model="gpt-5-nano")

        assert route.provider == "openai"
        assert route.model == "gpt-5-nano"

    def test_an_explicit_provider_alone_still_wins_over_the_tier(self, settings):
        settings.AI_MODEL_TIERS = {"basic": {"provider": "gemini", "model": "flash"}}

        route = resolve(tier="basic", provider="anthropic")

        assert route.provider == "anthropic"
        # 教材がモデルまでは言っていないので、プロバイダの既定に任せる
        assert route.model is None


class TestCreditCost:
    def test_the_cost_comes_from_the_admin_table(self):
        from apps.rewards.models import AiTaskPricing

        AiTaskPricing.objects.create(task_type="image_standard", credit_cost=2)

        assert credit_cost("image_standard") == 2

    def test_an_unpriced_task_costs_nothing(self):
        """入れ忘れただけで、学習者の残高を減らさない。"""
        assert credit_cost("task_nobody_priced") == 0

    def test_an_inactive_price_is_ignored(self):
        from apps.rewards.models import AiTaskPricing

        AiTaskPricing.objects.create(
            task_type="image_high", credit_cost=3, active=False
        )

        assert credit_cost("image_high") == 0
