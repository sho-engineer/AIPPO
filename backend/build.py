"""Vercel のビルド時に collectstatic だけ走らせる。

Dockerfile の collectstatic ステップと同じ考え方：本番設定の検証
（settings.py の check --deploy 相当）に必要な値を、ビルド時だけの
ダミー値で満たしてから collectstatic を実行する。

migrate はここでは実行しない。プレビュー環境も本番と同じ DATABASE_URL を
向いている構成のことが多く、デプロイのたびに（プレビューも含めて）勝手に
migrate が走ると事故る。migrate は手元や CI から明示的に実行すること。
"""

import os
import subprocess
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
os.environ.setdefault("DJANGO_DEBUG", "false")
os.environ.setdefault(
    "DJANGO_SECRET_KEY", "build-time-only-" + os.urandom(24).hex()
)
os.environ.setdefault("DJANGO_ALLOWED_HOSTS", "localhost")
os.environ.setdefault("FRONTEND_URL", "http://localhost")
os.environ.setdefault(
    "EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)


def main() -> None:
    subprocess.check_call([sys.executable, "manage.py", "collectstatic", "--noinput"])


if __name__ == "__main__":
    main()
