"""運用の入り口。学習者向けの画面からは呼ばない。"""

from django.urls import path

from apps.ops.views import prune_expired_data, send_study_reminders

urlpatterns = [
    # 古いゲストデータを消す。1日1回、Vercel Cron から叩く
    path("prune/", prune_expired_data, name="maintenance-prune"),
    # しばらく開いていない人へ、続きの知らせを送る。1日1回
    path("reminders/", send_study_reminders, name="maintenance-reminders"),
]
