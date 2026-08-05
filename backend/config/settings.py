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

    # 画面の場所。確認メールと再設定メールのリンクがここへ向く。
    # 間違えると、届いたメールのリンクが開けないか、よそへ飛ぶ
    if not os.getenv("FRONTEND_URL"):
        problems.append(
            "FRONTEND_URL が設定されていません"
            "（確認メールと再設定メールのリンクの行き先です）"
        )

    # メールを送れないまま登録を開くと、確認も再設定もできない人が出る。
    # 「あとで直す」が効かない種類の抜けなので、起動時に止める
    if os.getenv("EMAIL_BACKEND", "").endswith("smtp.EmailBackend"):
        if not os.getenv("EMAIL_HOST"):
            problems.append("EMAIL_HOST が設定されていません")
        if not os.getenv("DEFAULT_FROM_EMAIL"):
            problems.append("DEFAULT_FROM_EMAIL が設定されていません")

    if problems:
        raise ImproperlyConfigured(
            "本番設定で起動できません:\n  - " + "\n  - ".join(problems)
        )

INSTALLED_APPS = [
    # 管理画面。教材の編集と、実証実験で集めたデータの確認に使う。
    # 学習者のログインとは別物（学習者側は apps/accounts）。
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "apps.ai",
    "apps.accounts",
    "apps.catalog",
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

# パスワードの弱さを止める。既定は空なので、書かないと "password" が通る。
# 文言はそのまま画面に出るので、日本語（LANGUAGE_CODE = "ja"）で出る。
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

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

CORS_ALLOWED_ORIGINS = _list(
    "CORS_ALLOWED_ORIGINS",
    # localhost と 127.0.0.1 は別オリジン。どちらで開いても届くようにする
    "http://localhost:5173,http://127.0.0.1:5173",
)
CORS_ALLOW_CREDENTIALS = True

# --- ログイン状態の持ち方 -------------------------------------------------
# 合言葉（トークン）は画面へ渡さない。Django のセッション Cookie だけを使う。
# localStorage へ置くと、画面に差し込まれた script から読み取れてしまう。
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "Lax")
CSRF_COOKIE_SAMESITE = os.getenv("CSRF_COOKIE_SAMESITE", "Lax")
# CSRF の合言葉は script から読めないと送り返せないので HttpOnly にしない。
# 読めても、別サイトからは Cookie ごと送れないので目的は果たせる。
CSRF_COOKIE_HTTPONLY = False
# 30日。毎日開くものではないので、短くするとログインし直しばかりになる。
SESSION_COOKIE_AGE = int(os.getenv("SESSION_COOKIE_AGE", str(60 * 60 * 24 * 30)))
SESSION_SAVE_EVERY_REQUEST = True
# 画面と API が別ホストのとき、POST の送り元として明示が要る。
CSRF_TRUSTED_ORIGINS = _list("CSRF_TRUSTED_ORIGINS", ",".join(CORS_ALLOWED_ORIGINS))

# --- 認証の連打を止める ---------------------------------------------------
# 接続元（SOURCE）と、狙われている宛先（TARGET）の両方で数える
# （apps/accounts/throttle.py）。0以下にすると「上限なし」。
#
# 接続元のほうを緩くしてあるのは、会社や学校からは何人もが同じ接続元に
# 見えるため。同じ厳しさにすると、隣の席の人が数回試しただけで
# その場の全員が締め出される。狙い撃ちを止めるのは宛先ごとの数え。
AUTH_THROTTLE_SIGNIN_MAX_SOURCE = int(os.getenv("AUTH_THROTTLE_SIGNIN_MAX_SOURCE", "30"))
AUTH_THROTTLE_SIGNIN_MAX_TARGET = int(os.getenv("AUTH_THROTTLE_SIGNIN_MAX_TARGET", "10"))
AUTH_THROTTLE_SIGNIN_WINDOW = int(os.getenv("AUTH_THROTTLE_SIGNIN_WINDOW", "900"))

AUTH_THROTTLE_PASSWORD_RESET_MAX_SOURCE = int(
    os.getenv("AUTH_THROTTLE_PASSWORD_RESET_MAX_SOURCE", "20")
)
AUTH_THROTTLE_PASSWORD_RESET_MAX_TARGET = int(
    os.getenv("AUTH_THROTTLE_PASSWORD_RESET_MAX_TARGET", "5")
)
AUTH_THROTTLE_PASSWORD_RESET_WINDOW = int(
    os.getenv("AUTH_THROTTLE_PASSWORD_RESET_WINDOW", "3600")
)

# 登録には宛先という概念が無い（毎回ちがうメールアドレス）ので接続元だけ。
AUTH_THROTTLE_SIGNUP_MAX_SOURCE = int(os.getenv("AUTH_THROTTLE_SIGNUP_MAX_SOURCE", "10"))
AUTH_THROTTLE_SIGNUP_MAX_TARGET = 0
AUTH_THROTTLE_SIGNUP_WINDOW = int(os.getenv("AUTH_THROTTLE_SIGNUP_WINDOW", "3600"))

REST_FRAMEWORK = {
    # セッション認証のみ。未ログインは AnonymousUser になる。
    # DRF の SessionAuthentication は POST/PATCH/DELETE で CSRF を照合する。
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
}

# --- AI プロバイダ -------------------------------------------------------
# "mock" のままでも全教材を完走できることが憲章 原則 III の要件。
#
# 既定は openai / gpt-5-nano。openai / anthropic を指定したのに鍵が無いときは、
# 黙って mock へ倒さず **はっきり失敗させる**（503 AI_SERVICE_NOT_CONFIGURED、
# apps/ai/providers/registry.py）。偽物の答えを本物として学習者に見せるほうが
# 害が大きい。鍵の有無は /health/ready でも見る。
AI_PROVIDER = os.getenv("AI_PROVIDER", "openai")
AI_MODEL = os.getenv("AI_MODEL", "gpt-5-nano")

# 鍵は必ずここで settings へ入れる。registry.py は settings しか見ない。
# 環境変数を直接読む形にすると、片方だけ入れ忘れたときに
# 「鍵を渡しているのに使えない」という、原因の分かりにくい失敗になる。
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# 1回の呼び出しの上限。長くすると待ち時間も費用も伸びる。
AI_REQUEST_TIMEOUT_SECONDS = float(os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "20"))
AI_MAX_OUTPUT_TOKENS = int(os.getenv("AI_MAX_OUTPUT_TOKENS", "600"))

# 学習者ひとりが1日に実行できる回数。0以下で「上限なし」。
# 悪用対策ではなく、ふつうに使っている人の使いすぎを止める目安。
# 登録済みの人。指定が無ければ従来の名前も見る（設定を書き換えずに移れるように）
AI_DAILY_REQUEST_LIMIT_USER = int(
    os.getenv(
        "AI_DAILY_REQUEST_LIMIT_USER",
        os.getenv("AI_DAILY_REQUEST_LIMIT_PER_USER", "50"),
    )
)
# 登録前の人。少なめにする。登録なしで無制限に使えると、
# 費用の見通しが立たないうえ、登録する理由も無くなる
AI_DAILY_REQUEST_LIMIT_GUEST = int(
    os.getenv("AI_DAILY_REQUEST_LIMIT_GUEST", "10")
)
# AI へ送ってよい本文の長さ。長いほど費用も待ち時間も増える
AI_MAX_INPUT_CHARACTERS = int(os.getenv("AI_MAX_INPUT_CHARACTERS", "5000"))

# 利用者が貼った本文を DB に保存するか。
# 既定は保存しない。会社の文章が入ってくる前提なので、
# 黙って溜め込むと要らない責任を抱えることになる。
AI_STORE_RAW_INPUT = _bool("AI_STORE_RAW_INPUT", False)

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

# 登録していない人の記録を、最後の利用から何日残すか。
# プライバシーポリシーに書いた期間と揃える（食い違えば、それは嘘になる）。
#
# Cookie の寿命は90日。それを過ぎた時点で本人からも取り出せなくなるので、
# さらに余裕を見た180日で消す。消すのは `manage.py prune_data`。
GUEST_DATA_RETENTION_DAYS = int(os.getenv("GUEST_DATA_RETENTION_DAYS", "180"))

# --- メール -------------------------------------------------------------
# 送るのは3通だけ（apps/accounts/emails.py）。
#   メールアドレスの確認 / パスワードの再設定 / 登録完了のお知らせ
#
# 開発ではコンソールへ出す。実際に送らないので、宛先を間違えても
# 誰にも届かない。本番では smtp を明示する。
EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend"
    if DEBUG
    else "django.core.mail.backends.smtp.EmailBackend",
)
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = _bool("EMAIL_USE_TLS", True)
# 587 は TLS、465 は SSL。両方 true にすると Django が起動時に止まる
EMAIL_USE_SSL = _bool("EMAIL_USE_SSL", False)
# 送れないまま待たせない。届かないなら早く分かったほうがよい
EMAIL_TIMEOUT = int(os.getenv("EMAIL_TIMEOUT", "10"))

DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "AIPPO <no-reply@localhost>")
SERVER_EMAIL = os.getenv("SERVER_EMAIL", DEFAULT_FROM_EMAIL)

#: 画面の場所。メールのリンクはここへ向く。
#: 末尾の / は付けても付けなくてもよい（apps/accounts/emails.py で落とす）。
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# --- 見張り -------------------------------------------------------------
# Sentry は任意。DSN が無ければ何も読み込まない。
# 入れていないだけで起動しない、という作りにはしない。
SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if SENTRY_DSN:
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=SENTRY_DSN,
            environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
            # 本文を送らない。学習者が書いた文章がそのまま外へ出る
            send_default_pii=False,
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0")),
        )
    except ImportError:  # pragma: no cover - 入れていない環境ではただ黙る
        pass

# --- キャッシュ -----------------------------------------------------------
# 使っているのは1か所だけ。二重送信の抑止（apps/ai/views.py）。
#
# 既定のキャッシュは**プロセスの中**にある。gunicorn を複数の worker で
# 動かすと worker ごとに別々の記憶になり、二重送信が別の worker に当たると
# 素通りする。AI をもう1回呼ぶことになり、学習者の実行回数と利用料が
# 二重に減る。だから worker をまたいで共有できる置き場を使う。
#
# REDIS_URL があればそちら。無ければ DB の表（migration で作ってある）。
# AI実行回数の上限そのものは DB のカウンタなので、ここが何であっても効く。
_redis_url = os.getenv("REDIS_URL", "")
if _redis_url:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": _redis_url,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.db.DatabaseCache",
            "LOCATION": "aippo_cache",
        }
    }

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
