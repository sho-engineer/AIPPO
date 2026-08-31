"""認証アプリの確認コード（TOTP / RFC 6238）。

外部の実装を足さずに、標準ライブラリだけで書いてある
--------------------------------------------------
やることは「共有した秘密と時刻から HMAC を取り、下6桁を出す」だけで、
仕様（RFC 4226 / 6238）も短い。ここに入れておけば、**何をしているか
が読めば分かる**し、依存を1つ増やさずに済む。

RFC の試験値をそのまま検査に入れてある（`tests/test_totp.py`）。
自前で書いたものを「たぶん合っている」で置かない。

守っていること
--------------
- 比較は `compare_digest`。桁ごとに早く抜ける比較だと、応答の速さの
  差からコードを1桁ずつ当てられる
- 時計のずれを1つ前後まで許す（±30秒）。厳密にすると、正しいコードが
  「違います」になる人が出る
- **同じコードを二度使わせない。** 盗み見た人が同じ30秒のうちに
  入れると通ってしまう（`TotpDevice.last_used_counter`）
"""

from __future__ import annotations

import base64
import hmac
import secrets
import struct
import time
from hashlib import sha1
from urllib.parse import quote

#: コードの桁数。6桁は認証アプリ側の既定でもある
DIGITS = 6

#: 何秒ごとに変わるか。RFC 6238 の既定
PERIOD = 30

#: 前後いくつまで許すか。1 なら ±30秒。
#:
#: 0 にすると、端末の時計が数秒ずれているだけで通らなくなる。
#: 2 以上にすると、盗み見たコードが使える時間が伸びる。
DRIFT = 1

#: 秘密の長さ（バイト）。20バイト＝160bit で RFC の推奨どおり
SECRET_BYTES = 20


def new_secret() -> str:
    """新しい秘密を作る。base32（認証アプリが読める形）で返す。"""
    return base64.b32encode(secrets.token_bytes(SECRET_BYTES)).decode("ascii")


def counter_at(when: float | None = None) -> int:
    """いまが何番目の30秒か。"""
    return int((time.time() if when is None else when) // PERIOD)


def code_for(secret: str, counter: int) -> str:
    """その番号のときのコード。RFC 4226 の手順そのまま。"""
    key = base64.b32decode(secret, casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), sha1).digest()

    # 末尾4bitが指す位置から4バイト取り、最上位ビットを落とす
    offset = digest[-1] & 0x0F
    (value,) = struct.unpack(">I", digest[offset : offset + 4])
    return str((value & 0x7FFFFFFF) % (10**DIGITS)).zfill(DIGITS)


def verify(secret: str, code: str, *, after: int = -1, when: float | None = None) -> int | None:
    """合っていれば、その番号を返す。合っていなければ None。

    `after` より後の番号しか受け付けない。**同じコードを二度使わせない**
    ため——盗み見た人が同じ30秒のうちに入れると通ってしまう。
    呼び出し側は、返ってきた番号を保存して次に渡す。
    """
    cleaned = "".join(character for character in code if character.isdigit())
    if len(cleaned) != DIGITS:
        return None

    now = counter_at(when)
    for step in range(-DRIFT, DRIFT + 1):
        counter = now + step
        if counter <= after:
            continue
        # 桁ごとに早く抜ける比較にしない（応答の速さからコードが漏れる）
        if hmac.compare_digest(code_for(secret, counter), cleaned):
            return counter
    return None


def provisioning_uri(secret: str, *, account: str, issuer: str) -> str:
    """認証アプリに読ませる `otpauth://` の文字列。

    携帯で開けば、そのままアプリが開いて登録できる。QRの画像は
    作らない——画像を作るだけのために依存を増やさず、
    リンクと、手で入れられる形の秘密の両方を画面に出す。
    """
    label = quote(f"{issuer}:{account}", safe="")
    return (
        f"otpauth://totp/{label}"
        f"?secret={secret}&issuer={quote(issuer, safe='')}"
        f"&algorithm=SHA1&digits={DIGITS}&period={PERIOD}"
    )


def grouped(secret: str, size: int = 4) -> str:
    """手で入れるときのために、4文字ずつ空ける。

    32文字を切れ目なく出すと、打ち間違いも読み飛ばしも増える。
    """
    return " ".join(secret[index : index + size] for index in range(0, len(secret), size))
