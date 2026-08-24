"""公開できる状態か、まとめて確かめる。

    python manage.py preflight

なぜ要るか
----------
公開に要る設定は10か所以上に散っている。1つ忘れただけで
「画面は出るのに登録できない」「消しますと書いたのに消えない」
といった、**動いているように見えて動いていない**状態になる。

`/health/ready` は動き出したあとの死活監視で、見るのは4つだけ
（DB・migration・AI・メール）。合言葉の入れ忘れや、教材の取り込み忘れ、
運営者情報の空欄は素通りする。それらは動き出す前に気づきたい。

止めるものと、知らせるだけのもの
--------------------------------
- **NG** … これがあると公開してはいけない。人が困るか、法に触れる
- **注意** … 公開はできるが、分かったうえで選んでいるべきこと

全部を NG にすると、身内だけのクローズドベータが始められない。
逆に全部を注意にすると、本当に困るものが埋もれる。
"""

from __future__ import annotations

import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import connection

#: 運営者情報を入れないまま公開してよい範囲。
#:
#: 身内だけに配るあいだは空でも困らないが、一般に公開するなら
#: 事業者の表示が要る（特定商取引法・景品表示法）。
OPERATOR_KEYS = ("VITE_OPERATOR_NAME", "VITE_OPERATOR_ADDRESS", "VITE_OPERATOR_CONTACT")


class Result:
    """1つ分の判定。"""

    def __init__(self, level: str, title: str, detail: str = "") -> None:
        self.level = level  # "ok" / "warn" / "ng"
        self.title = title
        self.detail = detail


class Command(BaseCommand):
    help = "公開できる状態かをまとめて確かめる"

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--public",
            action="store_true",
            help="一般公開として見る（運営者情報の空欄を NG に上げる）",
        )

    def handle(self, *args, **options) -> None:
        public = options["public"]
        results: list[Result] = []

        results += self._core()
        results += self._database()
        results += self._catalog()
        results += self._mail()
        results += self._ai()
        results += self._social()
        results += self._operations()
        results += self._operator(public=public)

        self._report(results, public=public)

    # ------------------------------------------------------------ 基本

    def _core(self) -> list[Result]:
        out = []

        if settings.DEBUG:
            out.append(
                Result(
                    "ng",
                    "DJANGO_DEBUG が true",
                    "例外の中身と設定が画面に出ます。false にしてください",
                )
            )
        else:
            out.append(Result("ok", "DJANGO_DEBUG=false"))

        key = settings.SECRET_KEY
        if key == "dev-only-change-me":
            out.append(
                Result("ng", "DJANGO_SECRET_KEY が開発用のまま", "署名を誰でも偽造できます")
            )
        elif len(key) < 50:
            out.append(Result("ng", "DJANGO_SECRET_KEY が短い", "50文字以上の乱数にしてください"))
        else:
            out.append(Result("ok", "DJANGO_SECRET_KEY"))

        if not settings.ALLOWED_HOSTS or settings.ALLOWED_HOSTS == ["localhost", "127.0.0.1"]:
            out.append(
                Result("ng", "DJANGO_ALLOWED_HOSTS が未設定", "公開するドメインを入れてください")
            )
        else:
            out.append(Result("ok", f"ALLOWED_HOSTS={','.join(settings.ALLOWED_HOSTS)}"))

        frontend = os.getenv("FRONTEND_URL", "")
        if not frontend:
            out.append(
                Result(
                    "ng",
                    "FRONTEND_URL が未設定",
                    "確認メールと再設定メールのリンクの行き先です",
                )
            )
        elif not frontend.startswith("https://"):
            out.append(Result("warn", "FRONTEND_URL が https でない", frontend))
        else:
            out.append(Result("ok", f"FRONTEND_URL={frontend}"))

        return out

    # ------------------------------------------------------------ DB

    def _database(self) -> list[Result]:
        out = []
        engine = settings.DATABASES["default"]["ENGINE"]

        if engine.endswith("sqlite3"):
            out.append(
                Result(
                    "ng",
                    "SQLite のまま",
                    "Vercel では要求ごとに消えます。登録も進捗も残りません",
                )
            )
        else:
            out.append(Result("ok", "PostgreSQL に繋がっています"))

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            out.append(Result("ok", "DBへ接続できました"))
        except Exception as exc:  # noqa: BLE001
            out.append(Result("ng", "DBへ接続できません", type(exc).__name__))
            return out

        # 表が無いまま公開すると、開いた瞬間に全部落ちる
        from django.db.migrations.executor import MigrationExecutor

        try:
            executor = MigrationExecutor(connection)
            pending = executor.migration_plan(executor.loader.graph.leaf_nodes())
            if pending:
                out.append(
                    Result(
                        "ng",
                        f"未適用のマイグレーションが{len(pending)}件",
                        "migrate を流してください",
                    )
                )
            else:
                out.append(Result("ok", "マイグレーションは適用済み"))
        except Exception as exc:  # noqa: BLE001
            out.append(Result("warn", "マイグレーションを確認できません", type(exc).__name__))

        # キャッシュ表は、無くても**落ちない**。二重送信の防止だけが
        # 静かに効かなくなる（apps/ai/views.py は読み書きの失敗を素通りする）。
        # 動かして気づける類ではないので、ここで見るしかない。
        # 本物のAIでは、これがそのまま二重の費用になる。
        from django.core.cache import cache

        try:
            cache.get("preflight:probe")
            out.append(Result("ok", "キャッシュ表（二重送信の防止）"))
        except Exception:  # noqa: BLE001 - 表が無い / 権限が無い
            out.append(
                Result(
                    "ng",
                    "キャッシュ表が無い",
                    "二重送信の防止が効きません（落ちないので気づけません）。"
                    "migrate を流してください",
                )
            )

        User = get_user_model()
        if not User.objects.filter(is_superuser=True).exists():
            out.append(
                Result("warn", "管理者アカウントが無い", "createsuperuser で作れます")
            )
        else:
            out.append(Result("ok", "管理者アカウントあり"))

        return out

    # ------------------------------------------------------------ 教材

    def _catalog(self) -> list[Result]:
        from apps.catalog.models import AvailabilityStatus, Lesson, PublishStatus

        try:
            startable = Lesson.objects.filter(
                status=PublishStatus.PUBLISHED,
                availability_status=AvailabilityStatus.AVAILABLE,
            ).count()
        except Exception as exc:  # noqa: BLE001
            return [Result("ng", "教材を数えられません", type(exc).__name__)]

        if startable == 0:
            return [
                Result(
                    "ng",
                    "始められる教材が0本",
                    "seed_catalog を流してください。開いても何もできません",
                )
            ]
        return [Result("ok", f"始められる教材 {startable}本")]

    # ------------------------------------------------------------ メール

    def _mail(self) -> list[Result]:
        from apps.accounts import emails

        # 送り口の判定を先にする。`is_configured()` は「その送り口として
        # 成立しているか」しか見ないので、コンソール出力は**常に成立する**。
        # 順番を逆にすると、どこにも届かない設定が OK として通る。
        backend = settings.EMAIL_BACKEND
        if backend.endswith("console.EmailBackend"):
            return [
                Result(
                    "ng",
                    "メールがコンソール出力のまま",
                    "確認メールが届かず、登録した人が本人確認できません"
                    "（ログに本文が出るだけです）",
                )
            ]
        if backend.endswith("locmem.EmailBackend") or backend.endswith("dummy.EmailBackend"):
            return [Result("ng", "メールがテスト用の送り口のまま", backend)]

        if emails.is_configured():
            return [Result("ok", f"メール送信 ({os.getenv('EMAIL_HOST', backend)})")]

        return [Result("ng", "メールの設定が足りない", "EMAIL_HOST / DEFAULT_FROM_EMAIL")]

    # ------------------------------------------------------------ AI

    def _ai(self) -> list[Result]:
        from apps.ai.providers.registry import check_configured

        provider = getattr(settings, "AI_PROVIDER", "")
        try:
            check_configured()
        except Exception as exc:  # noqa: BLE001
            return [Result("ng", f"AIの設定が不正 (AI_PROVIDER={provider})", type(exc).__name__)]

        if provider == "mock":
            return [
                Result(
                    "warn",
                    "AI_PROVIDER=mock",
                    "決まった文が返るだけで、本物のAIは動きません",
                )
            ]
        return [Result("ok", f"AI_PROVIDER={provider}")]

    # ------------------------------------------------------------ 運用

    def _operations(self) -> list[Result]:
        out = []

        if not getattr(settings, "CRON_SECRET", ""):
            out.append(
                Result(
                    "ng",
                    "CRON_SECRET が未設定",
                    "古いデータの自動削除も学習リマインダーも動きません"
                    "（プライバシーポリシーに「消します」と書いてあります）",
                )
            )
        else:
            out.append(Result("ok", "CRON_SECRET"))

        if not getattr(settings, "ADMIN_ALLOWED_IPS", []):
            out.append(
                Result(
                    "warn",
                    "管理画面の接続元が絞られていない",
                    "ADMIN_ALLOWED_IPS。合言葉だけが守りになります",
                )
            )
        else:
            out.append(Result("ok", "管理画面の接続元を制限"))

        if getattr(settings, "ADMIN_PATH", "admin/") == "admin/":
            out.append(
                Result("warn", "管理画面が /admin/ のまま", "DJANGO_ADMIN_PATH で変えられます")
            )
        else:
            out.append(Result("ok", "管理画面の場所を変更済み"))

        if not os.getenv("SENTRY_DSN", ""):
            out.append(
                Result("warn", "エラー監視なし", "SENTRY_DSN。落ちても気づけません")
            )
        else:
            out.append(Result("ok", "エラー監視 (Sentry)"))

        return out

    # ------------------------------------------------ 外部サービスのログイン

    def _social(self) -> list[Result]:
        """Google / LINE の戻り先を、**そのまま貼れる形で**出す。

        なぜここまでするか
        ------------------
        `redirect_uri_mismatch` は、向こうの管理画面に登録した文字列と、
        こちらが送っている文字列が1文字でも違えば出る。そして
        **エラーの文面からは、何がどう違うかが一切分からない。**
        突き合わせようにも、こちらが何を送っているかを見る手段が
        今まで無かった（ログにも出ていない）。

        `BACKEND_URL` が空のときが特に危ない
        ------------------------------------
        そのときの戻り先は「要求が届いたときの Host」から組み立てられる
        （apps/accounts/social.py の `redirect_uri`）。手元では正しく動く。
        だが Vercel は配置ごとに違うホスト名を割り当てるので、
        **プレビュー配置からログインすると毎回ちがう戻り先が送られ、
        必ず mismatch になる。** 本番のホスト名で来たときだけ通る、
        という再現しにくい壊れ方をする。

        だから空のときは「決まっていない」ことを警告として出し、
        入っているときは**実際に送る文字列そのもの**を出す。
        """
        from apps.accounts.social import all_providers

        out: list[Result] = []
        base = (getattr(settings, "BACKEND_URL", "") or "").strip().rstrip("/")
        configured = [p for p in all_providers().values() if p.configured]

        if not configured:
            # 鍵が無い先はボタンごと出ないので、困りごとは起きない
            return [Result("ok", "外部ログインは未設定（ボタンを出しません）")]

        names = "・".join(p.label for p in configured)

        if not base:
            out.append(
                Result(
                    "ng",
                    f"BACKEND_URL が空（{names} が壊れます）",
                    "戻り先が要求ごとに変わります。"
                    "プレビュー配置からのログインは必ず redirect_uri_mismatch になります。"
                    "BACKEND_URL に本番URL（例 https://aippo.vercel.app）を入れてください",
                )
            )
            return out

        for provider in configured:
            uri = f"{base}/api/v1/accounts/social/{provider.name}/callback/"
            out.append(
                Result(
                    "ok",
                    f"{provider.label} の戻り先",
                    f"この文字列をそのまま登録してください → {uri}",
                )
            )

        # 画面の場所と食い違っていると、戻ったあとに行き先を見失う
        front = (getattr(settings, "FRONTEND_URL", "") or "").strip().rstrip("/")
        if front and base != front:
            out.append(
                Result(
                    "warn",
                    "BACKEND_URL と FRONTEND_URL が違う",
                    f"api={base} / 画面={front}。"
                    "同じドメインに同居する構成なら、揃っているのが普通です",
                )
            )

        return out

    # ------------------------------------------------------------ 運営者

    def _operator(self, *, public: bool) -> list[Result]:
        """運営者情報。

        画面側（Vite）のビルド時に埋まる値なので、ここで見えるのは
        「この環境に入っているか」まで。実際に配られている画面に
        入っているかは、公開後に規約の画面で目視すること。
        """
        missing = [key for key in OPERATOR_KEYS if not os.getenv(key, "").strip()]
        if not missing:
            return [Result("ok", "運営者情報")]

        detail = f"{', '.join(missing)}。規約に「（公開前に記入）」と出ます"
        if public:
            return [Result("ng", "運営者情報が空", detail)]
        return [Result("warn", "運営者情報が空", detail + "。身内配布なら可")]

    # ------------------------------------------------------------ 出力

    def _report(self, results: list[Result], *, public: bool) -> None:
        marks = {"ok": "OK  ", "warn": "注意", "ng": "NG  "}

        for result in results:
            line = f"{marks[result.level]} {result.title}"
            if result.detail:
                line += f"\n       → {result.detail}"
            if result.level == "ng":
                self.stdout.write(self.style.ERROR(line))
            elif result.level == "warn":
                self.stdout.write(self.style.WARNING(line))
            else:
                self.stdout.write(self.style.SUCCESS(line))

        ng = sum(1 for r in results if r.level == "ng")
        warn = sum(1 for r in results if r.level == "warn")

        self.stdout.write("")
        mode = "一般公開" if public else "クローズドベータ"
        self.stdout.write(f"[{mode}として判定] NG {ng}件 / 注意 {warn}件")

        if ng:
            # 0 以外で終わる。CI や配置手順から「止める」判断に使える
            raise SystemExit(1)
