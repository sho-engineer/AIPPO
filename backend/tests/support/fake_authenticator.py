"""テスト用の認証器。

パスキーのテストで一番やってはいけないのは、確かめる側（webauthn ライブラリ）を
差し替えてしまうこと。それをすると「署名を確かめている」という肝心の部分が
テストから抜け落ち、**署名を確かめずに通す実装でもテストが通る**。

そこで、確かめる側はそのまま動かし、**本物の署名を作る側**をここに置く。
ブラウザと端末（認証器）がやることを、そのまま Python で書いてある。

  1. 鍵の組を作る（ES256 / P-256）
  2. clientDataJSON を組み立てる（type・challenge・origin が入る）
  3. authenticatorData を組み立てる（rpIdHash・フラグ・署名回数・公開鍵）
  4. 秘密鍵で署名する

これで、実装が origin や challenge を取り違えていれば、
確かめる側が本当に弾く。
"""

from __future__ import annotations

import hashlib
import json
import os
import struct

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import (
    decode_dss_signature,
    encode_dss_signature,
)
from webauthn.helpers import bytes_to_base64url, encode_cbor

#: フラグ。UP=本人がその場にいる / UV=本人だと確かめた / AT=公開鍵が入っている
FLAG_UP = 0x01
FLAG_UV = 0x04
FLAG_AT = 0x40

#: どの認証器かを表す番号。テストでは全部ゼロでよい
AAGUID = b"\x00" * 16


class FakeAuthenticator:
    """1つの端末（スマホやパソコン）のふるまい。"""

    def __init__(self, rp_id: str, origin: str) -> None:
        self.rp_id = rp_id
        self.origin = origin
        self._key = ec.generate_private_key(ec.SECP256R1())
        self.credential_id = os.urandom(32)
        self.sign_count = 0

    # ---------------------------------------------------------------- 登録

    def register(self, challenge: str) -> dict:
        """`navigator.credentials.create()` が返すものと同じ形。"""
        client_data = self._client_data("webauthn.create", challenge)
        auth_data = self._authenticator_data(include_key=True)

        attestation = encode_cbor(
            {"fmt": "none", "attStmt": {}, "authData": auth_data}
        )

        return {
            "id": bytes_to_base64url(self.credential_id),
            "rawId": bytes_to_base64url(self.credential_id),
            "type": "public-key",
            "response": {
                "clientDataJSON": bytes_to_base64url(client_data),
                "attestationObject": bytes_to_base64url(attestation),
                "transports": ["internal"],
            },
            "clientExtensionResults": {},
        }

    # -------------------------------------------------------------- ログイン

    def sign_in(self, challenge: str) -> dict:
        """`navigator.credentials.get()` が返すものと同じ形。"""
        self.sign_count += 1
        client_data = self._client_data("webauthn.get", challenge)
        auth_data = self._authenticator_data(include_key=False)

        signature = self._sign(auth_data + hashlib.sha256(client_data).digest())

        return {
            "id": bytes_to_base64url(self.credential_id),
            "rawId": bytes_to_base64url(self.credential_id),
            "type": "public-key",
            "response": {
                "clientDataJSON": bytes_to_base64url(client_data),
                "authenticatorData": bytes_to_base64url(auth_data),
                "signature": bytes_to_base64url(signature),
                "userHandle": None,
            },
            "clientExtensionResults": {},
        }

    # ---------------------------------------------------------------- 中身

    def _client_data(self, kind: str, challenge: str) -> bytes:
        """ブラウザが作る部分。

        ここに origin が入る。だから偽サイトで作らせた署名は、
        本物のドメインでは通らない。
        """
        return json.dumps(
            {"type": kind, "challenge": challenge, "origin": self.origin},
            separators=(",", ":"),
        ).encode("utf-8")

    def _authenticator_data(self, *, include_key: bool) -> bytes:
        flags = FLAG_UP | FLAG_UV
        if include_key:
            flags |= FLAG_AT

        data = hashlib.sha256(self.rp_id.encode("utf-8")).digest()
        data += struct.pack(">B", flags)
        data += struct.pack(">I", self.sign_count)

        if include_key:
            data += AAGUID
            data += struct.pack(">H", len(self.credential_id))
            data += self.credential_id
            data += self._cose_public_key()
        return data

    def _cose_public_key(self) -> bytes:
        numbers = self._key.public_key().public_numbers()
        return encode_cbor(
            {
                1: 2,  # kty: EC2
                3: -7,  # alg: ES256
                -1: 1,  # crv: P-256
                -2: numbers.x.to_bytes(32, "big"),
                -3: numbers.y.to_bytes(32, "big"),
            }
        )

    def _sign(self, payload: bytes) -> bytes:
        signature = self._key.sign(payload, ec.ECDSA(hashes.SHA256()))
        # そのまま DER で返る。WebAuthn も DER なので詰め直さない。
        # 念のため往復させて、形が壊れていないことを確かめておく
        r, s = decode_dss_signature(signature)
        return encode_dss_signature(r, s)
