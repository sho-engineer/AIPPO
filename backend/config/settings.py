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

# Vercel は配置ごとに違うホスト名を割り当てる。プレビュー（PRごとの使い捨て）
# の名前は事前に分からないので、DJANGO_ALLOWED_HOSTS には書けない。
# VERCEL_URL は「いま自分が配られているホスト名」を Vercel 自身が入れる値
# （利用者の要求から来る値ではない）なので、そのまま足してよい。
# 無ければ何も起きないため、Vercel 以外の環境には影響しない。
_vercel_host = os.getenv("VERCEL_URL", "").strip()
if _vercel_host and _vercel_host not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(_vercel_host)

# メールの送り口。
#
# 開発ではコンソールへ出す。実際に送らないので、宛先を間違えても
# 誰にも届かない。**本番では既定が smtp になる**ので、下の関門で
# 宛先サーバーまで揃っているかを見る。
#
# 定義がこの位置にあるのは、その関門より前に決まっている必要があるため。
# 環境変数のほうを見に行くと、指定しなかったときに関門を素通りする。
# 空文字は「指定なし」として扱う。`.env` に `EMAIL_BACKEND=` と行だけ
# 残っている状態はよくあり、そのまま渡すと読み込めない送り口になる。
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND") or (
    "django.core.mail.backends.console.EmailBackend"
    if DEBUG
    else "django.core.mail.backends.smtp.EmailBackend"
)

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
    # 「あとで直す」が効かない種類の抜けなので、起動時に止める。
    #
    # 見るのは**実際に使われる送り口**。環境変数のほうを見ると、
    # 指定しなかったときに素通りする。本番の既定は smtp なので、
    # 素通りしたまま起動し、`/health/ready` だけが 503 を返し続ける
    # ——つまり振り分けが永久に付かない状態になる。
    if EMAIL_BACKEND.endswith("smtp.EmailBackend"):
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
    "apps.rewards",
    # 運用まわり（管理画面の締め出しと、触った記録）
    "apps.ops",
    "apps.profiles",
    "apps.tutor",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    # 管理画面を、決めた接続元からしか開けなくする。
    #
    # CommonMiddleware より**前**に置くこと。あとに置くと、
    # `/admin`（末尾の / 無し）を弾いたときに CommonMiddleware が
    # その 404 を拾って `/admin/` への 301 に変えてしまう。
    # 「そこに何かある」と教えることになり、隠した意味が消える。
    #
    # セッションを読むより前でもある。締め出す相手のために
    # DB からセッションを引く理由は無い。
    "apps.ops.middleware.AdminIpAllowlistMiddleware",
    "django.middleware.common.CommonMiddleware",
    # 以下3つは管理画面に必要（学習者向けAPIでは使わない）
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    # 管理画面で学習者の記録に触れたことを残す。
    #
    # AuthenticationMiddleware より**後ろ**。誰が見たかを取るため。
    # AdminIpAllowlistMiddleware より後ろでもある——先に置くと、
    # 締め出した相手の 404 まで「見た」として残ってしまう。
    "apps.ops.middleware.AdminAuditMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    # X_FRAME_OPTIONS はこのミドルウェアが無いと効かない
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # ログインから一定の期間が過ぎたら切る。
    # AuthenticationMiddleware より**あと**に置くこと（request.user を見る）
    "apps.accounts.session.AbsoluteSessionTimeoutMiddleware",
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
        }
    }

# SQLite の守りは、**どちらの経路で決まっても**付ける。
#
# `DATABASE_URL=sqlite:///...` で指す書き方は珍しくないが、
# dj_database_url はここの OPTIONS を知らないので、素の設定を返す。
# 上の分岐の中だけに書いていると、その経路のときに黙って外れる。
#
# 外れると、書き込みが重なった瞬間に「database is locked」で落ちる。
# 普段は1人で触るので気づかず、人が増えたときだけ再現する。
if DATABASES["default"]["ENGINE"].endswith("sqlite3"):
    options = DATABASES["default"].setdefault("OPTIONS", {})
    # 読み書きを並行できるようにし、ぶつかっても少し待つ
    options.setdefault(
        "init_command", "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;"
    )
    options.setdefault("timeout", 20)
    # テストも実ファイルで動かす。メモリ上のDBでは WAL が効かず、
    # 同時アクセスの検証が本番と違う結果になってしまう。
    DATABASES["default"].setdefault("TEST", {"NAME": BASE_DIR / "test_db.sqlite3"})

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


# --- 管理画面の守り -------------------------------------------------------
# 管理画面に入られると、実証実験で集めた**全学習者の記録**が見える。
# 合言葉ひとつしか間に無い状態で `/admin/` に置いておくのは危うい。
# 守りは2枚。どちらも環境変数で入れる（手元の開発は今までどおり動く）。
#
#   1. 場所を変える（DJANGO_ADMIN_PATH）
#      総当たりは `/admin/` を狙う。場所が違えば、そもそも見つからない。
#      これは鍵ではなく「人目に付かない所へ置く」だけなので、2と併せて使う。
#   2. 入れる接続元を絞る（DJANGO_ADMIN_ALLOWED_IPS）
#      管理画面を開くのは運用する数人だけ。合言葉が漏れても、
#      そこからでなければ入り口に届かない。
def _admin_path(raw: str) -> str:
    """`path()` に渡せる形へ整える。

    先頭の / を付けて書く人も、末尾の / を忘れる人もいる。
    どちらで書かれても同じ場所になるように、ここで揃えてしまう。
    揃えないと「設定したのに 404」という、原因の見えない失敗になる。
    空なら既定へ戻す（消し忘れの空行で管理画面が消えないように）。
    """
    cleaned = raw.strip().strip("/")
    return f"{cleaned}/" if cleaned else "admin/"


#: 既定は `admin/` のまま。変えなければ今までと同じ場所に出る。
ADMIN_PATH = _admin_path(os.getenv("DJANGO_ADMIN_PATH", "admin/"))

#: 管理画面に入れる接続元。**空なら制限しない**。
#: 既定を「制限あり」にすると、設定を知らない人の手元で管理画面が
#: いきなり消える。締め出すのは、締め出すと決めたときだけにする。
ADMIN_ALLOWED_IPS = _list("DJANGO_ADMIN_ALLOWED_IPS")

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
# 期限は2つある。どちらか早いほうでログアウトになる。
#
#   1. 触らないまま何日でログアウトするか（SESSION_COOKIE_AGE）
#   2. ログインした日から何日でログアウトするか（SESSION_ABSOLUTE_MAX_AGE）
#
# 1 だけだと、要求のたびに期限が先へ延びる（SESSION_SAVE_EVERY_REQUEST）ので、
# 開き続けている人は**いつまでもログインしたまま**になる。
# 端末を手放したあとや、こちらの都合で切りたい場面のために 2 を置く。
#
# 30日。毎日開くものではないので、短くするとログインし直しばかりになる。
SESSION_COOKIE_AGE = int(os.getenv("SESSION_COOKIE_AGE", str(60 * 60 * 24 * 30)))
SESSION_SAVE_EVERY_REQUEST = True
# 90日。学習は数か月かけて続くものなので、途中で切られると
# やる気を削ぐ。かといって無期限にはしない。
# 0 以下にすると上限そのものを外せる（勧めない）。
SESSION_ABSOLUTE_MAX_AGE = int(
    os.getenv("SESSION_ABSOLUTE_MAX_AGE", str(60 * 60 * 24 * 90))
)
# 画面と API が別ホストのとき、POST の送り元として明示が要る。
CSRF_TRUSTED_ORIGINS = _list("CSRF_TRUSTED_ORIGINS", ",".join(CORS_ALLOWED_ORIGINS))

# --- 外部サービスでのログイン -------------------------------------------
# 鍵が入っている先だけ、画面にボタンが出る。入っていなければ出ない。
# 押すと落ちるボタンは、無いより悪い。
#
# 向こうの管理画面には、戻り先として次を登録する。
#   <BACKEND_URL>/api/v1/accounts/social/google/callback/
#   <BACKEND_URL>/api/v1/accounts/social/line/callback/
#
# BACKEND_URL が空のときは、要求から組み立てる（手元ではそれで足りる）。
# ロードバランサ配下では、組み立てた先が実際の公開先とずれることが
# あるので、本番では入れておく。
BACKEND_URL = os.getenv("BACKEND_URL", "")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

# LINE のメールは、申請が通っている場合だけ返る。
# 通っていなくてもログインはできる（メールの無いアカウントになる）。
LINE_CLIENT_ID = os.getenv("LINE_CLIENT_ID", "")
LINE_CLIENT_SECRET = os.getenv("LINE_CLIENT_SECRET", "")

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

# 続けて送るまでの間隔（秒）。0で間隔なし。
#
# 上の窓ごとの回数とは別の軸。窓の数えは「1時間に5回」のような総量を
# 押さえるが、**続いた2回のあいだ**は押さえない。窓が切り替わる瞬間を
# またげば、続けて2通送れてしまう。
#
# 再設定の案内は他人の受信箱へ届くので、総量とは別に間隔も要る。
# 画面側も残り秒数を出して押せなくするが（要件 P0-5）、そちらは
# 手元でいくらでも外せるので、**数えるのはここ**。
AUTH_COOLDOWN_PASSWORD_RESET = int(os.getenv("AUTH_COOLDOWN_PASSWORD_RESET", "60"))

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
# 既定は gemini / gemini-2.5-flash（費用と無料枠の都合。開発・MVP向け）。
# openai は引き続き使える（本番の比較・切り替え先として残す。消さない）。
# anthropic も同様。いずれかを指定したのに鍵が無いときは、
# 黙って mock へ倒さず **はっきり失敗させる**（503 AI_SERVICE_NOT_CONFIGURED、
# apps/ai/providers/registry.py）。偽物の答えを本物として学習者に見せるほうが
# 害が大きい。鍵の有無は /health/ready でも見る。
#
# 本番でユーザーの入力（仕事の文章・機密情報・個人情報を含みうる）を
# 扱う場合は、Gemini の Free Tier 前提で運用しないこと。Paid Tier
# （ユーザー入力を学習利用しない契約条件）の鍵を使う。このファイルは
# 鍵がどちらの契約かを検知できないので、デプロイ設定側で必ず守る
# （docs/ai-tutor-design.md 参照）。
AI_PROVIDER = os.getenv("AI_PROVIDER", "gemini")
AI_MODEL = os.getenv("AI_MODEL", "gpt-5-nano")
AI_MODEL_GEMINI = os.getenv("AI_MODEL_GEMINI", "gemini-2.5-flash")

# 鍵は必ずここで settings へ入れる。registry.py は settings しか見ない。
# 環境変数を直接読む形にすると、片方だけ入れ忘れたときに
# 「鍵を渡しているのに使えない」という、原因の分かりにくい失敗になる。
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# 1回の呼び出しの上限。長くすると待ち時間も費用も伸びる。
AI_REQUEST_TIMEOUT_SECONDS = float(os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "20"))
AI_MAX_OUTPUT_TOKENS = int(os.getenv("AI_MAX_OUTPUT_TOKENS", "600"))
# 教材の短い文章処理では深い推論より応答速度を優先する。
# GPT-5 系は未指定だと medium になり、画面の20秒上限を超えやすい。
AI_REASONING_EFFORT = os.getenv("AI_REASONING_EFFORT", "minimal")


# 課題の重さ（model_tier）→ どのモデルへ送るか（apps/ai/routing.py）。
#
# 教材データにモデル名を書かないための対応表。モデルを乗り換えるときは、
# ここだけを直す（教材は1件も触らない）。
#
# **provider を空にしておくこと。** 空なら、呼ばれた時点の AI_PROVIDER を
# 見る（apps/ai/routing.py）。ここに AI_PROVIDER の値を書き込むと、
# **読み込んだ瞬間の値で固まる**。あとから AI_PROVIDER を変えても
# こちらは古いままなので、
#
#     AI_PROVIDER=openai なのに鍵が無い
#       → ここに焼き付いた mock へ流れる
#       → 偽の答えが、本物のAIの答えとして利用者に出る
#
# という、いちばん起こしてはいけない失敗になる（実際に一度やった。
# tests/test_ai_errors.py の TestNotConfigured が捕まえた）。
#
# model も空なら、そのプロバイダの既定モデル（AI_MODEL / AI_MODEL_GEMINI）。
AI_MODEL_TIERS: dict[str, dict] = {
    # 要約・書き直し・分類など。無料コースの中心はここ
    "basic": {},
    "standard": {},
    # より難しい課題。いまは同じ先だが、段階として先に分けておく
    "advanced": {},
    "image_standard": {},
    "image_high": {},
    # モデル比較コース用。利用者にモデル名を見せる教材だけが使う。
    # ここだけは、行き先そのものが教えたい中身なので名指しする
    "comparison_openai": {"provider": "openai"},
    "comparison_anthropic": {"provider": "anthropic"},
}


def _ai_price(name: str) -> float | None:
    """USD / 1,000トークン。未設定なら None（「0円」と区別する）。"""
    raw = os.getenv(name, "")
    return float(raw) if raw else None


# AI利用料の概算（apps/ai/pricing.py）。プロバイダ単位のみ（モデル単位ではない）。
# 実際の契約単価を運用側が入れる。入れていないプロバイダは概算を出さない
# （推測の数字を利用料として見せない）。
AI_PRICE_PER_1K_TOKENS: dict[str, tuple[float | None, float | None]] = {
    "gemini": (
        _ai_price("AI_PRICE_GEMINI_INPUT_PER_1K"),
        _ai_price("AI_PRICE_GEMINI_OUTPUT_PER_1K"),
    ),
    "openai": (
        _ai_price("AI_PRICE_OPENAI_INPUT_PER_1K"),
        _ai_price("AI_PRICE_OPENAI_OUTPUT_PER_1K"),
    ),
    "anthropic": (
        _ai_price("AI_PRICE_ANTHROPIC_INPUT_PER_1K"),
        _ai_price("AI_PRICE_ANTHROPIC_OUTPUT_PER_1K"),
    ),
}

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

# 登録していない人の鍵が、何秒で切れるか。
#
# 以前は90日だった。長く持たせれば、登録しない人も数か月ぶんの続きを
# 保てる——という考え方だった。いまは**7日**にしている。
#
# 登録なしで使えるのは変えない。変えたのは「登録なしのまま、いつまでも
# 残せる」ところ。残すこと（目印・プロンプト帳・修了証）は登録した人の
# ものにして、ゲストはその場で試すためのものにする。
# 鍵が90日残っていると、その線引きが Cookie 側だけ緩いままになる。
#
# 7日にした理由。1本10分の教材を「今日1本、来週もう1本」という間隔で
# 続ける人が、続きから始められる長さ。1日にすると、週末に始めて
# 平日の夜に戻ってきた人が、毎回1本目からになる。
LEARNER_KEY_MAX_AGE = 60 * 60 * 24 * 7  # 7日

# 登録していない人の記録を、最後の利用から何日残すか。
# プライバシーポリシーに書いた期間と揃える（食い違えば、それは嘘になる）。
#
# Cookie の寿命は7日。それを過ぎた時点で**本人からも取り出せない**記録に
# なるので、そこから長く持っても、持っているのはこちらの都合だけになる。
# 余裕を見て30日で消す。消すのは `manage.py prune_data`。
GUEST_DATA_RETENTION_DAYS = int(os.getenv("GUEST_DATA_RETENTION_DAYS", "30"))

# 操作記録（誰が誰の記録に触れたか）を何日残すか。
#
# 学習データより**長く**取る。触られたことに気づくのは、たいてい
# ずっとあとになる。ゲストの学習データと同じ30日で消すと、問い合わせが
# 来た時点で、調べるための記録がもう無い、ということが起きる。
#
# ただし永久には持たない。中身は入れていないが、接続元は個人に
# 結びつきうるし、管理画面を開くたびに1行増える。1年で切る。
AUDIT_LOG_RETENTION_DAYS = int(os.getenv("AUDIT_LOG_RETENTION_DAYS", "365"))

# 定期実行（Vercel Cron）から `prune_data` を叩くための合言葉。
#
# **空のあいだ、その入り口は 404 のまま存在しない**（apps/ops/views.py）。
# 逆にすると、合言葉を入れ忘れた配置で「誰でも消せる入り口」が開く。
# 消す操作は取り消せないので、開いていないほうへ倒す。
#
# Vercel は CRON_SECRET を入れておくと、Cron からの要求に
# `Authorization: Bearer <CRON_SECRET>` を自分で付けてくれる。
# 名前を合わせてあるのはそのため。
CRON_SECRET = os.getenv("CRON_SECRET", "")

# --- メール -------------------------------------------------------------
# 送るのは3通だけ（apps/accounts/emails.py）。
#   メールアドレスの確認 / パスワードの再設定 / 登録完了のお知らせ
#
# 送り口（EMAIL_BACKEND）は、起動時の関門より前で決めている（冒頭を参照）。
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

# --- パスキー（WebAuthn）------------------------------------------------
# 合言葉を覚えなくてよくする仕組み。詳しくは apps/accounts/passkeys.py。
#
# 署名にはドメインが混ざる。だから偽サイトで作らせた署名は、本物の
# ドメインでは通らない。ここを取り違えると、その守りが丸ごと外れる。
#
# 既定は FRONTEND_URL から取る。画面が置いてある場所と、パスキーを
# 使う場所は同じなので、別々に書かせると必ずどちらかが古くなる。
#
#   PASSKEY_RP_ID   … ドメイン（ポートを含めない）。例 aippo.vercel.app
#   PASSKEY_ORIGINS … 署名を受け付ける送り元。scheme とポートまで含む
#
# 手元では http://localhost:5173 のような値になる。パスキーは
# localhost だけ HTTP でも使える（それ以外は HTTPS が要る）。
def _origin_host(url: str) -> str:
    from urllib.parse import urlparse

    return (urlparse(url).hostname or "").strip()


PASSKEY_RP_NAME = os.getenv("PASSKEY_RP_NAME", "AIPPO")
PASSKEY_RP_ID = os.getenv("PASSKEY_RP_ID", "") or _origin_host(FRONTEND_URL)
# 画面が複数のURLから開かれることがある（localhost と 127.0.0.1 など）。
# 指定が無ければ、画面のURLと CORS で許した先をそのまま受け付ける。
PASSKEY_ORIGINS = _list("PASSKEY_ORIGINS") or list(
    # 重複は落とすが、並びは保つ（先頭が本来の画面のURL）
    dict.fromkeys(origin for origin in [FRONTEND_URL, *CORS_ALLOWED_ORIGINS] if origin)
)

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
