"""Django 設定。

環境変数は `.env`（`.env.example` を参照）から読み込む。
"""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).lower() in {"1", "true", "yes"}


def _list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


#: 開発用の鍵。この値のまま本番へ出すと、署名を誰でも偽造できる。
DEV_SECRET_KEY = "dev-only-change-me"

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", DEV_SECRET_KEY)

# 既定は「開発」。本番は DJANGO_DEBUG=false を明示する。
# 逆（既定を本番）にすると、設定を1つ忘れただけで開発機がむき出しになる。
DEBUG = _bool("DJANGO_DEBUG", True)

ALLOWED_HOSTS = _list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

# 本番の姿で起動しようとしているのに、危ない既定値が残っていたら起動させない。
# 「うっかり本番へ出た」を、動き出す前に止めるための関門。
if not DEBUG:
    problems = []
    if SECRET_KEY == DEV_SECRET_KEY:
        problems.append("DJANGO_SECRET_KEY が開発用のままです")
    elif len(SECRET_KEY) < 50:
        problems.append(
            "DJANGO_SECRET_KEY が短すぎます（50文字以上の乱数にしてください）"
        )
    if not os.getenv("DJANGO_ALLOWED_HOSTS"):
        problems.append("DJANGO_ALLOWED_HOSTS が設定されていません")
    if problems:
        raise ImproperlyConfigured(
            "本番設定で起動できません:\n  - " + "\n  - ".join(problems)
        )

INSTALLED_APPS = [
    # 管理画面。実証実験で集めたデータを見るために入れている。
    # 学習者向けのログインではない（学習者は匿名のまま／憲章 原則 VI）。
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "apps.lessons",
    "apps.profiles",
    "apps.tutor",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    # 以下3つは管理画面に必要（学習者向けAPIでは使わない）
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    # X_FRAME_OPTIONS はこのミドルウェアが無いと効かない
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.lessons.middleware.LearnerKeyMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

# DATABASE_URL があれば PostgreSQL、無ければ SQLite。
# 開発は SQLite のまま、本番は環境変数1つで切り替わる。
_database_url = os.getenv("DATABASE_URL", "")
if _database_url:
    import dj_database_url

    DATABASES = {
        "default": dj_database_url.parse(
            _database_url,
            conn_max_age=int(os.getenv("DB_CONN_MAX_AGE", "600")),
            conn_health_checks=True,
        )
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
            "OPTIONS": {
                # 既定では書き込みが重なった瞬間に「database is locked」で落ちる。
                # 読み書きを並行できるようにし、ぶつかっても少し待つ。
                "init_command": "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;",
                "timeout": 20,
            },
            # テストも実ファイルで動かす。メモリ上のDBでは WAL が効かず、
            # 同時アクセスの検証が本番と違う結果になってしまう。
            "TEST": {"NAME": BASE_DIR / "test_db.sqlite3"},
        }
    }

LANGUAGE_CODE = "ja"
TIME_ZONE = "Asia/Tokyo"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    # 管理画面の CSS などを、Web サーバーを別に立てずに配信する。
    # 開発では collectstatic をしないので、素の配信に倒す。
    "staticfiles": {
        "BACKEND": (
            "django.contrib.staticfiles.storage.StaticFilesStorage"
            if DEBUG
            else "whitenoise.storage.CompressedManifestStaticFilesStorage"
        )
    },
}
WHITENOISE_AUTOREFRESH = DEBUG
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- 通信とヘッダの安全側設定 -------------------------------------------
# 開発（DEBUG=True）では無効。HTTPS でない開発機で有効にすると動かなくなるため。
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https") if not DEBUG else None

# 既定は「本番ならHTTPSへ飛ばす」。
# ただし前段のロードバランサが既にHTTPSへ寄せている場合や、
# 本番の姿のまま手元で動作確認したい場合は、明示的に切れるようにしておく。
SECURE_SSL_REDIRECT = _bool("SECURE_SSL_REDIRECT", not DEBUG)
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_HSTS_SECONDS = 0 if DEBUG else int(os.getenv("SECURE_HSTS_SECONDS", "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# 本文の長さは Serializer 側でも見ているが、
# 巨大な本文でメモリを食い潰されないよう入口でも止める。
DATA_UPLOAD_MAX_MEMORY_SIZE = int(os.getenv("DATA_UPLOAD_MAX_MEMORY_SIZE", "1048576"))
DATA_UPLOAD_MAX_NUMBER_FIELDS = 100

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "UNAUTHENTICATED_USER": None,
}

CORS_ALLOWED_ORIGINS = _list(
    "CORS_ALLOWED_ORIGINS",
    # localhost と 127.0.0.1 は別オリジン。どちらで開いても届くようにする
    "http://localhost:5173,http://127.0.0.1:5173",
)
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

# セッション単位の上限だけでは足りない。learner_key は Cookie なので、
# 消せば毎回まっさらなセッションになり、1人でいくらでも実行できてしまう。
# 接続元単位と全体の1日あたり上限で、利用料の暴走を止める。
# 0以下にすると「上限なし」。
#
# 目安: レッスン1本の完走に必要なAI実行は 10〜12回。
AI_RUNS_PER_IP_PER_DAY = int(os.getenv("AI_RUNS_PER_IP_PER_DAY", "100"))
AI_RUNS_PER_DAY = int(os.getenv("AI_RUNS_PER_DAY", "2000"))

# ロードバランサ配下に置くときだけ true にする。
# 直接公開している状態で true にすると、接続元を詐称して上限を回避できる。
TRUST_FORWARDED_FOR = _bool("TRUST_FORWARDED_FOR", False)

# 匿名学習者の識別
LEARNER_KEY_COOKIE = "learner_key"
LEARNER_KEY_MAX_AGE = 60 * 60 * 24 * 90  # 90日

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
