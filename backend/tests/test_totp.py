"""認証アプリの確認コード（TOTP / RFC 6238）。

自前で書いたものを「たぶん合っている」で置かない。
**RFC の試験値をそのまま通す。**

守っているかを見るのは4つ。

  1. RFC 6238 の試験値と一致する
  2. 時計のずれを ±30秒まで許す
  3. 同じコードを二度使えない
  4. 形の違うものを黙って通さない
"""

from __future__ import annotations

import base64

import pytest

from apps.accounts import totp

#: RFC 6238 Appendix B の秘密（SHA-1）。ASCII "12345678901234567890"
RFC_SECRET = base64.b32encode(b"12345678901234567890").decode("ascii")

#: (時刻, その時刻のコード)。RFC 6238 の表から、SHA-1 の行だけ。
#: 表の値は8桁なので、下6桁を取る（このアプリは6桁）。
RFC_VECTORS = [
    (59, "94287082"),
    (1111111109, "07081804"),
    (1111111111, "14050471"),
    (1234567890, "89005924"),
    (2000000000, "69279037"),
    (20000000000, "65353130"),
]


class TestAgainstTheRfc:
    @pytest.mark.parametrize("when,expected", RFC_VECTORS)
    def test_it_matches_the_published_values(self, when, expected):
        counter = int(when // totp.PERIOD)

        assert totp.code_for(RFC_SECRET, counter) == expected[-totp.DIGITS :]


class TestDrift:
    def test_the_previous_and_next_windows_are_accepted(self):
        """端末の時計が数秒ずれているだけで、通らなくしない。"""
        now = totp.counter_at()

        for step in (-1, 0, 1):
            code = totp.code_for(RFC_SECRET, now + step)
            assert totp.verify(RFC_SECRET, code) is not None, step

    def test_further_away_is_refused(self):
        # 広げるほど、盗み見たコードが使える時間が伸びる
        far = totp.code_for(RFC_SECRET, totp.counter_at() + 5)

        assert totp.verify(RFC_SECRET, far) is None


class TestReplay:
    def test_the_same_code_cannot_be_used_twice(self):
        """盗み見た人が同じ30秒のうちに入れても通らないこと。"""
        now = totp.counter_at()
        code = totp.code_for(RFC_SECRET, now)

        used = totp.verify(RFC_SECRET, code)
        assert used == now

        assert totp.verify(RFC_SECRET, code, after=used) is None


class TestBadInput:
    @pytest.mark.parametrize("code", ["", "12345", "1234567", "abcdef", "   "])
    def test_wrong_shapes_are_refused(self, code):
        assert totp.verify(RFC_SECRET, code) is None

    def test_spaces_and_hyphens_are_forgiven(self):
        """アプリが「123 456」と出すことがある。打ち写しも同じ。"""
        now = totp.counter_at()
        code = totp.code_for(RFC_SECRET, now)
        spaced = f"{code[:3]} {code[3:]}"

        assert totp.verify(RFC_SECRET, spaced) == now


class TestTheSecret:
    def test_each_one_is_different(self):
        assert totp.new_secret() != totp.new_secret()

    def test_it_is_long_enough(self):
        # RFC は 160bit を推奨。短くすると総当たりが現実的になる
        raw = base64.b32decode(totp.new_secret(), casefold=True)
        assert len(raw) >= 20

    def test_authenticator_apps_can_read_it(self):
        secret = totp.new_secret()
        uri = totp.provisioning_uri(secret, account="a@example.com", issuer="AIPPO")

        assert uri.startswith("otpauth://totp/")
        assert f"secret={secret}" in uri
        assert "issuer=AIPPO" in uri
        # メールアドレスはそのまま出さない（URL の中で符号化する）
        assert "a@example.com" not in uri

    def test_it_is_grouped_for_typing(self):
        # 32文字を切れ目なく出すと、打ち間違いも読み飛ばしも増える
        assert totp.grouped("ABCDEFGH") == "ABCD EFGH"
