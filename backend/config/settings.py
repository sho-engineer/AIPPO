"""Django 設定。

環境変数は `.env`（`.env.example` を参照）から読み込む。
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).lower() in {"1", "true", "yes"}


def _list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-change-me")
DEBUG = _bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = _list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "apps.lessons",
    "apps.profiles",
    "apps.tutor",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "apps.lessons.middleware.LearnerKeyMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    }
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

LANGUAGE_CODE = "ja"
TIME_ZONE = "Asia/Tokyo"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "UNAUTHENTICATED_USER": None,
}

CORS_ALLOWED_ORIGINS = _list("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
CORS_ALLOW_CREDENTIALS = True

# --- AI プロバイダ -------------------------------------------------------
# "stub" のままでもレッスンを完走できることが憲章 原則 III の要件。
AI_PROVIDER = os.getenv("AI_PROVIDER", "stub")
AI_MODEL = os.getenv("AI_MODEL", "claude-opus-5")

# チューターのフィードバック（短い・速さ優先）
TUTOR_TIMEOUT_SECONDS = float(os.getenv("TUTOR_TIMEOUT_SECONDS", "12"))
TUTOR_MAX_RETRIES = int(os.getenv("TUTOR_MAX_RETRIES", "1"))

# レッスン本体のAI実行（長い・待たせる前提）
LESSON_RUN_TIMEOUT_SECONDS = float(os.getenv("LESSON_RUN_TIMEOUT_SECONDS", "30"))

# 1セッションあたりのAI実行回数の上限。
# 無制限だとAI利用料が青天井になるため、MVPの時点から入れておく。
# レッスン1本は通常4〜6回で完走できるため、10回あれば試行錯誤の余地は十分ある。
MAX_ATTEMPTS_PER_SESSION = int(os.getenv("MAX_ATTEMPTS_PER_SESSION", "10"))

# 匿名学習者の識別
LEARNER_KEY_COOKIE = "learner_key"
LEARNER_KEY_MAX_AGE = 60 * 60 * 24 * 90  # 90日

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
