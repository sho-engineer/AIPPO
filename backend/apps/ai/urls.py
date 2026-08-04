"""AI 実行のルーティング。

`/api/v1/` の下に置く。教材が増えても入口は1つのまま。
"""

from django.urls import path

from apps.ai.views import GenerateView, ModelsView

urlpatterns = [
    path("generate/", GenerateView.as_view(), name="ai-generate"),
    # 設定画面が選択肢を組み立てるために読む。モデル名は画面に書かない
    path("models/", ModelsView.as_view(), name="ai-models"),
]
