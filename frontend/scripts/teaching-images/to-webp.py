#!/usr/bin/env python3
"""書き出した PNG を、教材の絵と同じ**可逆** WebP へ変換する。

    python3 scripts/teaching-images/to-webp.py day1_overview

なぜ可逆か
----------
教材の絵はどれも可逆WebP（VP8L）で置いてある。中身は文字と単色の面
なので、非可逆にすると小さな文字の縁が濁る。
`tests/teachingImages.test.tsx` は VP8L しか読まないので、
非可逆で置くとそこで落ちる。

なぜブラウザに任せないか
------------------------
Chromium の canvas は品質を 1 にしても VP8X の器へ入れてしまい、
先頭 12〜16 バイトが "VP8L" にならない。

用意するもの
------------
    python3 -m pip install Pillow

外から受け取った絵を置くときも、ここを通す（PNG でも JPEG でもよい）。

    python3 scripts/teaching-images/to-webp.py day1_overview --from ~/受け取った.png

支給された絵は上書きしない
--------------------------
`overviews.json` で `source: "supplied"` と書いてある絵は、版下から
作り直したもので**置き換えられない**ようにしてある。版下の試し刷りは
本物とよく似ていて（同じ文言を読ませているので当然）、取り違えると
支給された絵が静かに消える。どうしても置き換えるなら `--force`。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEACHING = HERE.parents[1] / "public/assets/teaching"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("name", help="絵の名前（例: day1_overview）")
    parser.add_argument("--from", dest="source", help="元の画像。既定は out/<name>.png")
    parser.add_argument(
        "--force",
        action="store_true",
        help="支給された絵（source: supplied）でも置き換える",
    )
    args = parser.parse_args()

    facts = json.loads((HERE / "overviews.json").read_text(encoding="utf-8"))
    entry = facts["images"].get(args.name, {})
    if entry.get("source") == "supplied" and not args.force:
        print(
            f"{args.name} は支給された絵（overviews.json の source: supplied）。\n"
            "版下の試し刷りで上書きしかけていないか確かめること。\n"
            "本当に置き換えるなら --force を付ける。",
            file=sys.stderr,
        )
        return 1

    try:
        from PIL import Image
    except ImportError:
        print("Pillow が要る: python3 -m pip install Pillow", file=sys.stderr)
        return 1

    source = Path(args.source) if args.source else HERE / "out" / f"{args.name}.png"
    if not source.exists():
        print(f"元の画像が無い: {source}", file=sys.stderr)
        return 1

    out = TEACHING / f"{args.name}.webp"
    image = Image.open(source).convert("RGB")
    image.save(out, "WEBP", lossless=True, quality=100, method=6)

    raw = out.read_bytes()
    kind = raw[12:16].decode("ascii", "replace")
    if kind != "VP8L":
        print(f"可逆WebPにならなかった: {kind}", file=sys.stderr)
        return 1

    print(f"{out}  {image.width}×{image.height}  {len(raw):,} bytes")
    print("次: src/course/teachingImages.ts の width/height と alt を合わせる")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
