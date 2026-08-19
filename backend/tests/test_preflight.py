"""公開できる状態かの確かめ（`manage.py preflight`）。

公開に要る設定は10か所以上に散っている。1つ忘れただけで
「画面は出るのに登録できない」「消しますと書いたのに消えない」という、
**動いているように見えて動いていない**状態になる。

このテストで守るのは3つ。

  1. 欠けているときに NG を出すこと
  2. **揃っているときに素通しすること**（いつも赤い確認は、
     やがて誰も読まなくなる）
  3. 人が困る欠けを「注意」に格下げしないこと
     （メールが届かない、消す仕組みが動かない、は公開してはいけない）
"""

from __future__ import annotations

from io import StringIO

import pytest
from django.core.management import call_command

SOUND = {
    "DEBUG": False,
    "SECRET_KEY": "x" * 60,
    "ALLOWED_HOSTS": ["aippo.example.com"],
    "EMAIL_BACKEND": "django.core.mail.backends.smtp.EmailBackend",
    "AI_PROVIDER": "mock",
    "CRON_SECRET": "a-secret",
    "ADMIN_ALLOWED_IPS": ["203.0.113.1"],
    "ADMIN_PATH": "secret-admin/",
    # is_configured() は環境変数ではなく settings を見る。
    # env だけ置いても、起動時に読み終わった settings は変わらない
    "EMAIL_HOST": "smtp.example.com",
    "DEFAULT_FROM_EMAIL": "noreply@example.com",
}

SOUND_ENV = {
    "FRONTEND_URL": "https://aippo.example.com",
    "EMAIL_HOST": "smtp.example.com",
    "DEFAULT_FROM_EMAIL": "noreply@example.com",
    # 本物の形（https://<key>@<org>.ingest.sentry.io/<id>）にしない。
    # 秘密情報の走査に引っかかり、テストの都合でCIが赤くなる。
    # preflight は「空でないこと」しか見ないので、これで足りる
    "SENTRY_DSN": "dummy-not-a-real-dsn",
    "VITE_OPERATOR_NAME": "テスト運営者",
    "VITE_OPERATOR_ADDRESS": "東京都",
    "VITE_OPERATOR_CONTACT": "support@example.com",
}


@pytest.fixture
def sound(settings, monkeypatch, db):
    """欠けの無い状態。ここから1つずつ抜いて確かめる。"""
    for key, value in SOUND.items():
        setattr(settings, key, value)
    for key, value in SOUND_ENV.items():
        monkeypatch.setenv(key, value)

    # 教材が無いと必ず NG になるので、1本だけ入れておく
    from apps.catalog.models import AvailabilityStatus, Course, Lesson, PublishStatus

    course = Course.objects.create(slug="c", title="コース", status=PublishStatus.PUBLISHED)
    Lesson.objects.create(
        course=course,
        slug="rewrite_text",
        number=1,
        title="レッスン",
        status=PublishStatus.PUBLISHED,
        availability_status=AvailabilityStatus.AVAILABLE,
    )


def run(**options) -> tuple[str, int]:
    """走らせて、出力と NG の数を返す。"""
    out = StringIO()
    code = 0
    try:
        call_command("preflight", stdout=out, **options)
    except SystemExit:
        code = 1
    return out.getvalue(), code


def ng_lines(text: str) -> list[str]:
    return [line for line in text.splitlines() if line.startswith("NG")]


@pytest.mark.django_db
class TestItPassesWhenEverythingIsThere:
    def test_a_sound_setup_has_no_ng(self, sound):
        """揃っているときは素通しすること。

        いつも赤い確認は、やがて誰も読まなくなる。
        そうなった時点で、この仕組みは無いのと同じになる。

        （SQLite と未適用のマイグレーションは、テスト環境では
        必ず出るので、その2つは対象から外して見る）
        """
        text, _ = run()

        remaining = [
            line
            for line in ng_lines(text)
            if "SQLite" not in line and "マイグレーション" not in line
        ]
        assert remaining == []


@pytest.mark.django_db
class TestThingsThatMustStopARelease:
    def test_debug_left_on(self, sound, settings):
        settings.DEBUG = True
        text, code = run()
        assert any("DJANGO_DEBUG" in line for line in ng_lines(text))
        assert code == 1

    def test_a_development_secret_key(self, sound, settings):
        settings.SECRET_KEY = "dev-only-change-me"
        text, _ = run()
        assert any("SECRET_KEY" in line for line in ng_lines(text))

    def test_a_short_secret_key(self, sound, settings):
        settings.SECRET_KEY = "short"
        text, _ = run()
        assert any("SECRET_KEY" in line for line in ng_lines(text))

    def test_console_email_is_not_acceptable(self, sound, settings):
        """コンソール出力のままだと、確認メールが誰にも届かない。

        `is_configured()` はコンソール出力を**常に成立**と見るので、
        そちらを先に見ると、どこにも届かない設定が OK として通る。
        """
        settings.EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
        text, _ = run()
        assert any("メール" in line for line in ng_lines(text))

    def test_missing_cron_secret(self, sound, settings):
        """消す仕組みが動かないまま公開しない。

        プライバシーポリシーに「一定期間が過ぎたら削除します」と
        書いてある。動いていなければ、書いたことが嘘になる。
        """
        settings.CRON_SECRET = ""
        text, _ = run()
        assert any("CRON_SECRET" in line for line in ng_lines(text))

    def test_no_startable_lessons(self, sound):
        """教材が0本なら、開いても何もできない。"""
        from apps.catalog.models import Lesson

        Lesson.objects.all().delete()
        text, _ = run()
        assert any("教材" in line for line in ng_lines(text))

    def test_missing_allowed_hosts(self, sound, settings):
        settings.ALLOWED_HOSTS = ["localhost", "127.0.0.1"]
        text, _ = run()
        assert any("ALLOWED_HOSTS" in line for line in ng_lines(text))

    def test_missing_frontend_url(self, sound, monkeypatch):
        monkeypatch.delenv("FRONTEND_URL", raising=False)
        text, _ = run()
        assert any("FRONTEND_URL" in line for line in ng_lines(text))


@pytest.mark.django_db
class TestOperatorInfo:
    def test_it_only_warns_for_a_closed_beta(self, sound, monkeypatch):
        """身内へ配るあいだは、空でも止めない。

        全部を NG にすると、クローズドベータが始められない。
        """
        monkeypatch.delenv("VITE_OPERATOR_NAME", raising=False)
        text, _ = run()

        assert not any("運営者" in line for line in ng_lines(text))
        assert "注意 運営者情報が空" in text

    def test_it_blocks_a_public_release(self, sound, monkeypatch):
        """一般に公開するなら、事業者の表示が要る。"""
        monkeypatch.delenv("VITE_OPERATOR_NAME", raising=False)
        text, code = run(public=True)

        assert any("運営者" in line for line in ng_lines(text))
        assert code == 1

    def test_a_blank_value_counts_as_missing(self, sound, monkeypatch):
        """空白だけ入れて埋めたことにしない。"""
        monkeypatch.setenv("VITE_OPERATOR_ADDRESS", "   ")
        text, _ = run(public=True)
        assert any("運営者" in line for line in ng_lines(text))


@pytest.mark.django_db
class TestThingsThatOnlyWarn:
    def test_mock_ai_is_a_warning_not_a_blocker(self, sound, settings):
        """mock のままでも教材は最後まで進む。試験公開なら選べる。"""
        settings.AI_PROVIDER = "mock"
        text, _ = run()
        assert not any("AI_PROVIDER" in line for line in ng_lines(text))
        assert "注意 AI_PROVIDER=mock" in text

    def test_an_open_admin_path_is_a_warning(self, sound, settings):
        settings.ADMIN_PATH = "admin/"
        text, _ = run()
        assert "注意 管理画面が /admin/ のまま" in text

    def test_an_unrestricted_admin_is_a_warning(self, sound, settings):
        settings.ADMIN_ALLOWED_IPS = []
        text, _ = run()
        assert "注意 管理画面の接続元が絞られていない" in text
