"""どの課題を、どのモデルへ送るかを決める（設計方針 §15 / §16）。

教材（Lesson / LessonStep）に `gemini-2.5-flash` や `gpt-5-nano` を
**書かない**ための層。教材が言うのは「何をしたいか」だけにする。

    task_type   … 何をしたいか（rewrite / summarize / image_generate …）
    model_tier  … どのくらいの重さで（basic / standard / advanced …）

この2つから、サーバー側で provider・model・Credit消費量を決める。
モデルを乗り換えるとき、教材データを1件も触らずに済む。

なぜ教材に書かないか
--------------------
モデル名は年に何度も変わる。教材データに散らばっていると、乗り換えの
たびに全教材を書き換えることになり、書き換え漏れた教材だけが古い
モデルを指したまま動き続ける（しかも動くので気づけない）。

`AI_MODEL_TIERS` は settings に置く。運用側が `.env` で上書きできる。

モデル比較コースだけは例外
--------------------------
「同じ課題を別のモデルへ送って見比べる」教材では、モデル名そのものが
教えたい中身なので、教材データが provider / model を直接指定できる。
`resolve()` は、その指定があればそのまま通す（上書きしない）。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from django.conf import settings

logger = logging.getLogger(__name__)

#: 教材が使ってよい重さの段階。
#: comparison_* はモデル比較コース用（利用者にモデル名を見せる教材）。
MODEL_TIERS = (
    "basic",
    "standard",
    "advanced",
    "image_standard",
    "image_high",
    "comparison_openai",
    "comparison_anthropic",
)

#: 指定が無いときの重さ。無料コースの基本のテキスト処理はここに来る。
DEFAULT_TIER = "basic"


@dataclass(frozen=True)
class Route:
    """1回の呼び出しの行き先。

    `credit_cost` は `AiTaskPricing`（管理画面から変えられる）が決める。
    ここでは持たない——値をコードに直書きしないため。
    """

    provider: str
    model: str | None
    tier: str

    def as_dict(self) -> dict:
        return {"provider": self.provider, "model": self.model, "tier": self.tier}


def _tier_map() -> dict[str, dict]:
    """段階 → {provider, model} の対応。settings 側で上書きできる。"""
    return getattr(settings, "AI_MODEL_TIERS", {}) or {}


def resolve(
    *,
    tier: str | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> Route:
    """行き先を決める。

    `provider` / `model` が来ていれば、そのまま通す（モデル比較コース用）。
    来ていなければ `tier` から決める。`tier` も無ければ既定の段階を使う。

    知らない段階を渡されたら、黙って別の段階へ倒さず既定へ落として
    **警告を残す**。倒したこと自体が分からないと、教材の書き間違いが
    「なぜか安いモデルで動いている」という形で埋もれる。
    """
    if provider or model:
        # 教材が名指ししている。ここでは上書きしない
        return Route(
            provider=(provider or settings.AI_PROVIDER),
            model=model,
            tier=tier or "explicit",
        )

    wanted = (tier or DEFAULT_TIER).strip().lower()
    mapping = _tier_map()

    entry = mapping.get(wanted)
    if entry is None:
        if wanted != DEFAULT_TIER:
            logger.warning("ai.routing.unknown_tier tier=%s", wanted)
        entry = mapping.get(DEFAULT_TIER) or {}
        wanted = DEFAULT_TIER

    return Route(
        provider=entry.get("provider") or settings.AI_PROVIDER,
        model=entry.get("model") or None,
        tier=wanted,
    )


def credit_cost(task_type: str) -> int:
    """この課題にかかる Credit。管理画面（AiTaskPricing）が決める。

    決まっていない課題は 0 として扱う。ここで勝手に「1」にすると、
    値を入れ忘れただけで学習者の残高が減る。無料のつもりだったものが
    黙って有料になるほうが害が大きい。
    """
    from apps.rewards.models import AiTaskPricing

    row = AiTaskPricing.objects.filter(task_type=task_type, active=True).first()
    return row.credit_cost if row else 0
