#!/usr/bin/env python3
"""ロゴ画像から、画面で使う形を切り出す。

支給されたロゴは4案が1枚に並んでいて、背景が薄いグレーで塗られている。
そのまま使うと画面の下地から浮くので、背景を抜く。

**外側から塗りつぶして抜く**のが肝心。
明るい色をまとめて透明にすると、キャラクターの白い体まで消える。
体は輪郭で囲まれているので、外から流し込めば中には入らない。

使い方
------
    python scripts/build-logo.py <ロゴ画像>
"""

import pathlib
import sys
from collections import deque

from PIL import Image

OUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "public/brand"

#: 4案の位置（左上・右上・左下・右下）と、出力名。
QUADRANTS = {
    "logo-horizontal": (0, 0),  # キャラクター＋AIPPO。画面の見出しに使う
    "app-icon": (1, 0),  # 角丸の四角。favicon に使う
    "logo-stacked": (0, 1),  # キャラクターの下に AIPPO
}

#: 背景と見なす色の幅。グラデーションがかかっているので少し広めに取る。
TOLERANCE = 26


def remove_background(image: Image.Image) -> Image.Image:
    """外側から塗りつぶして、背景だけを透明にする。"""
    image = image.convert("RGBA")
    w, h = image.size
    px = image.load()

    # 四辺の色の平均を背景色と見なす
    edge = [px[x, 0] for x in range(0, w, 4)] + [px[x, h - 1] for x in range(0, w, 4)]
    base = tuple(sum(c[i] for c in edge) // len(edge) for i in range(3))

    def is_background(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        return a > 0 and all(abs(v - base[i]) <= TOLERANCE for i, v in enumerate((r, g, b)))

    queue = deque()
    seen = [[False] * w for _ in range(h)]
    for x in range(w):
        for y in (0, h - 1):
            if not seen[y][x] and is_background(x, y):
                seen[y][x] = True
                queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y][x] and is_background(x, y):
                seen[y][x] = True
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and is_background(nx, ny):
                seen[ny][nx] = True
                queue.append((nx, ny))

    return image


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    sheet = Image.open(sys.argv[1]).convert("RGBA")
    w, h = sheet.width // 2, sheet.height // 2
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for name, (col, row) in QUADRANTS.items():
        part = sheet.crop((col * w, row * h, (col + 1) * w, (row + 1) * h))
        part = remove_background(part)

        box = part.getbbox()
        if box:
            part = part.crop(box)

        target = OUT_DIR / f"{name}.webp"
        part.save(target, "WEBP", quality=92, method=6)
        print(f"{name:16s} {part.size}  {target.stat().st_size // 1024} KB")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
