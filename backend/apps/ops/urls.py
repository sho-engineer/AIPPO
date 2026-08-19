"""運用の入り口。学習者向けの画面からは呼ばない。"""

from django.urls import path

from apps.ops.views import prune_expired_data

urlpatterns = [
    # 古いゲストデータを消す。1日1回、Vercel Cron から叩く
    path("prune/", prune_expired_data, name="maintenance-prune"),
]
