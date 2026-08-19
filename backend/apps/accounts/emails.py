"""確認メールと再設定メール。

第一リリースで送るのは3通だけ。

    メールアドレスの確認
    パスワードの再設定
    登録完了のお知らせ

送れなかったことを黙って飲み込まない。飲み込むと、
「確認メールが届かない」という問い合わせが来るまで気づけない。
記録に残し、ヘルスチェックでも設定の有無を見る。

本文にパスワードそのものは絶対に書かない。
書けば、メールボックスを見られた時点で乗っ取られる。
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

logger = logging.getLogger(__name__)


def _front(path: str) -> str:
    base = (getattr(settings, "FRONTEND_URL", "") or "http://localhost:5173").rstrip("/")
    return f"{base}{path}"


def _token_link(user, path: str) -> str:
    """使い捨ての合言葉つきの行き先を作る。

    Django の既定の作りをそのまま使う。パスワードのハッシュと
    最終ログイン時刻が変わると効かなくなるので、使い回せない。
    """
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return _front(f"{path}?uid={uid}&token={token}")


def _send(subject: str, body: str, to: str, *, kind: str) -> bool:
    """送る。送れなければ False を返し、記録に残す。

    送信先と件名は残すが、本文は残さない（合言葉が入っているため）。
    """
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to],
            fail_silently=False,
        )
    except Exception as exc:  # noqa: BLE001 - 送信の失敗で登録を止めない
        logger.error("accounts.email.failed kind=%s error=%s", kind, type(exc).__name__)
        return False

    logger.info("accounts.email.sent kind=%s", kind)
    return True


def send_verification(user) -> bool:
    link = _token_link(user, "/verify-email")
    return _send(
        "【AIPPO】メールアドレスの確認",
        (
            "AIPPO への登録ありがとうございます。\n\n"
            "次のリンクを開くと、メールアドレスの確認が完了します。\n\n"
            f"{link}\n\n"
            "このリンクは一定時間で使えなくなります。\n"
            "心当たりがない場合は、このメールを破棄してください。\n"
        ),
        user.email,
        kind="verification",
    )


def send_password_reset(user) -> bool:
    link = _token_link(user, "/reset-password")
    return _send(
        "【AIPPO】パスワードの再設定",
        (
            "パスワードの再設定を受け付けました。\n\n"
            "次のリンクから、新しいパスワードを設定してください。\n\n"
            f"{link}\n\n"
            "このリンクは一定時間で使えなくなります。\n"
            "心当たりがない場合は、このメールを破棄してください。"
            "パスワードは変更されません。\n"
        ),
        user.email,
        kind="password_reset",
    )


def send_welcome(user) -> bool:
    return _send(
        "【AIPPO】登録が完了しました",
        (
            "AIPPO へようこそ。\n\n"
            "登録前に進めた学習の記録は、このアカウントへ引き継がれています。\n"
            "別の端末からログインしても、続きから始められます。\n\n"
            f"{_front('/')}\n"
        ),
        user.email,
        kind="welcome",
    )


def is_configured() -> bool:
    """メールを実際に送れる設定になっているか。

    開発ではコンソールへ出すので True。本番で smtp を指定したのに
    宛先サーバーが空、といった抜けをヘルスチェックで拾う。
    """
    backend = getattr(settings, "EMAIL_BACKEND", "")
    if "smtp" not in backend:
        # console / locmem / dummy。送れないが、設定としては成立している
        return True
    return bool(getattr(settings, "EMAIL_HOST", ""))


def send_study_reminder(user, *, days_away: int) -> bool:
    """しばらく開いていない人に、そっと知らせる。

    このアプリは「7日でAIの最初の一歩」と言っている。だが2日目に
    戻ってくる仕掛けが何も無く、1本やって終わる人を止められなかった。

    書き方の決まり
    --------------
    - **急かさない**。「まだ終わっていません」「連続記録が途切れます」は
      書かない。相手はAIに不安がある初心者で、急かされると
      「向いていない」と受け取って離れる
    - 次にやることを1つだけ書く。選ばせない
    - 1回10分で終わることを言う。時間が読めないと後回しになる
    - 止め方を必ず添える。止められない知らせは、ただの迷惑になる
    """
    link = _front("/")
    body = (
        f"{user.email} さん\n\n"
        f"{days_away}日ぶりです。少しだけ続きをやってみませんか。\n"
        "1回10分ほどで終わります。\n\n"
        f"{link}\n\n"
        "---\n"
        "この知らせが要らないときは、設定 → 通知設定 から止められます。\n"
    )
    return _send(
        "AIPPO：続きをやってみませんか",
        body,
        user.email,
        kind="study_reminder",
    )
