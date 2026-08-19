"""管理画面の守り。

管理画面の向こうには、実証実験で集めた**全学習者の記録**がある。
破られたときの被害が、このアプリでいちばん大きい場所。

ここで見張るのは3つ。

  1. 絞ると決めたなら、決めた接続元以外は本当に入れないこと
  2. **絞ると決めていないなら、何も変わらないこと**
     （既定で締め出すと、設定を知らない人の手元で管理画面が消える）
  3. 接続元の判定が詐称で抜けられないこと
     （X-Forwarded-For を無条件に信じると、ヘッダ1つで守りが消える）
"""

from __future__ import annotations

import importlib
import os
from unittest import mock

import pytest
from django.urls import clear_url_caches, reverse

ADMIN = "/admin/"


@pytest.fixture
def restricted(settings):
    """この接続元だけ入れる、という状態にする。"""
    settings.ADMIN_ALLOWED_IPS = ["203.0.113.10"]
    return settings


@pytest.mark.django_db
class TestWhenNobodyDecidedToRestrict:
    """未設定なら今までどおり。手元の開発を壊さない。"""

    def test_the_admin_still_opens(self, settings, client):
        settings.ADMIN_ALLOWED_IPS = []

        # 未ログインなのでログイン画面へ飛ぶ。404 でなければ「ある」
        assert client.get(ADMIN, REMOTE_ADDR="198.51.100.99").status_code != 404

    def test_a_signed_in_admin_reaches_the_index(self, settings, client, django_user_model):
        settings.ADMIN_ALLOWED_IPS = []
        user = django_user_model.objects.create_superuser(
            "admin@example.com", "admin@example.com", "admin-pass-9xyz"
        )
        client.force_login(user)

        assert client.get(reverse("admin:index")).status_code == 200


@pytest.mark.django_db
class TestWhenTheAllowlistIsSet:
    def test_an_allowed_address_still_gets_through(self, restricted, client):
        assert client.get(ADMIN, REMOTE_ADDR="203.0.113.10").status_code != 404

    def test_everyone_else_is_told_there_is_nothing_here(self, restricted, client):
        assert client.get(ADMIN, REMOTE_ADDR="198.51.100.99").status_code == 404

    def test_a_signed_in_admin_from_elsewhere_is_still_shut_out(
        self, restricted, client, django_user_model
    ):
        """合言葉を知っていても、場所が違えば入れないこと。

        これが効かないなら、漏れた合言葉に対して何の守りにもならない。
        """
        user = django_user_model.objects.create_superuser(
            "admin@example.com", "admin@example.com", "admin-pass-9xyz"
        )
        client.force_login(user)

        response = client.get(ADMIN, REMOTE_ADDR="198.51.100.99")

        assert response.status_code == 404

    def test_it_does_not_say_that_the_admin_is_here(self, restricted, client):
        """403 ではなく 404。

        403 は「ここに管理画面はあるが入れない」と教えることになり、
        場所を変える意味が消える。
        """
        response = client.get(ADMIN, REMOTE_ADDR="198.51.100.99")

        assert response.status_code != 403

    def test_dropping_the_trailing_slash_does_not_slip_past(self, restricted, client):
        """`/admin` でも弾くこと。

        末尾の / だけを見ていると、1文字削るだけで抜けられる。
        """
        assert client.get("/admin", REMOTE_ADDR="198.51.100.99").status_code == 404

    def test_a_deeper_admin_page_is_blocked_too(self, restricted, client):
        response = client.get("/admin/login/", REMOTE_ADDR="198.51.100.99")

        assert response.status_code == 404

    def test_the_learners_side_is_untouched(self, restricted, client):
        """学習者は関係ない。ここを巻き込むとサービスが止まる。"""
        response = client.get(reverse("health-live"), REMOTE_ADDR="198.51.100.99")

        assert response.status_code == 200


@pytest.mark.django_db
class TestWhoWeThinkIsCalling:
    """接続元の判定。ここが甘いと、絞った意味が無くなる。"""

    def test_a_forged_header_is_ignored_when_we_are_not_behind_a_proxy(
        self, restricted, client
    ):
        """X-Forwarded-For は誰でも書ける。

        前段にロードバランサが居ないのに信じると、
        ヘッダを1行足すだけで守りが消える。
        """
        restricted.TRUST_FORWARDED_FOR = False

        response = client.get(
            ADMIN, REMOTE_ADDR="198.51.100.99", HTTP_X_FORWARDED_FOR="203.0.113.10"
        )

        assert response.status_code == 404

    def test_behind_a_proxy_the_forwarded_address_is_the_one_that_counts(
        self, restricted, client
    ):
        """ロードバランサ配下では REMOTE_ADDR はそのバランサになる。

        そこを見ていると、誰が来ても同じ接続元に見えて絞れない。
        """
        restricted.TRUST_FORWARDED_FOR = True

        response = client.get(
            ADMIN, REMOTE_ADDR="10.0.0.1", HTTP_X_FORWARDED_FOR="203.0.113.10"
        )

        assert response.status_code != 404

    def test_behind_a_proxy_an_unlisted_address_is_still_blocked(self, restricted, client):
        restricted.TRUST_FORWARDED_FOR = True

        response = client.get(
            ADMIN, REMOTE_ADDR="10.0.0.1", HTTP_X_FORWARDED_FOR="198.51.100.99"
        )

        assert response.status_code == 404


def _reload_settings(**env):
    """環境変数を差し替えて config.settings を読み直す。"""
    with mock.patch.dict(os.environ, env, clear=False):
        module = importlib.import_module("config.settings")
        return importlib.reload(module)


@pytest.fixture
def _restore_settings():
    yield
    import config.settings

    importlib.reload(config.settings)


@pytest.mark.usefixtures("_restore_settings")
class TestWhereTheAdminLives:
    def test_the_default_is_unchanged(self):
        """既定は `admin/` のまま。後方互換を壊さない。"""
        settings = _reload_settings(DJANGO_ADMIN_PATH="")
        assert settings.ADMIN_PATH == "admin/"

    def test_a_new_path_is_taken_as_given(self):
        settings = _reload_settings(DJANGO_ADMIN_PATH="ura-guchi/")
        assert settings.ADMIN_PATH == "ura-guchi/"

    @pytest.mark.parametrize("written", ["/ura-guchi/", "ura-guchi", "/ura-guchi", "  ura-guchi  "])
    def test_however_it_is_written_it_means_the_same_place(self, written):
        """先頭・末尾の / の有無で結果が変わらないこと。

        揃えないと「設定したのに 404」という、原因の見えない失敗になる。
        """
        assert _reload_settings(DJANGO_ADMIN_PATH=written).ADMIN_PATH == "ura-guchi/"


@pytest.mark.django_db
class TestMovingTheAdminActuallyMovesIt:
    """設定を変えたら、本当にそこへ出ること。

    設定だけあって urls.py が `admin/` を直書きしていると、
    「場所を変えたつもり」で元の場所に出たままになる。
    """

    @pytest.fixture
    def moved(self, settings):
        import config.urls

        settings.ADMIN_PATH = "ura-guchi/"
        importlib.reload(config.urls)
        clear_url_caches()
        yield
        settings.ADMIN_PATH = "admin/"
        importlib.reload(config.urls)
        clear_url_caches()

    def test_the_admin_answers_at_the_new_path(self, moved, client):
        assert client.get("/ura-guchi/").status_code != 404

    def test_the_old_path_is_gone(self, moved, client):
        assert client.get(ADMIN).status_code == 404

    def test_the_allowlist_follows_the_new_path(self, moved, settings, client):
        """場所を変えても、接続元の絞りが付いてくること。

        ミドルウェアが `/admin/` を直書きしていると、
        場所を変えた瞬間に絞りだけが外れる（誰でも開けてしまう）。
        """
        settings.ADMIN_ALLOWED_IPS = ["203.0.113.10"]

        blocked = client.get("/ura-guchi/", REMOTE_ADDR="198.51.100.99")
        allowed = client.get("/ura-guchi/", REMOTE_ADDR="203.0.113.10")

        assert blocked.status_code == 404
        assert allowed.status_code != 404
