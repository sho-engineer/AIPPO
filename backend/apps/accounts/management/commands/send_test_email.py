"""1通だけ、実際に送ってみる。

    python manage.py send_test_email you@example.com

なぜ要るか
----------
「送信しました」という画面の表示は、**送れたことの証明にならない**。
このアプリの再設定の案内は、登録の有無を漏らさないために、
届いても届かなくても同じ応答を返す（`PasswordResetRequestView`）。
つまり画面からは、送信の失敗が原理的に見えない。

さらに厄介なのは、SMTP が成功しても受信箱に入るとは限らないこと。
SPF / DKIM / DMARC が揃っていないと、**エラーは出ないまま
迷惑メール箱へ静かに入る**。こちらにも相手にも何も表示されない。

だからここでは、
  1. 送り口の設定を、本番と同じ経路で実際に使う
  2. 失敗したら**理由の種別を出して 1 で終わる**（黙って成功にしない）
  3. 成功しても「届いたか」は別だと言い切る
までをやる。

出さないもの
------------
鍵・パスワード・接続文字列は出さない。失敗したときも、出すのは
例外の種別（`SMTPAuthenticationError` など）までにする。
本文にそれらが載ることがあるので、本文も出さない。
"""

from __future__ import annotations

from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "設定されている送り口で、確認用のメールを1通だけ送る"

    def add_arguments(self, parser) -> None:
        parser.add_argument("to", help="宛先。自分が受け取れるアドレス")

    def handle(self, *args, **options) -> None:
        to = options["to"].strip()
        backend = settings.EMAIL_BACKEND

        """
        どこにも届かない送り口で「送れました」と言わない。

        console / locmem は送信そのものは必ず成功する。ここを通すと、
        本番の設定を確かめたつもりで**何も確かめていない**ことになる。
        """
        if not backend.endswith("smtp.EmailBackend"):
            raise CommandError(
                f"送り口が {backend} です。"
                "これは実際には送らないので、確認になりません。"
                "EMAIL_BACKEND を smtp にして、もう一度実行してください。"
            )

        host = getattr(settings, "EMAIL_HOST", "")
        sender = getattr(settings, "DEFAULT_FROM_EMAIL", "")
        if not host or not sender:
            raise CommandError("EMAIL_HOST と DEFAULT_FROM_EMAIL を入れてください。")

        self.stdout.write(f"送り口: {host}")
        self.stdout.write(f"差出人: {sender}")
        self.stdout.write(f"宛先　: {to}")

        try:
            sent = send_mail(
                subject="【AIPPO】送信テスト",
                message=(
                    "これは AIPPO の送信テストです。\n\n"
                    "このメールが届いていれば、送り口の設定は通っています。\n"
                    "迷惑メール箱に入っていた場合は、SPF / DKIM / DMARC を"
                    "見直してください（docs/operations.md の 4）。\n"
                ),
                from_email=sender,
                recipient_list=[to],
                fail_silently=False,
            )
        except Exception as exc:  # noqa: BLE001 - 種別だけ出す
            raise CommandError(
                f"送れませんでした: {type(exc).__name__}\n"
                "よくある原因: 認証情報が違う / ポートが違う / "
                "差出人のドメインが送信サービスで認証されていない"
            ) from exc

        if not sent:
            raise CommandError(
                "送り口はエラーを返しませんでしたが、送信件数が0でした。"
                "設定を見直してください。"
            )

        self.stdout.write(self.style.SUCCESS("\n送信しました（1通）。"))
        """
        ここで終わりにしない。

        SMTP が受け付けたことと、相手の受信箱に入ることは別。
        「送れた」で確認を切り上げると、迷惑メール箱に入り続ける
        状態に気づけない。目で見るところまでを手順に含める。
        """
        self.stdout.write(
            "\n**受信箱を実際に見てください。** 送信の成功と、届くことは別です。\n"
            "  - 迷惑メール箱も見る\n"
            "  - 届いていなければ SPF / DKIM / DMARC（docs/operations.md の 4）"
        )
