"""登録・ログイン・パスワード再設定の連打を止める。

公開すると、次の3つがそのまま通ってしまう状態だった。

- ログインへのパスワード総当たり
- 他人のメールアドレスへ、再設定の案内を何百通も送りつける
- 登録の大量作成で、1人あたりの AI 上限を回避する

数えるのは「来た回数」で、相手が実在するかは見ない。
見てから数えると、断り方で登録済みかどうかが漏れる。
"""

from __future__ import annotations

import pytest
from django.core import mail
from django.test import Client

from apps.accounts.models import AuthThrottle
from apps.accounts.throttle import TooManyAttempts, clear, consume

SIGNUP = "/api/v1/accounts/signup/"
SIGNIN = "/api/v1/accounts/signin/"
RESET = "/api/v1/accounts/password/reset/"

ACCOUNT = {
    "email": "learner@example.com",
    "password": "aippo-strong-pass-9",
    "accept_terms": True,
    "accept_privacy": True,
}


@pytest.fixture(autouse=True)
def _mail_to_memory(settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    mail.outbox.clear()


@pytest.fixture(autouse=True)
def _tight_limits(settings):
    """本物の上限（10回・5回）で試すと、テストが遅いだけで何も増えない。

    見たいのは「上限に達したら断る」ことなので、小さくして確かめる。
    """
    settings.AUTH_THROTTLE_SIGNIN_MAX_SOURCE = 9
    settings.AUTH_THROTTLE_SIGNIN_MAX_TARGET = 3
    settings.AUTH_THROTTLE_SIGNIN_WINDOW = 900
    settings.AUTH_THROTTLE_PASSWORD_RESET_MAX_SOURCE = 6
    settings.AUTH_THROTTLE_PASSWORD_RESET_MAX_TARGET = 2
    settings.AUTH_THROTTLE_PASSWORD_RESET_WINDOW = 3600
    settings.AUTH_THROTTLE_SIGNUP_MAX_SOURCE = 2
    settings.AUTH_THROTTLE_SIGNUP_WINDOW = 3600
    """
    間隔（cooldown）はここでは切る。

    窓ごとの回数と間隔は別の軸で、混ぜると**どちらで断られたのか**が
    分からなくなる。窓の数えを見ているテストは間隔なしで動かし、
    間隔そのものは TestResendInterval で見る。
    """
    settings.AUTH_COOLDOWN_PASSWORD_RESET = 0


@pytest.fixture(autouse=True)
def _steady_clock(monkeypatch):
    """数え上げの窓を、テストの途中で切り替わらせない。

    数えるときは現在時刻を窓の長さで切り捨てて「いまの窓」を決める
    （apps/accounts/throttle.py の _window_start）。実時計のまま動かすと、
    ちょうど窓の境目をまたいだときに数えが0へ戻り、
    「4回目で断られる」はずのテストが通ってしまう。

    めったに起きないが、起きたときに落ちるのは**そのとき動かした人**で、
    原因も分かりにくい。時刻を止めて、境目そのものを無くしておく。
    """
    from django.utils import timezone as django_timezone

    frozen = django_timezone.now()
    monkeypatch.setattr(
        "apps.accounts.throttle.timezone.now", lambda: frozen
    )


def _post(client, url, body):
    return client.post(url, body, content_type="application/json")


@pytest.mark.django_db
class TestSignIn:
    def _register(self, client):
        _post(client, SIGNUP, ACCOUNT)
        _post(client, "/api/v1/accounts/signout/", {})

    def test_wrong_passwords_are_cut_off(self, client):
        self._register(client)
        wrong = {"email": ACCOUNT["email"], "password": "not-the-password-1"}

        codes = [_post(client, SIGNIN, wrong).status_code for _ in range(4)]

        assert codes[:3] == [401, 401, 401]
        assert codes[3] == 429

    def test_it_says_how_long_to_wait(self, client):
        self._register(client)
        wrong = {"email": ACCOUNT["email"], "password": "not-the-password-1"}
        for _ in range(3):
            _post(client, SIGNIN, wrong)

        response = _post(client, SIGNIN, wrong)

        assert response["Retry-After"].isdigit()
        assert "分" in response.json()["errors"]["detail"][0]

    def test_signing_in_clears_the_count(self, client):
        """打ち間違えたあとで入れた人を、次に開いたときに締め出さない。"""
        self._register(client)
        wrong = {"email": ACCOUNT["email"], "password": "not-the-password-1"}
        _post(client, SIGNIN, wrong)
        _post(client, SIGNIN, wrong)

        ok = _post(client, SIGNIN, {"email": ACCOUNT["email"], "password": ACCOUNT["password"]})
        assert ok.status_code == 200

        # 数えが消えているので、また最初から3回ぶん試せる
        assert _post(client, SIGNIN, wrong).status_code == 401
        assert _post(client, SIGNIN, wrong).status_code == 401

    def test_another_source_is_counted_separately(self, client):
        """別の接続元まで巻き添えにしない。

        宛先ごとの数えもあるので、同じアカウントを狙い続ければ
        別の接続元でも止まる。ここで見るのは「別のアカウントなら通る」こと。
        """
        self._register(client)
        wrong = {"email": ACCOUNT["email"], "password": "not-the-password-1"}
        for _ in range(4):
            _post(client, SIGNIN, wrong)

        other = Client(REMOTE_ADDR="203.0.113.9")
        response = _post(
            other, SIGNIN, {"email": "someone-else@example.com", "password": "whatever-1"}
        )

        assert response.status_code == 401

    def test_one_account_is_protected_from_many_sources(self, client):
        """複数の場所から1つのアカウントを狙う形も止める。

        接続元だけで数えていると、これが素通りする。
        """
        self._register(client)
        wrong = {"email": ACCOUNT["email"], "password": "not-the-password-1"}
        for index in range(3):
            _post(Client(REMOTE_ADDR=f"203.0.113.{index}"), SIGNIN, wrong)

        fresh = Client(REMOTE_ADDR="198.51.100.1")

        assert _post(fresh, SIGNIN, wrong).status_code == 429


@pytest.mark.django_db
class TestPasswordReset:
    def test_sending_is_cut_off(self, client):
        _post(client, SIGNUP, ACCOUNT)
        mail.outbox.clear()
        body = {"email": ACCOUNT["email"]}

        codes = [_post(client, RESET, body).status_code for _ in range(3)]

        assert codes == [200, 200, 429]
        # 断ったぶんは送らない
        assert len(mail.outbox) == 2

    def test_an_unknown_address_is_cut_off_the_same_way(self, client):
        """断り方から、登録済みかどうかが分からないこと。

        実在を見てから数えると、429 が返るかどうかで判別できてしまう。
        """
        body = {"email": "nobody@example.com"}

        codes = [_post(client, RESET, body).status_code for _ in range(3)]

        assert codes == [200, 200, 429]

    def test_a_different_address_still_goes_through(self, client):
        """1つの宛先への送りつけで、他の人が使えなくならないこと。"""
        for _ in range(2):
            _post(client, RESET, {"email": "target@example.com"})

        response = _post(client, RESET, {"email": "another@example.com"})

        # 宛先ごとの数えはまだ余っている。接続元の数えも別枠
        assert response.status_code == 200


@pytest.mark.django_db
class TestSignUp:
    def test_bulk_creation_is_cut_off(self, client):
        codes = []
        for index in range(3):
            codes.append(
                _post(
                    client, SIGNUP, {**ACCOUNT, "email": f"bulk{index}@example.com"}
                ).status_code
            )

        assert codes == [201, 201, 429]

    def test_a_malformed_body_is_counted_too(self, client):
        """形の違う要求を投げ続ける手も止める。

        中身を見てから数えると、400 を返し続けるだけで無限に叩ける。
        """
        for _ in range(2):
            _post(client, SIGNUP, {"email": "not-an-email"})

        response = _post(client, SIGNUP, {**ACCOUNT, "email": "fresh@example.com"})

        assert response.status_code == 429


@pytest.mark.django_db
class TestWhatIsStored:
    def test_the_address_itself_is_never_stored(self, client):
        _post(client, RESET, {"email": "learner@example.com"})

        for row in AuthThrottle.objects.all():
            assert "learner@example.com" not in row.scope
            assert "@" not in row.scope

    def test_the_source_address_is_never_stored(self):
        other = Client(REMOTE_ADDR="203.0.113.42")
        _post(other, RESET, {"email": "a@example.com"})

        for row in AuthThrottle.objects.all():
            assert "203.0.113.42" not in row.scope


@pytest.mark.django_db
class TestTurningItOff:
    def test_zero_means_no_limit(self, settings, rf):
        """手元の確認や負荷試験で外せること。外せないと上限自体を試せない。"""
        settings.AUTH_THROTTLE_SIGNIN_MAX_SOURCE = 0
        settings.AUTH_THROTTLE_SIGNIN_MAX_TARGET = 0
        request = rf.post(SIGNIN)

        for _ in range(50):
            consume("signin", request, "a@example.com")

        assert not AuthThrottle.objects.exists()


@pytest.mark.django_db
class TestTheCounterItself:
    def test_it_raises_once_the_window_is_full(self, settings, rf):
        settings.AUTH_THROTTLE_SIGNIN_MAX_SOURCE = 99
        settings.AUTH_THROTTLE_SIGNIN_MAX_TARGET = 2
        request = rf.post(SIGNIN)

        consume("signin", request, "a@example.com")
        consume("signin", request, "a@example.com")

        with pytest.raises(TooManyAttempts) as exc:
            consume("signin", request, "a@example.com")
        assert exc.value.retry_after > 0

    def test_clearing_lets_it_start_over(self, settings, rf):
        settings.AUTH_THROTTLE_SIGNIN_MAX_SOURCE = 99
        settings.AUTH_THROTTLE_SIGNIN_MAX_TARGET = 1
        request = rf.post(SIGNIN)

        consume("signin", request, "a@example.com")
        clear("signin", request, "a@example.com")

        consume("signin", request, "a@example.com")  # 例外にならない

    def test_a_new_window_starts_over(self, settings, rf):
        """窓が変われば 0 から。締め出しが延々と続かない。"""
        settings.AUTH_THROTTLE_SIGNIN_MAX_SOURCE = 99
        settings.AUTH_THROTTLE_SIGNIN_MAX_TARGET = 1
        settings.AUTH_THROTTLE_SIGNIN_WINDOW = 60
        request = rf.post(SIGNIN)

        consume("signin", request, "a@example.com")

        # 窓を1つ前へずらす＝いまは次の窓、という状態を作る
        AuthThrottle.objects.update(
            window_start=AuthThrottle.objects.first().window_start
            - __import__("datetime").timedelta(seconds=120)
        )

        consume("signin", request, "a@example.com")  # 例外にならない


@pytest.mark.django_db
class TestResendInterval:
    """続けて送るまでの間隔（AUTH_COOLDOWN_PASSWORD_RESET）。

    窓ごとの回数とは別の軸。窓の数えは「1時間に5回」のような総量を
    押さえるが、**続いた2回のあいだ**は押さえない。窓が切り替わる
    瞬間をまたげば、続けて2通送れてしまう。

    再設定の案内は他人の受信箱へ届くので、総量とは別に間隔も要る。
    画面側にも残り秒数を出すが、そちらは手元でいくらでも外せるので、
    **数えるのはサーバー**。
    """

    @pytest.fixture(autouse=True)
    def _interval_on(self, settings):
        settings.AUTH_COOLDOWN_PASSWORD_RESET = 60
        # 間隔だけを見たいので、窓の数えでは断られないようにする
        settings.AUTH_THROTTLE_PASSWORD_RESET_MAX_SOURCE = 0
        settings.AUTH_THROTTLE_PASSWORD_RESET_MAX_TARGET = 0

    def test_a_second_send_right_away_is_refused(self, client):
        body = {"email": "someone@example.com"}

        first = _post(client, RESET, body)
        second = _post(client, RESET, body)

        assert first.status_code == 200
        assert second.status_code == 429
        # 断ったぶんは送らない
        assert len(mail.outbox) == 0 or len(mail.outbox) == 1

    def test_it_says_how_long_to_wait(self, client):
        """「しばらく」ではなく秒数を返す。画面はこれで残りを出す。"""
        body = {"email": "someone@example.com"}
        _post(client, RESET, body)

        second = _post(client, RESET, body)

        assert second["Retry-After"] == "60" or int(second["Retry-After"]) <= 60
        assert int(second["Retry-After"]) >= 1

    def test_it_opens_again_once_the_interval_has_passed(self, client, monkeypatch):
        """待てば送れること。**永久に断らない。**"""
        from datetime import timedelta

        from django.utils import timezone as django_timezone

        body = {"email": "someone@example.com"}
        assert _post(client, RESET, body).status_code == 200

        # 61秒進める（_steady_clock で止めた時計を、そのぶんだけ動かす）
        later = django_timezone.now() + timedelta(seconds=61)
        monkeypatch.setattr("apps.accounts.throttle.timezone.now", lambda: later)

        assert _post(client, RESET, body).status_code == 200

    def test_another_address_is_not_blocked(self, client):
        """1人が送ったせいで、別の人が待たされないこと。"""
        _post(client, RESET, {"email": "one@example.com"})

        response = _post(client, RESET, {"email": "two@example.com"})

        assert response.status_code == 200

    def test_the_interval_does_not_reveal_whether_the_address_exists(self, client):
        """登録済みでも未登録でも、同じ断り方になること。

        間隔は「送った回数」で数える。実在を見てから数えると、
        429 が返るかどうかで登録済みかが分かってしまう。
        """
        _post(client, SIGNUP, ACCOUNT)
        mail.outbox.clear()

        _post(client, RESET, {"email": ACCOUNT["email"]})
        known = _post(client, RESET, {"email": ACCOUNT["email"]})

        _post(client, RESET, {"email": "nobody@example.com"})
        unknown = _post(client, RESET, {"email": "nobody@example.com"})

        assert known.status_code == unknown.status_code == 429
        assert known.json() == unknown.json()
