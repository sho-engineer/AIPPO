"""ログインが、いつまでも続かないこと。

期限は2つある。どちらか早いほうで切れる。

  SESSION_COOKIE_AGE        … 触らないまま何秒でログアウトするか（Django の仕事）
  SESSION_ABSOLUTE_MAX_AGE  … ログインから何秒でログアウトするか（こちらの仕事）

2つ目が要る理由は `apps/accounts/session.py` に書いた。要点は、
このアプリが `SESSION_SAVE_EVERY_REQUEST = True` なので、
1つ目だけでは**開き続けている人がいつまでもログインしたまま**になること。

ここで見るのは、上限が本当に効くこと。効かないと、端末を手放したあとも
ログイン状態が残り続ける。
"""

from __future__ import annotations

import time

import pytest

from apps.accounts.session import STARTED_AT_KEY

SIGNUP_URL = "/api/v1/accounts/signup/"
SIGNIN_URL = "/api/v1/accounts/signin/"
ME_URL = "/api/v1/accounts/me/"

EMAIL = "session@example.com"
PASSWORD = "aippo-strong-pass-9"


def _signup(client):
    return client.post(
        SIGNUP_URL,
        {
            "email": EMAIL,
            "password": PASSWORD,
            "accept_terms": True,
            "accept_privacy": True,
        },
        content_type="application/json",
    )


def _authenticated(client) -> bool:
    return client.get(ME_URL).json()["authenticated"]


def _rewind(client, seconds: float) -> None:
    """ログインした時刻を、指定の秒数だけ過去へ動かす。

    実際に待つわけにはいかないので、控えてある起点をずらす。
    ずらすのはセッションの中身だけで、期限の判定そのものは触らない。
    """
    session = client.session
    session[STARTED_AT_KEY] = time.time() - seconds
    session.save()


@pytest.mark.django_db
class TestAbsoluteLimit:
    def test_the_login_time_is_recorded(self, client):
        _signup(client)

        assert client.session[STARTED_AT_KEY] == pytest.approx(time.time(), abs=10)

    def test_a_fresh_login_stays_signed_in(self, client, settings):
        settings.SESSION_ABSOLUTE_MAX_AGE = 60 * 60 * 24 * 90
        _signup(client)

        assert _authenticated(client)

    def test_signing_in_again_restarts_the_clock(self, client, settings):
        """ログインし直せば、そこから数え直すこと。

        起点が古いまま残ると、入り直した直後に切れる。
        """
        settings.SESSION_ABSOLUTE_MAX_AGE = 100
        _signup(client)
        _rewind(client, 200)
        assert not _authenticated(client)

        client.post(
            SIGNIN_URL,
            {"email": EMAIL, "password": PASSWORD},
            content_type="application/json",
        )

        assert _authenticated(client)

    def test_an_old_login_is_signed_out(self, client, settings):
        settings.SESSION_ABSOLUTE_MAX_AGE = 100
        _signup(client)
        assert _authenticated(client)

        _rewind(client, 101)

        assert not _authenticated(client)

    def test_it_stays_signed_out_afterwards(self, client, settings):
        """一度切れたら、そのあとも切れたままであること。

        セッションを消しているので、次の要求で復活してはいけない。
        """
        settings.SESSION_ABSOLUTE_MAX_AGE = 100
        _signup(client)
        _rewind(client, 101)

        assert not _authenticated(client)
        assert not _authenticated(client)

    def test_activity_does_not_push_the_limit_back(self, client, settings):
        """触っても上限は延びないこと。

        ここが延びると、SESSION_COOKIE_AGE と同じものになってしまい、
        上限を置いた意味が無くなる。
        """
        settings.SESSION_ABSOLUTE_MAX_AGE = 100
        _signup(client)

        # 何度か触る。SESSION_SAVE_EVERY_REQUEST で「最後に触った時刻」は延びる
        for _ in range(3):
            assert _authenticated(client)

        _rewind(client, 101)

        assert not _authenticated(client)

    def test_the_limit_can_be_turned_off(self, client, settings):
        settings.SESSION_ABSOLUTE_MAX_AGE = 0
        _signup(client)
        _rewind(client, 60 * 60 * 24 * 365 * 10)

        assert _authenticated(client)


@pytest.mark.django_db
class TestOlderSessions:
    def test_a_session_without_a_start_time_is_not_thrown_out(self, client, settings):
        """起点が入っていないセッションを、いきなり切らないこと。

        この仕組みを入れる前からログインしていた人がここへ来る。
        切ってしまうと、更新した瞬間に全員がログアウトする。
        """
        settings.SESSION_ABSOLUTE_MAX_AGE = 100
        _signup(client)

        session = client.session
        del session[STARTED_AT_KEY]
        session.save()

        assert _authenticated(client)

    def test_the_start_time_is_filled_in_from_now(self, client, settings):
        settings.SESSION_ABSOLUTE_MAX_AGE = 100
        _signup(client)
        session = client.session
        del session[STARTED_AT_KEY]
        session.save()

        _authenticated(client)

        # 控え直されているので、ここから100秒後には切れる
        assert client.session[STARTED_AT_KEY] == pytest.approx(time.time(), abs=10)

    def test_a_broken_start_time_is_replaced(self, client, settings):
        settings.SESSION_ABSOLUTE_MAX_AGE = 100
        _signup(client)
        session = client.session
        session[STARTED_AT_KEY] = "こわれた値"
        session.save()

        assert _authenticated(client)
        assert isinstance(client.session[STARTED_AT_KEY], float)


@pytest.mark.django_db
class TestGuestsAreUntouched:
    def test_a_visitor_who_never_signed_in_is_unaffected(self, client, settings):
        """ログインしていない人には何もしないこと。

        登録せずに学べるのがこのアプリの前提なので、
        ここで余計な書き込みをすると、全員ぶんのセッションが生まれる。
        """
        settings.SESSION_ABSOLUTE_MAX_AGE = 100

        assert not _authenticated(client)
        assert STARTED_AT_KEY not in client.session


@pytest.mark.django_db
class TestSettings:
    def test_both_limits_have_sensible_defaults(self, settings):
        """既定値そのものを見張る。

        どちらかを 0 や極端な値にすると、期限が実質無くなる。
        """
        # 触らないまま切れるのは30日
        assert settings.SESSION_COOKIE_AGE == 60 * 60 * 24 * 30
        # ログインからの上限は90日
        assert settings.SESSION_ABSOLUTE_MAX_AGE == 60 * 60 * 24 * 90
        # 上限は「触らないまま」より長いこと。逆だと短いほうが常に勝ち、
        # 2つ置いた意味が無くなる
        assert settings.SESSION_ABSOLUTE_MAX_AGE > settings.SESSION_COOKIE_AGE
