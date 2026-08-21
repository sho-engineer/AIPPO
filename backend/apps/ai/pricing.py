"""AI呼び出しの概算費用（Phase 10: AI Cost Tracking）。

単価を設定していないプロバイダは **None** を返す。0円と「分からない」を
混同しないこと——推測の数字を「利用料」として画面に出すと、運営側が
実際の請求と食い違う数字を信じてしまう。

単価は `.env` の `AI_PRICE_<PROVIDER>_INPUT_PER_1K` /
`AI_PRICE_<PROVIDER>_OUTPUT_PER_1K`（USD、1,000トークンあたり）に、
実際の契約条件に合わせて運用側が入れる。ここにモデルごとの単価表を
直書きしないのは、単価は契約・値下げ・キャンペーンで頻繁に変わり、
コードを直してデプロイし直す運用に耐えないため。

MVPでは「プロバイダ単位」の単価だけを見る（モデルごとの単価差は見ない）。
モデル比較コースなど、同じプロバイダで複数モデルを併用するようになったら
プロバイダ単位では粗くなるので、そのとき見直す。
"""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings


def estimate_cost_usd(
    provider: str, input_tokens: int, output_tokens: int
) -> Decimal | None:
    """1回の呼び出しの概算費用（USD）。単価が無ければ None。"""
    prices = settings.AI_PRICE_PER_1K_TOKENS.get(provider)
    if not prices:
        return None

    input_price, output_price = prices
    if input_price is None or output_price is None:
        return None

    cost = (Decimal(input_tokens) / 1000 * Decimal(str(input_price))) + (
        Decimal(output_tokens) / 1000 * Decimal(str(output_price))
    )
    return cost.quantize(Decimal("0.000001"))
