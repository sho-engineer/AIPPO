#!/usr/bin/env python3
"""ポーの表情画像を、画面で使える形に整える。

やること
--------
1. 透明な余白を切り落とす
2. **体の大きさと位置をそろえる**
3. WebP で書き出す

2 が肝心。元の絵は1枚ずつ大きさも位置も違うので、そのまま並べると
表情が変わるたびにポーが飛び跳ねて見える。
「？」や吹き出しのような浮いている飾りは体より外にあるので、
体だけを見つけて基準にする。

使い方
------
    python scripts/build-poe.py <元画像のあるディレクトリ>

元画像のファイル名は、表情名で始めるか、下の SOURCES に対応を書く。
"""

import pathlib
import sys
from collections import deque

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public/poe"
#: 表情ではない絵の置き場。画面の飾りなので表情と混ぜない。
BRAND_DIR = ROOT / "public/brand"
CANVAS = 512
#: 体が画像の高さに占める割合。残りは「？」や吹き出しの居場所。
BODY_RATIO = 0.72

#: 元画像 → 表情。ファイル名の先頭8文字で対応させる。
SOURCES = {
    "70b93bec": "neutral",    # 目を開けた笑顔
    "897403b2": "question",   # 「？」と驚いた口
    "8b5c35c0": "thinking",   # あごに手、考え中の吹き出し
    "d9c2ae0f": "hint",       # 電球がひらめいた
    "a3a01be6": "warning",    # 困り顔と「！」の標識
    "337f8f9d": "celebrate",  # 紙吹雪の中でジャンプ
}

#: 表情ではないが、画面の飾りに使う絵。public/brand/poe-<名前>.webp へ書く。
EXTRAS = {
    "4f5e1b46": "wave",       # 手を振っている。トップの主役に使う
}


def largest_component(
    mask: list[list[bool]], w: int, h: int
) -> tuple[int, int, int, int]:
    """いちばん大きなかたまり（＝体）の範囲を返す。

    「？」や吹き出しは体から離れた別のかたまりなので、これで外れる。
    """
    seen = [[False] * w for _ in range(h)]
    best = (0, (0, 0, 0, 0), set())

    for sy in range(h):
        for sx in range(w):
            if not mask[sy][sx] or seen[sy][sx]:
                continue
            queue = deque([(sx, sy)])
            seen[sy][sx] = True
            cells: set[tuple[int, int]] = set()
            x0 = x1 = sx
            y0 = y1 = sy
            while queue:
                x, y = queue.popleft()
                cells.add((x, y))
                x0, x1 = min(x0, x), max(x1, x)
                y0, y1 = min(y0, y), max(y1, y)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        queue.append((nx, ny))
            if len(cells) > best[0]:
                best = (len(cells), (x0, y0, x1, y1), cells)

    return best[1]


SCALE = 4


def body_box(image: Image.Image) -> tuple[int, int, int, int]:
    """体の範囲を、元画像の座標で返す。"""
    scale = SCALE
    small = image.resize((image.width // scale, image.height // scale), Image.NEAREST)
    alpha = small.getchannel("A")
    w, h = small.size
    px = alpha.load()
    mask = [[px[x, y] > 128 for x in range(w)] for y in range(h)]

    x0, y0, x1, y1 = largest_component(mask, w, h)
    return (x0 * scale, y0 * scale, (x1 + 1) * scale, (y1 + 1) * scale)


def place(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    """体の大きさと足元の位置をそろえて、正方形へ収める。"""
    bx0, by0, bx1, by1 = box
    body_height = by1 - by0
    ratio = (CANVAS * BODY_RATIO) / body_height

    resized = image.resize(
        (max(1, round(image.width * ratio)), max(1, round(image.height * ratio))),
        Image.LANCZOS,
    )
    # 体の中心と足元を、常に同じ場所へ置く
    center_x = (bx0 + bx1) / 2 * ratio
    bottom_y = by1 * ratio

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(
        resized,
        (round(CANVAS / 2 - center_x), round(CANVAS * 0.97 - bottom_y)),
        resized,
    )
    return canvas


#: これ以下の濃さは「敷いてあるだけの光」と見なす。
#: 絵の縁のなめらかさは残したいので、低めに取る。
HAZE_ALPHA = 16


def clear_haze(image: Image.Image) -> Image.Image:
    """絵の外側に薄く敷かれた光を、完全な透明にする。

    元絵は四隅まで真っ透明ではなく、ごく薄い白がかかっている。
    そのままだと2つ困る。

    - 濃い色の面に載せたとき、四角い靄として見えてしまう
    - getbbox() が元の大きさを返し、余白を切り詰められない
    """
    alpha = image.getchannel("A").point(lambda a: 0 if a <= HAZE_ALPHA else a)
    cleaned = image.copy()
    cleaned.putalpha(alpha)
    return cleaned


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    source_dir = pathlib.Path(sys.argv[1])
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    BRAND_DIR.mkdir(parents=True, exist_ok=True)

    expressions: dict[str, Image.Image] = {}
    extras: dict[str, Image.Image] = {}
    boxes: dict[str, tuple[int, int, int, int]] = {}

    for path in sorted(source_dir.glob("*.png")):
        # 敷いてある薄い光は、どの用途でも邪魔になるので先に落とす
        image = clear_haze(Image.open(path).convert("RGBA"))
        key = path.stem[:8]
        name = SOURCES.get(key) or EXTRAS.get(key)
        if name is None:
            print(f"対応が分からないので飛ばす: {path.name}")
            continue
        (expressions if key in SOURCES else extras)[name] = image
        boxes[name] = body_box(image)

    # 表情は6枚とも同じ枠に収める。切り替えたときに跳ねないように。
    for emotion, image in expressions.items():
        out = place(image, boxes[emotion])
        target = OUT_DIR / f"{emotion}.webp"
        out.save(target, "WEBP", quality=90, method=6)
        print(f"{emotion:10s} -> poe/{target.name}  {target.stat().st_size // 1024} KB")

    # 飾りは1枚で完結するので、余白を切り詰める。
    # 表情と同じ正方形へ収めると3割が透明な余白になり、
    # 大きく見せたい場所で絵が小さくしか出せない。
    for name, image in extras.items():
        box = image.getbbox()
        out = image.crop(box) if box else image
        target = BRAND_DIR / f"poe-{name}.webp"
        out.save(target, "WEBP", quality=92, method=6)
        print(f"{name:10s} -> brand/{target.name}  {out.size}  {target.stat().st_size // 1024} KB")

    missing = set(SOURCES.values()) - set(expressions)
    if missing:
        print(f"足りない表情: {', '.join(sorted(missing))}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
