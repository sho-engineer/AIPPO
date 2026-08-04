"""アカウントと、ゲストとの結びつき。

このアプリの成り立ち
--------------------
AIPPO は登録なしで使い始められる。学習の記録は匿名の `learner_key`
（HttpOnly の UUID Cookie）に紐づいており、それは登録後も変わらない。

登録したときにやることは「記録を書き換える」ことではなく、
**その learner_key が誰のものかを記録する**こと。

    LearnerIdentity: learner_key ──→ user

こうしておく理由が3つある。

- 移行が冪等になる。二度実行しても、同じ結びつきが1つあるだけ
- 端末が増えても同じ形で足せる。別端末は別の learner_key を持つので、
  ログイン時にその鍵も同じ人へ結びつければよい
- 記録そのものを書き換えないので、途中で失敗しても壊れない。
  結びつけに失敗しても、学習の記録は元のまま残る
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class LearnerIdentity(models.Model):
    """匿名の learner_key と、登録した人の対応。

    未登録のあいだは `user` が空。登録・ログインの時点で埋まる。
    1人が複数の learner_key を持つ（端末ごと）。
    """

    learner_key = models.UUIDField(unique=True, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="learner_identities",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    linked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "学習者の識別"
        verbose_name_plural = "学習者の識別"

    def __str__(self) -> str:
        owner = self.user.email if self.user else "（未登録）"
        return f"{self.learner_key} → {owner}"


class UserProfile(models.Model):
    """登録した人の、アプリ側の情報。

    Django の User には表示名も規約同意も置き場が無いので、こちらに持つ。
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, related_name="profile", on_delete=models.CASCADE
    )
    display_name = models.CharField(max_length=60, blank=True)

    #: メールアドレスを確かめた日時。空なら未確認。
    #: 第一リリースでは未確認でも学習は続けられる（止めると、
    #: メールが届かなかった人がその場で行き止まりになる）。
    email_verified_at = models.DateTimeField(null=True, blank=True)

    #: 同意した規約の版と日時。あとから「いつ何に同意したか」を示せるようにする。
    terms_version = models.CharField(max_length=20, blank=True)
    terms_agreed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "利用者のプロフィール"
        verbose_name_plural = "利用者のプロフィール"

    def __str__(self) -> str:
        return self.display_name or self.user.email

    @property
    def is_email_verified(self) -> bool:
        return self.email_verified_at is not None


def learner_keys_for(user) -> list[uuid.UUID]:
    """その人に結びついた learner_key をすべて返す。

    別端末からログインすると鍵が増えるので、読むときは常に
    「この人の鍵ぜんぶ」で引く。1つだけで引くと、
    別端末で作った記録が見えない。
    """
    if user is None or not user.is_authenticated:
        return []
    return list(
        LearnerIdentity.objects.filter(user=user).values_list("learner_key", flat=True)
    )


class AuthThrottle(models.Model):
    """登録・ログイン・パスワード再設定の試行回数。

    AI の上限（`AiUsageCounter`）と同じく **DB で数える**。
    プロセスの中に置くと、gunicorn の worker ごとに別々の数になり、
    上限が worker の数だけ緩む。

    数えるのは「決まった長さの窓ごとの回数」。窓が変われば 0 から。
    細かい滑り窓にはしない。ここで必要なのは
    「連打を止めること」であって、正確な計量ではない。

    **メールアドレスそのものは保存しない。** SECRET_KEY を鍵にした
    HMAC だけを持つ。元の値は復元できず、同じ相手かどうかの判定にだけ使う。
    """

    scope = models.CharField(max_length=96, help_text="用途と相手のHMAC")
    window_start = models.DateTimeField()
    count = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "試行回数"
        verbose_name_plural = "試行回数"
        constraints = [
            models.UniqueConstraint(
                fields=["scope", "window_start"], name="uniq_auth_throttle_scope_window"
            )
        ]
        indexes = [models.Index(fields=["window_start"])]

    def __str__(self) -> str:
        return f"{self.window_start:%Y-%m-%d %H:%M} {self.scope[:24]} = {self.count}"
