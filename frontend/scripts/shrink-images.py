#!/usr/bin/env python3
"""配る絵を、見た目そのままで軽くする。

なぜ要るか
----------
`public/assets` の絵は**可逆 WebP** で置かれていた。可逆は「1ドットも
変えない」代わりに大きい——教材の絵は1枚 **約1.1MB**、全部で **37MB**
あった。

    compare_01_target.webp   1536×1024   881 KB
    day1_section_01.webp      941×1672  1091 KB

スマートフォンの回線でこれを取りに行くと、**文字だけ先に出て、絵が
あとから現れる**。実機の録画で「画像が遅れて出てくる」と言われたのは
これ。

なぜ品質を落としてよいか
------------------------
可逆のまま圧縮し直しても縮まない（実測 881KB → 887KB）。縮めるには
非可逆にするしかないので、**どこまで落とすと見えるか**を測った。

    q=95  192 KB
    q=90  141 KB   ← ここ
    q=85  114 KB

文字の多い図を 1:1 で見比べて、q=90 と元の差は見えなかった。PSNR は
34dB 前後だが、これは AI が描いた絵の地に乗っている細かなノイズを
数えているためで、輪郭や文字はそのまま。

寸法は変えない
--------------
幅を削れば更に縮むが、**変えない**。教材の絵の実寸は
`teachingImages.ts` が持っていて、読み込み前の場所取り（CLS 対策）に
使っている。寸法を動かすと、そちらも一緒に直さないと箱の高さが変わる
——軽くするだけのつもりで、絵が飛ぶ不具合を持ち込むことになる。

使い方
------
    python3 scripts/shrink-images.py          # 何が縮むかを見るだけ
    python3 scripts/shrink-images.py --write  # 実際に書き換える

元は git に入っているので、戻したくなったら `git checkout` で戻る。
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - 環境に無いときの案内
    sys.exit("Pillow が要ります: pip install Pillow")

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public"

#: 落とす先。ここを下げると更に縮むが、文字の輪郭が甘くなる。
QUALITY = 90

#: 圧縮にかける手間。6 が最も縮み、そのぶん遅い（1枚あたり1秒ほど）。
#: 配るのは作るときの1回きりなので、遅くてよい。
METHOD = 6

#: これより小さい絵は触らない。Po（25〜40KB）やロゴ（8〜18KB）は
#: すでに軽く、非可逆にし直す意味が無い。
SKIP_UNDER_BYTES = 120 * 1024


def shrink(path: Path) -> tuple[int, int] | None:
    """1枚を縮める。縮まなければ None。"""
    before = path.stat().st_size
    if before < SKIP_UNDER_BYTES:
        return None

    with Image.open(path) as opened:
        image = opened.convert("RGB")
        buffer = io.BytesIO()
        image.save(buffer, "WEBP", quality=QUALITY, method=METHOD)

    after = buffer.getbuffer().nbytes
    # 縮まないなら、そのままにしておく（触って大きくしない）
    if after >= before:
        return None
    return before, after


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write", action="store_true", help="実際に書き換える（既定は下見だけ）"
    )
    args = parser.parse_args()

    targets = sorted(PUBLIC.rglob("*.webp"))
    if not targets:
        print("絵が1枚も見つからない", file=sys.stderr)
        return 1

    total_before = total_after = 0
    touched = 0

    for path in targets:
        result = shrink(path)
        if result is None:
            total_before += path.stat().st_size
            total_after += path.stat().st_size
            continue

        before, after = result
        total_before += before
        total_after += after
        touched += 1

        if args.write:
            with Image.open(path) as opened:
                image = opened.convert("RGB")
            image.save(path, "WEBP", quality=QUALITY, method=METHOD)

        print(
            f"{before / 1024:8.0f} KB -> {after / 1024:7.0f} KB"
            f"  ({100 - after * 100 // before:2d}% 減)  {path.relative_to(PUBLIC)}"
        )

    print(
        f"\n{touched} 枚 / 全 {len(targets)} 枚"
        f"   {total_before / 1048576:.1f} MB -> {total_after / 1048576:.1f} MB"
    )
    if not args.write:
        print("下見だけ。書き換えるなら --write")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
