# AIPPO バックエンド（Django + gunicorn）
#
# 静的ファイルは whitenoise が配信するので、Web サーバーを別に立てなくてよい。
# 前段にロードバランサを置くときは TRUST_FORWARDED_FOR=true を渡すこと
# （渡さないと、接続元単位の実行回数の上限が全員まとめて数えられてしまう）。

FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 依存だけ先に入れて、コード変更のたびに入れ直さないようにする
COPY pyproject.toml ./
RUN pip install --no-cache-dir uv && \
    uv pip install --system --no-cache .

COPY . .

# 管理画面の CSS などを集める。DEBUG=False で動かすので必須。
# ここでは本番判定を通す必要があるため、ダミーの値を渡す。
RUN DJANGO_DEBUG=false \
    DJANGO_SECRET_KEY="build-time-only-$(head -c 40 /dev/urandom | base64 | tr -d '\n')" \
    DJANGO_ALLOWED_HOSTS="localhost" \
    FRONTEND_URL="http://localhost" \
    EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend" \
    python manage.py collectstatic --noinput

# root では動かさない
RUN useradd --create-home --uid 10001 aippo && chown -R aippo /app
USER aippo

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=2).status==200 else 1)"

# AI の応答待ちが数秒あるため、タイムアウトは長めにする。
# ワーカー数は環境変数で調整できるようにしておく。
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS:-3} --threads ${GUNICORN_THREADS:-4} --timeout ${GUNICORN_TIMEOUT:-60} --access-logfile - --error-logfile -"]
