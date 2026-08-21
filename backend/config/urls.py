from django.conf import settings
from django.contrib import admin
from django.urls import include, path

from apps.health.views import healthz, live, ready, readyz
from apps.lessons.views import LearningEventView, ProgressView

urlpatterns = [
    # 登録・ログイン。合言葉は Cookie に置き、画面へは渡さない
    path("api/v1/accounts/", include("apps.accounts.urls")),
    # 教材そのもの。管理画面で直したものが、ここから画面へ届く
    path("api/v1/catalog/", include("apps.catalog.urls")),
    # 教材から AI を呼ぶ唯一の入口。レッスンが増えてもここは1つ
    path("api/v1/ai/", include("apps.ai.urls")),
    path("api/tutor/", include("apps.tutor.urls")),
    path("api/lessons/", include("apps.lessons.urls")),
    # どこまで来たか。端末をまたいで同じ数が出るように、サーバーが数える
    path("api/v1/progress/", ProgressView.as_view(), name="progress"),
    # 学習パス・スタンプ・Credit。特典の判定はすべてサーバー側で行う
    path("api/v1/rewards/", include("apps.rewards.urls")),
    # AI活用診断の回答。誰が来たかを実証実験で見るために要る
    path("api/profile/", include("apps.profiles.urls")),
    # AIPPO 開発概要 §13 の指定どおり、操作ログはトップレベルに置く
    path("api/learning-events/", LearningEventView.as_view(), name="learning-events"),
    # 死活監視。再起動すべきか／振り分けを外すべきかで分けてある
    # （apps/health/views.py 参照）
    path("health/live", live, name="health-live"),
    path("health/ready", ready, name="health-ready"),
    # 旧名。監視の設定を一度に書き換えられないので、しばらく残す
    path("healthz", healthz, name="healthz"),
    path("readyz", readyz, name="readyz"),
    # 定期実行（Vercel Cron）から叩く運用の入り口。
    # CRON_SECRET が空のあいだは 404（apps/ops/views.py）
    path("api/v1/maintenance/", include("apps.ops.urls")),
    # 実証実験で集めたデータを見るための管理画面。
    #
    # 場所は変えられる（DJANGO_ADMIN_PATH、既定は admin/）。
    # 総当たりは `/admin/` を狙うので、変えるだけで届かなくなる。
    # ただしこれは鍵ではないので、DJANGO_ADMIN_ALLOWED_IPS と
    # 併せて使うこと（apps/ops/middleware.py）
    path(settings.ADMIN_PATH, admin.site.urls),
]
