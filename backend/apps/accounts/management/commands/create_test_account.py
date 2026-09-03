"""動作確認用のアカウントを作る（作り直す）。

    python manage.py create_test_account --email you@example.com

なぜ手で作らないか
------------------
確認用のアカウントに要るものは3つある——管理画面へ入れること、
1日の上限に当たらないこと、学習者としても普通に使えること。
`createsuperuser` で作ると3つ目が抜ける。プロフィール
（`UserProfile`）が無いまま学習を始めると、表示名も規約同意も
空のまま進み、**本番の利用者と違う状態**を確かめることになる。

合言葉はここに書かない
----------------------
リポジトリに置いた時点で、それは合言葉ではなくなる。受け取り方は2つ。

    TEST_ACCOUNT_PASSWORD=…  環境変数から読む（CI や手順書向き）
    （何も渡さない）          その場で作って、1度だけ表示する

表示は**この端末に1回出るだけ**で、どこにも残さない。控え忘れたら
`--reset-password` でもう一度作り直す。

権限は明示して渡す
------------------
`--staff` と `--superuser` は既定で**付かない**。「テスト用だから
全部入り」で作ると、あとから本番に残っていたときに、何ができる
アカウントなのか誰にも分からなくなる。要るものを、そのつど言う。

1日の上限について
-----------------
`--unlimited` で外れるのは**その人ぶんの1日の上限だけ**
（`UserProfile.unlimited_ai_runs`）。接続元ごと・全体の安全弁は
外れない。あちらは費用が跳ねないための最後の歯止めで、確認用の
アカウント1つのために外してよいものではない。

外したあとは、管理画面の一覧を `1日の上限を外す` で絞れば、
解放したままの人がいつでも数えられる。
"""

from __future__ import annotations

import os
import secrets

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import UserProfile

User = get_user_model()

#: 環境変数から合言葉を受け取る口。
PASSWORD_ENV = "TEST_ACCOUNT_PASSWORD"

#: その場で作るときの長さ（文字数ではなくバイト数の目安）。
GENERATED_BYTES = 18


class Command(BaseCommand):
    help = "動作確認用のアカウントを作る（すでにあれば設定だけ直す）"

    def add_arguments(self, parser) -> None:
        parser.add_argument("--email", required=True, help="ログインに使うメールアドレス")
        parser.add_argument(
            "--display-name", default="テスト", help="画面に出す名前（既定: テスト）"
        )
        parser.add_argument(
            "--staff",
            action="store_true",
            help="管理画面へ入れるようにする（is_staff）",
        )
        parser.add_argument(
            "--superuser",
            action="store_true",
            help="管理画面で全部を触れるようにする（is_superuser。--staff も付く）",
        )
        parser.add_argument(
            "--unlimited",
            action="store_true",
            help="その人ぶんの1日の上限を外す（接続元ごと・全体の安全弁は外れない）",
        )
        parser.add_argument(
            "--limited",
            action="store_true",
            help="1日の上限を元に戻す",
        )
        parser.add_argument(
            "--reset-password",
            action="store_true",
            help="すでにあるアカウントの合言葉も付け直す",
        )

    def handle(self, *args, **options) -> None:
        email = (options["email"] or "").strip().lower()
        try:
            validate_email(email)
        except ValidationError as exc:
            raise CommandError(f"メールアドレスの形が違います: {email}") from exc

        if options["unlimited"] and options["limited"]:
            raise CommandError("--unlimited と --limited は同時に渡せません。")

        superuser = options["superuser"]
        # 管理画面は is_staff が入り口。is_superuser だけ付けても入れない
        staff = options["staff"] or superuser

        existing = User.objects.filter(username=email).first()
        password, generated = self._password(
            needed=existing is None or options["reset_password"]
        )

        with transaction.atomic():
            user, created = User.objects.get_or_create(
                username=email, defaults={"email": email}
            )
            if password is not None:
                user.set_password(password)
            user.email = email
            # 権限は**渡されたときだけ上げる**。付いているものを黙って
            # 下げると、既にある運用アカウントを壊すことがある
            if staff:
                user.is_staff = True
            if superuser:
                user.is_superuser = True
            user.save()

            profile, _ = UserProfile.objects.get_or_create(
                user=user,
                defaults={
                    "display_name": options["display_name"],
                    # 確認用でも、本番と同じ状態にしておく。空のままだと
                    # 規約同意や確認済みを見る画面が、本番と違う顔になる
                    "terms_agreed_at": timezone.now(),
                    "email_verified_at": timezone.now(),
                },
            )
            if options["unlimited"] or options["limited"]:
                profile.unlimited_ai_runs = bool(options["unlimited"])
                profile.save(update_fields=["unlimited_ai_runs", "updated_at"])

        self._report(user, created, profile, password, generated)

    def _password(self, *, needed: bool) -> tuple[str | None, bool]:
        """合言葉を決める。付け直さないときは None。

        環境変数が空文字のときは「渡されていない」として扱う。
        空の合言葉をそのまま入れると、誰でも入れるアカウントになる。
        """
        if not needed:
            return None, False
        from_env = os.getenv(PASSWORD_ENV, "").strip()
        if from_env:
            return from_env, False
        return secrets.token_urlsafe(GENERATED_BYTES), True

    def _report(
        self,
        user,
        created: bool,
        profile: UserProfile,
        password: str | None,
        generated: bool,
    ) -> None:
        """いま**そのアカウントが何をできるか**を出す。

        「この回に渡した引数」ではなく、直したあとの状態を読む。
        引数を出すと、2回目に `--superuser` を付けなかったときに
        「管理画面に入れない」と読めてしまう——実際には付いたままなので、
        いちばん知りたいことで嘘をつくことになる。
        """
        what = "を作りました" if created else "の設定を直しました"
        self.stdout.write(self.style.SUCCESS(f"{user.email}{what}。"))

        can = []
        if user.is_superuser:
            can.append("管理画面（全部）")
        elif user.is_staff:
            can.append("管理画面")
        else:
            can.append("管理画面に入れない")
        can.append(
            "1日の上限なし" if profile.unlimited_ai_runs else "1日の上限あり（通常どおり）"
        )
        self.stdout.write("  " + " / ".join(can))

        if profile.unlimited_ai_runs:
            self.stdout.write(
                self.style.WARNING(
                    "  外れているのは、その人ぶんの1日の上限だけです。"
                    "接続元ごと・全体の安全弁は効いています。"
                )
            )
            self.stdout.write(
                "  確認が終わったら --limited か管理画面で戻してください。"
            )

        if generated:
            # ここでしか出さない。控えてから閉じること
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("  合言葉（この1回しか出ません）:"))
            self.stdout.write(f"    {password}")
            self.stdout.write("")
        elif password is not None:
            self.stdout.write(f"  合言葉は環境変数 {PASSWORD_ENV} のものにしました。")
