"""この人が読んでよい記録の範囲。

学習の記録は `learner_key` に紐づいている。端末ごとに鍵が違うので、
ログインしている人には「その人の鍵ぜんぶ」で引かないと、
別端末で進めた分が見えない。

    未ログイン … いまの端末の鍵だけ
    ログイン中 … その人に結びついた鍵ぜんぶ（いまの端末を含む）

書き込みは常にいまの端末の鍵で行う。登録・ログインの時点で
その鍵は本人のものとして結びついているので、あとから読むときに
ちゃんと入ってくる。書き込み先を「代表の鍵」へ寄せると、
結びつけに失敗した端末の記録が迷子になる。
"""

from __future__ import annotations

import uuid

from apps.accounts.models import learner_keys_for


def device_key(request) -> uuid.UUID | None:
    """いまの端末の鍵。書き込みはいつもこれ。"""
    return getattr(request, "learner_key", None)


def readable_keys(request) -> list[uuid.UUID]:
    """この要求で読んでよい鍵の一覧。

    ログイン中でも、いまの端末の鍵は必ず入れる。
    登録の直後で結びつけがまだ終わっていない一瞬に、
    自分で作ったばかりの記録が消えたように見えるのを防ぐ。
    """
    keys: list[uuid.UUID] = []

    current = device_key(request)
    if current is not None:
        keys.append(current)

    for key in learner_keys_for(getattr(request, "user", None)):
        if key not in keys:
            keys.append(key)

    return keys
