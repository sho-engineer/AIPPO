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

    #: 学習リマインダーのメールを受け取るか。
    #:
    #: 端末（localStorage）ではなくここに持つ。送るのはサーバーなので、
    #: 端末側にだけ持っていると「切ったのに届く」ことになる。
    #: 既定は True。7日間で学ぶ設計なのに戻ってくる仕掛けが無いと、
    #: 1本やって終わる人を止められない。切りたい人は設定から切れる。
    remind_study = models.BooleanField(default=True)

    #: 最後にリマインダーを送った日時。送りすぎを防ぐために見る。
    reminded_at = models.DateTimeField(null=True, blank=True)

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


class SocialAccount(models.Model):
    """外部のサービスで確かめた身元と、この人の対応。

    Google と LINE。どちらも「向こうで本人だと確かめてもらう」だけで、
    パスワードはこちらに無い。

    鍵にするのは向こうが振る番号（`subject`）で、メールアドレスではない。
    メールは変えられるし、LINE はそもそもメールを返さないことがある。
    メールを鍵にすると、変えた瞬間に別人の扱いになる。
    """

    class Provider(models.TextChoices):
        GOOGLE = "google", "Google"
        LINE = "line", "LINE"

    provider = models.CharField(max_length=20, choices=Provider.choices)

    #: 向こうが振る、その人の番号。変わらない。
    subject = models.CharField(max_length=255)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="social_accounts",
        on_delete=models.CASCADE,
    )

    #: 向こうから受け取ったメール。無いこともある（LINE は既定で返さない）。
    #: 参考として持つだけで、これで人を引き当てない。
    email = models.EmailField(blank=True)
    #: 向こうが「確かめた」と言っているか。言っていないものは信じない。
    email_verified = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    last_login_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "外部サービスの連携"
        verbose_name_plural = "外部サービスの連携"
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "subject"], name="uniq_social_provider_subject"
            ),
            # 同じサービスを1人が2つ繋ぐ意味が無い。繋ぐと、どちらで入ったかで
            # 見えるものが変わる
            models.UniqueConstraint(
                fields=["provider", "user"], name="uniq_social_provider_user"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.get_provider_display()} → {self.user.email or self.user.username}"


class Passkey(models.Model):
    """パスキー（WebAuthn の資格情報）。

    合言葉を覚えなくてよくする仕組み。端末の指紋や顔で本人を確かめ、
    その端末が持つ秘密鍵で署名する。こちらが預かるのは**公開鍵だけ**。

    パスワードとの違いが1つある。パスワードは「知っているもの」なので、
    盗み見られれば誰でも使える。パスキーは「その端末にあるもの」なので、
    公開鍵の一覧がまるごと漏れても、それだけでは誰も入れない。
    偽サイトへ入力させる手も効かない（署名にドメインが混ざるため、
    別のドメインで作った署名は通らない）。

    1人が複数持てる。スマホと仕事のパソコンで別々に作るのが普通なので、
    1つに制限すると、端末を変えるたびに入れなくなる。
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="passkeys",
        on_delete=models.CASCADE,
    )

    #: 認証器が振る、この資格情報の番号。ログインのときの引き当てに使う。
    #: 生のバイト列を base64url で持つ（URL にもJSONにも素直に載る形）。
    credential_id = models.CharField(max_length=512, unique=True, db_index=True)

    #: 公開鍵（COSE 形式）。これで署名を確かめる。秘密鍵は端末から出ない。
    public_key = models.BinaryField()

    #: 署名の通し番号。
    #:
    #: 認証器が署名のたびに増やす数。前より小さい値が来たら、
    #: 資格情報が複製された疑いがある。0 を返し続ける認証器も多いので
    #: （Apple の端末など）、0 のときは確かめない。
    sign_count = models.PositiveBigIntegerField(default=0)

    #: どうやって繋がる認証器か（internal / usb / nfc / ble / hybrid）。
    #: 次に使うとき、ブラウザが出す案内を賢くするために渡す。
    transports = models.JSONField(default=list, blank=True)

    #: 画面に出す名前。「iPhone」「仕事のパソコン」など。
    #: 複数持ったときに、どれを消せばよいか分かるようにする。
    label = models.CharField(max_length=60, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "パスキー"
        verbose_name_plural = "パスキー"
        ordering = ("-created_at",)

    def __str__(self) -> str:
        who = self.user.email or self.user.username
        return f"{self.label or 'パスキー'} → {who}"


class TotpDevice(models.Model):
    """認証アプリ（TOTP）。1人につき1つ。

    なぜ全員に強いないか
    --------------------
    一般向けの学習サービスなので、登録の時点で全員に求めると、
    そこで止まる人のほうが多い。入れたい人が設定から入れる形にする
    （要件 P2）。

    確かめるまでは「入っていない」扱い
    ----------------------------------
    秘密を作った時点では、その人のアプリに本当に登録できたかが
    分からない。**1回コードを通してから**有効にする。ここを飛ばすと、
    アプリに入れ損ねた人が次のログインで締め出される。

    同じコードを二度使わせない
    --------------------------
    `last_used_counter` に、通した30秒の番号を残す。盗み見た人が
    同じ30秒のうちに入れても通らない。
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, related_name="totp", on_delete=models.CASCADE
    )
    #: base32 の秘密。**画面へ返すのは登録の途中だけ**
    secret = models.CharField(max_length=64)
    #: 1回コードを通した日時。null なら、まだ有効ではない
    confirmed_at = models.DateTimeField(null=True, blank=True)
    #: 最後に通したコードの30秒番号。二度使いを防ぐ
    last_used_counter = models.BigIntegerField(default=-1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "認証アプリ"
        verbose_name_plural = "認証アプリ"

    def __str__(self) -> str:
        state = "有効" if self.confirmed_at else "設定中"
        return f"{self.user.email or self.user.username}（{state}）"

    @property
    def is_active(self) -> bool:
        return self.confirmed_at is not None


class RecoveryCode(models.Model):
    """予備の合言葉。認証アプリを無くしたときの逃げ道。

    無いと、端末を替えた人が**自分のアカウントから締め出される**。
    2段階認証を入れる以上、これは付属品ではなく必須の片割れ。

    平文では持たない
    ----------------
    保存するのはハッシュだけ。渡すのは作った1回きりで、画面から
    離れたら二度と出さない（`used_at` が入ったものは使えない）。
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="recovery_codes", on_delete=models.CASCADE
    )
    code_hash = models.CharField(max_length=128)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "予備の合言葉"
        verbose_name_plural = "予備の合言葉"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["user", "code_hash"], name="uniq_recovery_code"
            )
        ]
