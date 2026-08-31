"""実際に1通送ってみる確認（`manage.py send_test_email`）。

なぜ要るか
----------
「送信しました」という画面の表示は、送れたことの証明にならない。
再設定の案内は、登録の有無を漏らさないために、届いても届かなくても
同じ応答を返す（`PasswordResetRequestView`）。つまり画面からは
送信の失敗が**原理的に見えない**。

ここで守るのは3つ。

  1. どこにも届かない送り口（console / locmem）で「送れました」と
     言わない。言うと、確かめたつもりで何も確かめていないことになる
  2. 送り口が失敗したら、**0以外で終わる**（黙って成功にしない）
  3. 失敗の理由に、鍵やパスワードを出さない
"""

from __future__ import annotations

import pytest
from django.core import mail
from django.core.management import call_command
from django.core.management.base import CommandError

SMTP = "django.core.mail.backends.smtp.EmailBackend"


@pytest.fixture
def smtp_like(settings):
    """本番と同じ「smtp を使う」設定にする。送信そのものは差し替える。"""
    settings.EMAIL_BACKEND = SMTP
    settings.EMAIL_HOST = "smtp.example.com"
    settings.DEFAULT_FROM_EMAIL = "noreply@example.com"


class TestItRefusesBackendsThatNeverDeliver:
    def test_console_is_refused(self, settings):
        settings.EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

        with pytest.raises(CommandError) as caught:
            call_command("send_test_email", "someone@example.com")

        assert "確認になりません" in str(caught.value)

    def test_locmem_is_refused(self, settings):
        """テスト用の送り口も断る。ここが通ると、確認の意味が無くなる。"""
        settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

        with pytest.raises(CommandError):
            call_command("send_test_email", "someone@example.com")


class TestItNeedsTheSettings:
    def test_missing_host_is_refused(self, settings):
        settings.EMAIL_BACKEND = SMTP
        settings.EMAIL_HOST = ""
        settings.DEFAULT_FROM_EMAIL = "noreply@example.com"

        with pytest.raises(CommandError):
            call_command("send_test_email", "someone@example.com")

    def test_missing_sender_is_refused(self, settings):
        settings.EMAIL_BACKEND = SMTP
        settings.EMAIL_HOST = "smtp.example.com"
        settings.DEFAULT_FROM_EMAIL = ""

        with pytest.raises(CommandError):
            call_command("send_test_email", "someone@example.com")


class TestWhenSendingFails:
    def test_it_fails_loudly(self, smtp_like, monkeypatch):
        """送り口が落ちたら、黙って成功にしない。"""

        def _boom(*args, **kwargs):
            raise OSError("connection refused")

        monkeypatch.setattr("apps.accounts.management.commands.send_test_email.send_mail", _boom)

        with pytest.raises(CommandError) as caught:
            call_command("send_test_email", "someone@example.com")

        assert "送れませんでした" in str(caught.value)
        # 種別までは出す。原因を絞る手がかりが無いと直せない
        assert "OSError" in str(caught.value)

    def test_it_does_not_leak_the_password(self, smtp_like, monkeypatch, settings):
        """失敗の理由に、鍵やパスワードを出さない。"""
        settings.EMAIL_HOST_PASSWORD = "super-secret-value"

        def _boom(*args, **kwargs):
            raise OSError(f"auth failed for {settings.EMAIL_HOST_PASSWORD}")

        monkeypatch.setattr("apps.accounts.management.commands.send_test_email.send_mail", _boom)

        with pytest.raises(CommandError) as caught:
            call_command("send_test_email", "someone@example.com")

        assert "super-secret-value" not in str(caught.value)

    def test_zero_sent_is_a_failure(self, smtp_like, monkeypatch):
        """例外は出ないが1通も送れていない、を成功にしない。"""
        monkeypatch.setattr(
            "apps.accounts.management.commands.send_test_email.send_mail",
            lambda *a, **k: 0,
        )

        with pytest.raises(CommandError) as caught:
            call_command("send_test_email", "someone@example.com")

        assert "0" in str(caught.value) or "件数" in str(caught.value)


class TestWhenItWorks:
    def test_it_says_that_delivery_still_needs_checking(self, smtp_like, monkeypatch):
        """「送れた」で終わらせない。

        SMTP が受け付けたことと、受信箱に入ることは別。SPF / DKIM が
        揃っていないと、エラーは出ないまま迷惑メール箱へ静かに入る。
        """
        from io import StringIO

        monkeypatch.setattr(
            "apps.accounts.management.commands.send_test_email.send_mail",
            lambda *a, **k: 1,
        )
        out = StringIO()

        call_command("send_test_email", "someone@example.com", stdout=out)
        text = out.getvalue()

        assert "送信しました" in text
        assert "受信箱" in text
        assert "迷惑メール" in text
        # 実際には送っていないので、locmem にも溜まっていないこと
        assert mail.outbox == []
