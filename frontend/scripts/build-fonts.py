#!/usr/bin/env python3
"""丸ゴシックを、ブラウザが必要な分だけ取りに行ける形へ分割する。

なぜ要るか
----------
日本語のフォントは1ウェイトで 1.4MB ある。そのまま読み込ませると、
スマートフォンで最初に開く人が 3MB 近く待たされる。

`unicode-range` を付けて細かく分けておくと、ブラウザは
**実際に画面へ出た文字を含む断片だけ**を取りに行く。
最初の1画面ならおおむね 100〜200KB で済む。

並べ方
------
アプリ自身の文言（固定文言・レッスン教材）に出てくる文字を先頭の断片へ集める。
最初の表示で必ず要る文字が1ファイルにまとまり、往復が減る。

使い方
------
    python scripts/build-fonts.py

出力: public/fonts/*.woff2 と src/styles/fonts.css
フォント本体は @fontsource/zen-maru-gothic（OFL）から作る。
"""

import hashlib
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules/@fontsource/zen-maru-gothic/files"
OUT_DIR = ROOT / "public/fonts"
CSS_PATH = ROOT / "src/styles/fonts.css"
WEIGHTS = (400, 700)
CHUNK_SIZE = 500

#: 記号・約物。かな漢字と一緒に必ず要る。
PUNCTUATION = (
    "　、。，．・：；？！゛゜´｀¨＾￣＿ヽヾゝゞ〃仝々〆〇ー―‐／＼～∥｜…‥"
    "‘’“”（）〔〕［］｛｝〈〉《》「」『』【】＋－±×÷＝≠＜＞≦≧∞∴"
    "♂♀°′″℃￥＄￠￡％＃＆＊＠§☆★○●◎◇◆□■△▲▽▼※〒→←↑↓〓"
)


def app_characters() -> set[str]:
    """アプリ自身の文言に出てくる文字。最初の1画面で必ず要る。"""
    found: set[str] = set()
    for path in (ROOT / "src").rglob("*"):
        if path.suffix not in {".ts", ".tsx", ".json"} or not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        if path.suffix == ".json":
            found |= set(re.sub(r"\s+", "", json.dumps(json.loads(text), ensure_ascii=False)))
        else:
            # 文字列リテラルだけを拾う。変数名などは要らない。
            for literal in re.findall(r'"([^"\\]*)"|\'([^\'\\]*)\'|`([^`\\]*)`', text):
                found |= set("".join(literal))
    return {c for c in found if c.strip()}


def jis_characters() -> set[str]:
    """JIS第1・第2水準。実務の日本語はこれでほぼ足りる。"""
    chars: set[str] = set()
    for lead in list(range(0x81, 0xA0)) + list(range(0xE0, 0xF0)):
        for trail in list(range(0x40, 0x7F)) + list(range(0x80, 0xFD)):
            try:
                chars.add(bytes([lead, trail]).decode("cp932"))
            except UnicodeDecodeError:
                pass
    return chars


def unicode_range(chars: list[str]) -> str:
    """連続する文字コードをまとめる。

    1文字ずつ並べると CSS だけで 100KB を超える。
    ひとまとまりにすれば1割以下になる。
    """
    codes = sorted(ord(c) for c in chars)
    parts: list[str] = []
    start = previous = codes[0]

    for code in codes[1:] + [None]:
        if code == previous + 1:
            previous = code
            continue
        if start == previous:
            parts.append(f"U+{start:04X}")
        else:
            parts.append(f"U+{start:04X}-{previous:04X}")
        if code is None:
            break
        start = previous = code

    return ", ".join(parts)


def main() -> int:
    if not SRC.exists():
        print("フォント本体が見つかりません。npm install を先に実行してください。")
        return 1

    base = set(chr(c) for c in range(0x20, 0x7F))          # 英数記号
    base |= set(PUNCTUATION)
    base |= set(chr(c) for c in range(0x3040, 0x30FF))     # かな
    base |= set(chr(c) for c in range(0xFF01, 0xFF61))     # 全角英数記号

    everything = base | jis_characters()

    # 文字コードが連続する固まりで分ける。
    # 拾い集めた並びにすると unicode-range が1文字ずつ並び、CSS だけで 100KB を超える。
    ordered = sorted(ord(c) for c in everything)
    spans: list[list[str]] = []
    current: list[str] = []
    for code in ordered:
        current.append(chr(code))
        if len(current) >= CHUNK_SIZE:
            spans.append(current)
            current = []
    if current:
        spans.append(current)

    # アプリ自身の文言に出る文字だけを集めた固まり。
    # これがあると、最初の1画面はこの1ファイルで足りる。
    app_chunk = sorted((base | app_characters()) & everything)

    # ★ この固まりは **最後に** 書き出す。
    #    unicode-range が重なったときは後に書いた @font-face が優先されるため、
    #    先に書くと広い範囲の固まりに負けて、この最適化が効かなくなる。
    chunks = spans + [app_chunk]
    print(
        f"文字数 {len(everything)} を {len(chunks)} 個に分割"
        f"（最初の1画面用 {len(app_chunk)} 文字）"
    )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.woff2"):
        old.unlink()

    css: list[str] = [
        "/*",
        " * このファイルは scripts/build-fonts.py が作る。手で編集しない。",
        " *",
        " * 丸ゴシックは日本語で「親しみやすさ」を出す一番の手段だが、",
        " * まるごと読み込むと 3MB 近くなる。unicode-range で分けてあるので、",
        " * ブラウザは画面に出た文字を含む断片だけを取りに行く。",
        " *",
        " * Zen Maru Gothic / SIL Open Font License 1.1",
        " */",
        "",
    ]

    total = 0
    for weight in WEIGHTS:
        source = SRC / f"zen-maru-gothic-japanese-{weight}-normal.woff2"
        for index, chunk in enumerate(chunks):
            target = OUT_DIR / f"_tmp-{weight}-{index}.woff2"
            charfile = OUT_DIR / "_chars.txt"
            charfile.write_text("".join(chunk), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable, "-m", "fontTools.subset", str(source),
                    f"--text-file={charfile}",
                    "--flavor=woff2",
                    "--layout-features=*",
                    f"--output-file={target}",
                ],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            charfile.unlink()

            # 中身から名前を決める。
            # 名前が固定だと、フォントを作り直したときに
            # 古いものがキャッシュに残り続けて反映されない。
            digest = hashlib.sha256(target.read_bytes()).hexdigest()[:8]
            name = f"zen-maru-gothic-{weight}-{index}.{digest}.woff2"
            target = target.rename(OUT_DIR / name)
            total += target.stat().st_size

            # 連続した固まりは端から端までを1本の範囲で書く。
            # 中に入っていない文字は、他の固まりか端末のフォントへ落ちるだけ。
            # 1文字ずつ並べると、それだけで CSS が 90KB を超える。
            is_app_chunk = index == len(chunks) - 1
            ranges = (
                unicode_range(chunk)
                if is_app_chunk
                else f"U+{ord(chunk[0]):04X}-{ord(chunk[-1]):04X}"
            )

            css += [
                "@font-face {",
                "  font-family: 'Zen Maru Gothic';",
                "  font-style: normal;",
                f"  font-weight: {weight};",
                "  font-display: swap;",
                f"  src: url('/fonts/{name}') format('woff2');",
                f"  unicode-range: {ranges};",
                "}",
                "",
            ]

    CSS_PATH.parent.mkdir(parents=True, exist_ok=True)
    CSS_PATH.write_text("\n".join(css), encoding="utf-8")

    last = len(chunks) - 1
    first_load = sum(
        f.stat().st_size
        for w in WEIGHTS
        for f in OUT_DIR.glob(f"zen-maru-gothic-{w}-{last}.*.woff2")
    )
    print(f"合計 {total // 1024} KB / 最初に要る分 {first_load // 1024} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
