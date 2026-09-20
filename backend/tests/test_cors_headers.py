"""別オリジンの画面から、要求が実際に通ること。

なぜこの検査が要るか
--------------------
画面が足すヘッダを、サーバーが**読んでいるのに通していなかった**。
`X-AIPPO-Timezone` は画面が毎回付け（`frontend/src/api/http.ts`）、
`apps/lessons/services/localtime.py` が読む。ところが許可の一覧
（django-cors-headers の既定）に自前のヘッダは入らないので、
**事前確認の時点でブラウザが全部止めていた**——教材も、AIも、
学習の記録も、1つも届かない。

どこにも出ていなかった理由
--------------------------
本番（Vercel）は画面とAPIが同じオリジンなので、事前確認そのものが
起きない。壊れていたのは**別の番号で動かす場所だけ**——CI と、手元の
開発。CI では「AIに届かなかった」画面が出て通しの検査が落ちていたが、
落ち方が「完走できない」だったので、原因がヘッダだと分かるまでに
時間がかかった。

だから、ここでは**ヘッダの一覧を目で確かめる**のではなく、
事前確認に本物のヘッダ名を渡して、返ってきた許可に入っているかを見る。
一覧の作り方を変えても、この検査は同じことを見つける。
"""

import pytest
from django.test import Client

#: 画面が足すヘッダ。`frontend/src/api/http.ts` の `TIMEZONE_HEADER`。
BROWSER_HEADER = "x-aippo-timezone"

ORIGIN = "http://127.0.0.1:5173"


def _preflight(path: str, headers: str) -> object:
    return Client().options(
        path,
        HTTP_ORIGIN=ORIGIN,
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS=headers,
    )


@pytest.mark.django_db
@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/ai/generate/",
        "/api/v1/catalog/",
        "/api/learning-events/",
    ],
)
def test_the_browser_header_passes_preflight(path: str) -> None:
    res = _preflight(path, f"content-type,x-csrftoken,{BROWSER_HEADER}")

    assert res.status_code == 200
    allowed = {
        name.strip().lower()
        for name in res.headers.get("access-control-allow-headers", "").split(",")
    }
    assert BROWSER_HEADER in allowed, (
        f"{path} の事前確認が {BROWSER_HEADER} を許していない。"
        "ブラウザはここで要求そのものを止めるので、画面には"
        "「届きませんでした」しか出ない"
    )


@pytest.mark.django_db
def test_the_default_headers_are_kept() -> None:
    """自前のヘッダを足すときに、既定の一覧を置き換えてしまわないこと。

    置き換えると `content-type` や `x-csrftoken` を自分で並べることに
    なり、ライブラリが1つ増やした日に静かに欠ける。
    """
    res = _preflight("/api/v1/ai/generate/", f"content-type,x-csrftoken,{BROWSER_HEADER}")

    allowed = {
        name.strip().lower()
        for name in res.headers.get("access-control-allow-headers", "").split(",")
    }
    assert {"content-type", "x-csrftoken"} <= allowed
