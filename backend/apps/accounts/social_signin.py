"""外部サービスの身元を、この人のアカウントへ結びつける。

ここが乗っ取りの入口になりやすいので、順番を1か所に書いておく。

    1. その先の番号で、すでに繋がっている人がいる → その人
    2. いまログイン中 → その人へ繋ぐ（2つめの連携を足す場合）
    3. **確かめ済みのメール**が既存のアカウントと一致 → その人へ繋ぐ
    4. どれでもない → 新しく作る

3 の「確かめ済み」を外してはいけない
------------------------------------
確かめていないメールで繋ぐと、他人のメールアドレスを名乗るだけで
そのアカウントへ入れてしまう。Google は確かめたかどうかを必ず言うので、
言っていないものは 4 へ落とす。

メールで人を引き当てるのは 3 のときだけ
---------------------------------------
繋がりの鍵は、あくまで向こうが振る番号（`subject`）。メールは変えられるし、
LINE はそもそも返さないことがある。メールを鍵にすると、変えた瞬間に
別人の扱いになり、進み具合が消えたように見える。
"""

from __future__ import annotations

import logging
import secrets

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import SocialAccount, UserProfile
from apps.accounts.serializers import TERMS_VERSION
from apps.accounts.social import Identity, SocialAuthError

logger = logging.getLogger(__name__)
User = get_user_model()


def _username_for(identity: Identity) -> str:
    """利用者名を決める。**必ず空いている名前を返す。**

    ふだんは確かめ済みのメール。無いときや、すでに誰かが使っている
    ときは「先:番号」。番号は向こうが振るもので、人ごとに違う。

    ここで既存の名前をそのまま返すと、作る瞬間に一意制約で落ちて 500 になる。
    実際に起きるのは、確かめていないメールが既存の利用者名と重なったとき。
    そのときは 3 の結びつけを通さない（乗っ取りを防ぐため）ので、
    4 で新しく作ることになり、名前だけがぶつかる。
    """
    if identity.email_verified and identity.email:
        if not User.objects.filter(username=identity.email).exists():
            return identity.email

    fallback = f"{identity.provider}:{identity.subject}"[:150]
    if not User.objects.filter(username=fallback).exists():
        return fallback

    # ここまで来ることは、まず無い。それでも落とさない
    return f"{fallback[:140]}:{secrets.token_hex(4)}"


def _create_user(identity: Identity):
    """新しく作る。

    パスワードは使えない値にする。空にすると、Django は「未設定」として
    扱い、あとから当てられる余地が残る。
    """
    user = User.objects.create_user(
        username=_username_for(identity),
        email=identity.email if identity.email_verified else "",
        password=secrets.token_urlsafe(48),
    )
    user.set_unusable_password()
    user.save(update_fields=["password"])

    UserProfile.objects.create(
        user=user,
        display_name=identity.display_name,
        # 向こうで確かめ済みのメールなら、こちらでの確認は要らない
        email_verified_at=timezone.now() if identity.email_verified else None,
        terms_version=TERMS_VERSION,
        terms_agreed_at=timezone.now(),
    )
    return user


@transaction.atomic
def sign_in_with(identity: Identity, *, current_user=None):
    """身元から人を決める。戻り値は (user, 新規に作ったか)。"""

    # 1. すでに繋がっている
    linked = (
        SocialAccount.objects.select_for_update()
        .filter(provider=identity.provider, subject=identity.subject)
        .first()
    )
    if linked is not None:
        linked.last_login_at = timezone.now()
        # 向こうでメールを変えた場合に追随する（引き当てには使わない）
        linked.email = identity.email
        linked.email_verified = identity.email_verified
        linked.save(update_fields=["last_login_at", "email", "email_verified"])
        return linked.user, False

    # 2. いまログイン中の人へ、2つめの連携として足す
    if current_user is not None and current_user.is_authenticated:
        if SocialAccount.objects.filter(
            provider=identity.provider, user=current_user
        ).exists():
            raise SocialAuthError(
                "このアカウントには、すでに別の連携が登録されています。",
                reason="already_linked",
            )
        _link(identity, current_user)
        return current_user, False

    # 3. 確かめ済みのメールが一致する人がいる
    if identity.email and identity.email_verified:
        existing = User.objects.filter(email__iexact=identity.email).first()
        if existing is not None:
            logger.info("social.link.by_verified_email provider=%s", identity.provider)
            _link(identity, existing)
            return existing, False

    # 4. 新しく作る
    user = _create_user(identity)
    _link(identity, user)
    logger.info("social.signup provider=%s", identity.provider)
    return user, True


def _link(identity: Identity, user) -> SocialAccount:
    return SocialAccount.objects.create(
        provider=identity.provider,
        subject=identity.subject,
        user=user,
        email=identity.email,
        email_verified=identity.email_verified,
        last_login_at=timezone.now(),
    )
