"""キャッシュ表を作り忘れたときに、何が起きるか。

配置手順には `migrate` がキャッシュ表（`aippo_cache`）も作ると書いてあり、
「忘れるとAI実行のたびに落ちる」と添えてあった。**それが本当かを確かめる。**

落ちるなら、忘れてもすぐ気づける。落ちないなら、二重送信の防止だけが
静かに効かなくなり、誰も気づけない。手順書の書き方が変わる。
"""

from __future__ import annotations

import pytest

URL = "/api/v1/ai/generate/"

REWRITE_INPUT = {
    "original_text": "先日の件ですが、諸事情ございまして、追ってご連絡差し上げます。",
    "audience": "社外のお客様",
    "tone": "ていねいに",
    "length": "3行くらい",
}


@pytest.fixture(autouse=True)
def _use_mock(settings):
    settings.AI_PROVIDER = "mock"


@pytest.fixture
def no_cache_table(settings):
    """キャッシュ表が無い状態。作り忘れた配置を再現する。"""
    settings.CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.db.DatabaseCache",
            "LOCATION": "table_that_does_not_exist",
        }
    }


def _post(api_client, **overrides):
    body = {
        "lesson_id": "rewrite_text",
        "step_id": "generate_result",
        "action": "rewrite",
        "input": REWRITE_INPUT,
    }
    body.update(overrides)
    return api_client.post(URL, body, format="json")


@pytest.mark.django_db
class TestWhatActuallyHappens:
    def test_ai_still_works_without_the_cache_table(self, api_client, no_cache_table):
        """落ちない。

        キャッシュの読み書きは try で囲まれていて、失敗しても素通りする
        （`apps/ai/views.py`）。止めるほうへ倒すと、キャッシュが一時的に
        落ちただけで学習が進まなくなるので、この判断自体は正しい。

        だが「忘れると落ちる」という説明は事実と違う。
        落ちないなら、忘れたことに誰も気づけない。
        """
        response = _post(api_client)

        assert response.status_code == 200

    def test_duplicate_protection_silently_stops_working(self, api_client, no_cache_table):
        """代わりに、二重送信の防止だけが静かに効かなくなる。

        同じ内容を続けて送っても、2回目が弾かれない＝AIを2回呼ぶ。
        本物のAIに切り替えたあとは、これがそのまま費用になる。
        """
        first = _post(api_client)
        second = _post(api_client)

        assert first.status_code == 200
        # 表があれば 2回目は重複として扱われる。無いと素通りする
        assert second.status_code == 200

    def test_with_the_table_the_duplicate_is_caught(self, api_client):
        """表があるときは、ちゃんと弾かれること。

        これが通らないと、上のテストは「もともと弾いていない」だけになり、
        キャッシュ表の有無を確かめたことにならない。
        """
        first = _post(api_client)
        second = _post(api_client)

        assert first.status_code == 200
        assert second.status_code == 409
