"""本番設定の安全側の既定値。

守りたいこと:
- 危ない既定値のまま本番へ出そうとしたら、**動き出す前に**落ちること
- 死活監視が用途どおりに分かれていること
- 開発では今までどおり素直に動くこと
"""

import importlib
import os
from unittest import mock

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.urls import reverse

#: 本番判定を通す長さの鍵（50文字以上）。
REAL_SECRET = "x" * 50


def _load_settings(**env):
    """環境変数を差し替えて config.settings を読み直す。"""
    base = {
        "DJANGO_DEBUG": "false",
        "DJANGO_SECRET_KEY": "",
        "DJANGO_ALLOWED_HOSTS": "",
    }
    base.update(env)
    with mock.patch.dict(os.environ, base, clear=False):
        module = importlib.import_module("config.settings")
        return importlib.reload(module)


@pytest.fixture(autouse=True)
def _restore_settings():
    """読み直したモジュールを元へ戻す。他のテストへ影響させない。"""
    yield
    import config.settings

    with mock.patch.dict(os.environ, {}, clear=False):
        importlib.reload(config.settings)


class TestRefusesToStartWithUnsafeDefaults:
    def test_dev_secret_key_in_production_is_refused(self):
        with pytest.raises(ImproperlyConfigured) as exc:
            _load_settings(
                DJANGO_SECRET_KEY="dev-only-change-me",
                DJANGO_ALLOWED_HOSTS="aippo.example.com",
            )
        assert "DJANGO_SECRET_KEY" in str(exc.value)

    def test_short_secret_key_in_production_is_refused(self):
        with pytest.raises(ImproperlyConfigured) as exc:
            _load_settings(
                DJANGO_SECRET_KEY="too-short",
                DJANGO_ALLOWED_HOSTS="aippo.example.com",
            )
        assert "短すぎます" in str(exc.value)

    def test_missing_allowed_hosts_in_production_is_refused(self):
        with pytest.raises(ImproperlyConfigured) as exc:
            _load_settings(DJANGO_SECRET_KEY=REAL_SECRET)
        assert "DJANGO_ALLOWED_HOSTS" in str(exc.value)

    def test_properly_configured_production_starts(self):
        settings = _load_settings(
            DJANGO_SECRET_KEY=REAL_SECRET,
            DJANGO_ALLOWED_HOSTS="aippo.example.com",
        )
        assert settings.DEBUG is False
        assert settings.ALLOWED_HOSTS == ["aippo.example.com"]

    def test_development_still_works_without_any_env(self):
        """開発の手軽さは壊さない。"""
        settings = _load_settings(DJANGO_DEBUG="true")
        assert settings.DEBUG is True


class TestProductionHardening:
    @pytest.fixture
    def prod(self):
        return _load_settings(
            DJANGO_SECRET_KEY=REAL_SECRET,
            DJANGO_ALLOWED_HOSTS="aippo.example.com",
        )

    def test_cookies_and_transport_are_secured(self, prod):
        assert prod.SECURE_SSL_REDIRECT is True
        assert prod.SESSION_COOKIE_SECURE is True
        assert prod.CSRF_COOKIE_SECURE is True
        assert prod.SECURE_HSTS_SECONDS > 0

    def test_clickjacking_and_sniffing_are_blocked(self, prod):
        assert prod.X_FRAME_OPTIONS == "DENY"
        assert prod.SECURE_CONTENT_TYPE_NOSNIFF is True
        # 設定だけあってもミドルウェアが無いとヘッダは付かない
        assert (
            "django.middleware.clickjacking.XFrameOptionsMiddleware" in prod.MIDDLEWARE
        )

    def test_https_is_not_forced_in_development(self):
        dev = _load_settings(DJANGO_DEBUG="true")
        assert dev.SECURE_SSL_REDIRECT is False, "開発機がHTTPSでないと動かなくなる"
        assert dev.SECURE_HSTS_SECONDS == 0

    def test_oversized_bodies_are_rejected_at_the_door(self, prod):
        assert prod.DATA_UPLOAD_MAX_MEMORY_SIZE <= 1048576


class TestDatabaseSwitch:
    def test_sqlite_without_database_url(self):
        settings = _load_settings(DJANGO_DEBUG="true", DATABASE_URL="")
        assert "sqlite3" in settings.DATABASES["default"]["ENGINE"]

    def test_postgres_with_database_url(self):
        settings = _load_settings(
            DJANGO_DEBUG="true",
            DATABASE_URL="postgres://u:p@db.example.com:5432/aippo",
        )
        default = settings.DATABASES["default"]
        assert "postgresql" in default["ENGINE"]
        assert default["NAME"] == "aippo"
        assert default["HOST"] == "db.example.com"


@pytest.mark.django_db
class TestHealthEndpoints:
    def test_healthz_does_not_touch_the_database(self, client):
        """DBが詰まっただけで全プロセスが再起動されるのを避ける。"""
        response = client.get(reverse("healthz"))
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_readyz_checks_the_database(self, client):
        response = client.get(reverse("readyz"))
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_readyz_reports_which_ai_is_in_use(self, client):
        """事故調査で最初に知りたい情報。"""
        assert "ai_provider" in client.get(reverse("readyz")).json()

    def test_readyz_returns_503_when_the_database_is_down(self, client, monkeypatch):
        def _boom(*args, **kwargs):
            raise RuntimeError("database is gone")

        monkeypatch.setattr("apps.health.views.connection.cursor", _boom)
        response = client.get(reverse("readyz"))

        assert response.status_code == 503
        assert "database is gone" not in response.content.decode(), (
            "内部の事情を外へ出している"
        )
