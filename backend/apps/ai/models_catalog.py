"""学習者に選ばせてよいモデルの一覧。

モデル名を画面（React コンポーネント）へ書かないための置き場。
画面は `GET /api/v1/ai/models/` で受け取った一覧をそのまま並べるだけで、
どんな名前があるかを知らない。

なぜ画面に書かないか
--------------------
- モデルは入れ替わる。名前を画面に埋めると、差し替えのたびに
  フロントの再ビルドと配信が要る
- 鍵の有無や契約によって、使える先は環境ごとに違う。
  それを知っているのはサーバーだけ
- 「どれを勧めるか」は運用の判断で、見た目の都合ではない

既定値は settings.AI_MODEL。ここに載っていないモデルが既定に
なっている場合でも、一覧の先頭に「いまの既定」として必ず出す。
選べる先が実際と食い違って見えるほうが困る。
"""

from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings


@dataclass(frozen=True)
class ModelChoice:
    """学習者に見せる1件。

    `id` は API へ渡す値、`label` は画面に出す名前。
    `note` は選ぶときの手がかりで、専門用語を使わない。
    """

    id: str
    label: str
    note: str
    provider: str


#: 並び順がそのまま画面の並び順になる。上ほど勧めたいもの。
CHOICES: tuple[ModelChoice, ...] = (
    ModelChoice(
        id="gpt-5-nano",
        label="標準",
        note="速くて費用が低い。ふだんの練習はこれで足ります",
        provider="openai",
    ),
    ModelChoice(
        id="gpt-5-mini",
        label="じっくり",
        note="時間はかかりますが、長い文章の整理が得意です",
        provider="openai",
    ),
)


def available_models() -> list[dict[str, object]]:
    """選べるモデルの一覧を、画面が使える形で返す。

    いまの既定に印を付ける。どれが既定かを画面側で判断させると、
    設定を変えたときに印だけ古いまま残る。
    """
    default = (settings.AI_MODEL or "").strip()
    items = [
        {
            "id": choice.id,
            "label": choice.label,
            "note": choice.note,
            "provider": choice.provider,
            "recommended": choice.id == default,
        }
        for choice in CHOICES
    ]

    # 既定が一覧に無いときは、先頭に足して食い違いを見せない
    if default and not any(item["id"] == default for item in items):
        items.insert(
            0,
            {
                "id": default,
                "label": "標準",
                "note": "いまの既定です",
                "provider": settings.AI_PROVIDER,
                "recommended": True,
            },
        )

    return items


def is_selectable(model_id: str) -> bool:
    """学習者が選んでよいモデルかどうか。

    画面から来た値をそのままプロバイダへ渡さないための関門。
    ここを通さないと、任意のモデル名を送りつけられる。
    """
    return any(item["id"] == model_id for item in available_models())
