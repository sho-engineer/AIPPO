"""アカウントまわりの管理画面。

クローズドベータの問い合わせは、だいたいこの3つになる。

    「進み具合が消えた」    → その人にどの端末が結びついているか
    「ログインできない」    → 試行回数の上限に当たっていないか
    「確認メールが来ない」  → メールの確認が済んでいるか

登録しておかないと、そのたびにサーバーへ入って shell を叩くことになる。
問い合わせのたびに本番の DB へ直接触るのは、事故が起きるほうへ倒れる。

出さないもの
------------
パスワードは Django の User 側で伏せられている。ここでは扱わない。
試行回数の相手は HMAC なので、元のメールアドレスもIPも復元できない。

書き換えは最小限にしてある。ここは「見る」ための場所で、
学習の記録を手で直す場所ではない。
"""

from __future__ import annotations

from django.contrib import admin, messages
from django.utils import timezone

from apps.accounts.models import (
    AuthThrottle,
    LearnerIdentity,
    SocialAccount,
    UserProfile,
)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "display_name", "email_confirmed", "terms_version", "created_at")
    list_filter = ("terms_version", "email_verified_at")
    search_fields = ("user__email", "display_name")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("-created_at",)

    @admin.display(description="メール確認", boolean=True)
    def email_confirmed(self, obj: UserProfile) -> bool:
        return obj.is_email_verified

    @admin.action(description="メールを確認済みにする（届かない人の救済）")
    def mark_verified(self, request, queryset) -> None:
        """届かない人を、手で先へ通すための逃げ道。

        メールが届かない事情（迷惑メール、社内の遮断）はこちらでは直せない。
        確認前でも学習は続けられる作りにしてあるが、確認済みにしたい場面は出る。
        """
        updated = queryset.filter(email_verified_at__isnull=True).update(
            email_verified_at=timezone.now()
        )
        self.message_user(request, f"{updated}件を確認済みにしました。", messages.SUCCESS)

    actions = ["mark_verified"]


@admin.register(LearnerIdentity)
class LearnerIdentityAdmin(admin.ModelAdmin):
    """learner_key と人の結びつき。

    「別の端末で続きが出ない」の調べ先はここ。
    その人の行が端末の数だけあれば、結びつきは足りている。
    """

    list_display = ("learner_key", "user", "linked_at", "created_at")
    list_filter = ("linked_at",)
    search_fields = ("learner_key", "user__email")
    readonly_fields = ("learner_key", "created_at")
    ordering = ("-created_at",)

    def has_add_permission(self, request) -> bool:
        # 手で作る場面が無い。作れると、他人の記録を付け替えられてしまう
        return False


@admin.register(AuthThrottle)
class AuthThrottleAdmin(admin.ModelAdmin):
    """試行回数。

    「ログインできない」の調べ先。相手は HMAC なので、誰のものかは
    ここからは分からない。分かるのは「どの用途が何回来たか」まで。

    上限に当たった人を通したいときは、その行を消す。
    """

    list_display = ("kind", "window_start", "count", "scope")
    list_filter = ("window_start",)
    ordering = ("-window_start",)
    readonly_fields = ("scope", "window_start", "count")

    @admin.display(description="用途")
    def kind(self, obj: AuthThrottle) -> str:
        return obj.scope.split(":", 1)[0]

    def has_add_permission(self, request) -> bool:
        return False


@admin.register(SocialAccount)
class SocialAccountAdmin(admin.ModelAdmin):
    """外部サービスとの結びつき。

    「Google で入れなくなった」の調べ先。向こうが振る番号で繋がって
    いるので、番号が変わっていなければ同じ人として入れる。

    手で作れないようにしてある。作れると、他人のアカウントへ
    自分の連携を足して入れてしまう。
    """

    list_display = ("provider", "user", "email", "email_verified", "last_login_at")
    list_filter = ("provider", "email_verified")
    search_fields = ("user__email", "email", "subject")
    readonly_fields = ("provider", "subject", "email", "email_verified", "created_at")
    ordering = ("-created_at",)

    def has_add_permission(self, request) -> bool:
        return False
