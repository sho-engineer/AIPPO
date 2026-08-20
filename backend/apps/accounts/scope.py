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

「進める」と「残す」を分ける
----------------------------
読み書きの範囲とは別に、**取っておけるかどうか**の線がある。

    進める … 登録なしでもできる（学ぶこと自体は無料で、最後まで通る）
    残す   … 登録した人だけ（目印・修了証）

ゲストの鍵は7日で切れる（LEARNER_KEY_MAX_AGE）。切れた時点で本人からも
取り出せなくなるので、「取っておいた」ものが黙って消える。
取っておけると言っておいて消えるより、**取っておくには登録が要る**と
先に言うほうがよい。判定は `can_keep()` 1か所に閉じる。散らすと、
目印は残せるのに修了証は出ない、といった食い違いが必ず出る。
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


def can_keep(request) -> bool:
    """取っておけるか（目印・修了証）。

    ログインしている人だけ True。学ぶこと自体はゲストのままでもできる。
    """
    user = getattr(request, "user", None)
    return bool(user and user.is_authenticated)
