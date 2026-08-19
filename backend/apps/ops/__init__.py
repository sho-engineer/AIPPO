"""運用のための仕組み。学習者からは見えない。

- `middleware.py` … 管理画面を、決めた接続元からしか開けなくする
- `views.py`      … 定期実行（Vercel Cron）から古い記録を消す入り口

models を持たないので `INSTALLED_APPS` には入れない（apps/health と同じ）。
"""
