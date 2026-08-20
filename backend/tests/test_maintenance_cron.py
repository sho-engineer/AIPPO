"""定期実行から古い記録を消す入り口。

`prune_data` は前からあったが、動かす仕組みが無かった。
プライバシーポリシーには「一定期間が過ぎたら削除します」と書いてある。
書いてあるのに動いていないなら、それは書いたことが嘘になる。

ここで見張るのは2つ。逆向きに効く2つなので、両方要る。

  1. **本当に消えること**。動かない定期実行は、無いのと同じ
  2. **決めた相手以外は消せないこと**。取り消せない操作なので、
     素通りする入り口が1つでもあれば全データが飛ぶ
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.lessons.models import LearningSession

# 16進の並びにしない（高エントロピーの秘密情報として走査に拾われる）
SECRET = "dummy-cron-secret-for-tests"

URL = "/api/v1/maintenance/prune/"


@pytest.fixture
def cron(settings):
    """合言葉が入っている状態（入り口が開いている）。"""
    settings.CRON_SECRET = SECRET
    return settings


def _old_session(age_days: int = 300) -> LearningSession:
    """`age_days` 日前に最後に触った、登録なしの記録を1つ作る。

    `updated_at` は auto_now なので、作ってから直接書き換える。
    """
    session = LearningSession.objects.create(
        learner_key=uuid.uuid4(), lesson_id="rewrite_text"
    )
    LearningSession.objects.filter(pk=session.pk).update(
        updated_at=timezone.now() - timedelta(days=age_days)
    )
    return session


def _auth(secret: str) -> dict[str, str]:
    return {"HTTP_AUTHORIZATION": f"Bearer {secret}"}


@pytest.mark.django_db
class TestTheDoorIsShutUntilWeOpenIt:
    """`CRON_SECRET` が未設定なら、入り口そのものが無いこと。

    「未設定なら素通り」にすると、合言葉を入れ忘れた配置で
    誰でも全データを消せる URL が開く。入れ忘れは必ず起きる。
    """

    def test_without_a_secret_the_endpoint_does_not_exist(self, settings, client):
        settings.CRON_SECRET = ""

        assert client.post(URL).status_code == 404

    def test_not_even_with_a_bearer_header(self, settings, client):
        """合言葉が無い側で、何かを当てて開くことはできない。"""
        settings.CRON_SECRET = ""

        assert client.post(URL, **_auth("anything")).status_code == 404

    def test_nothing_is_deleted_while_it_is_shut(self, settings, client):
        settings.CRON_SECRET = ""
        _old_session()

        client.post(URL, **_auth("anything"))

        assert LearningSession.objects.count() == 1


@pytest.mark.django_db
class TestWhoMayCall:
    def test_no_authorization_header_is_refused(self, cron, client):
        assert client.post(URL).status_code == 401

    def test_a_wrong_secret_is_refused(self, cron, client):
        assert client.post(URL, **_auth("not-the-secret")).status_code == 401

    def test_a_prefix_of_the_secret_is_refused(self, cron, client):
        """途中まで合っていても通さない。

        「長さだけ見る」「前方一致で通す」といった書き換えを、ここで止める。
        なお比較そのものは `hmac.compare_digest` で行っている
        （`==` は違いを見つけた時点で返るので、返るまでの時間から
        どこまで合っていたかが漏れる）。時間の差はテストからは
        観測できないので、ここで守れるのは**通らないこと**まで。
        """
        assert client.post(URL, **_auth(SECRET[:-1])).status_code == 401

    def test_the_secret_without_the_scheme_is_refused(self, cron, client):
        assert client.post(URL, HTTP_AUTHORIZATION=SECRET).status_code == 401

    def test_another_scheme_is_refused(self, cron, client):
        assert client.post(URL, HTTP_AUTHORIZATION=f"Basic {SECRET}").status_code == 401

    def test_a_refused_call_deletes_nothing(self, cron, client):
        """弾いたつもりで消えている、が起きないこと。"""
        _old_session()

        client.post(URL, **_auth("not-the-secret"))

        assert LearningSession.objects.count() == 1

    def test_the_right_secret_gets_in(self, cron, client):
        assert client.post(URL, **_auth(SECRET)).status_code == 200


@pytest.mark.django_db
class TestWhatItDoes:
    def test_old_guest_records_are_actually_removed(self, cron, client):
        """動かない定期実行は、無いのと同じ。"""
        _old_session()

        response = client.post(URL, **_auth(SECRET))

        assert response.status_code == 200
        assert not LearningSession.objects.exists()

    def test_recent_records_are_left_alone(self, cron, client):
        _old_session(age_days=3)

        client.post(URL, **_auth(SECRET))

        assert LearningSession.objects.count() == 1

    def test_it_reports_how_many_it_removed(self, cron, client):
        """件数を返すのは、動いていることを外から確かめるため。

        何も返さない作りだと、空振りし続けていても気づけない。
        """
        _old_session()

        body = client.post(URL, **_auth(SECRET)).json()

        assert body["status"] == "ok"
        assert body["deleted_total"] >= 1
        assert body["deleted"]["学習セッション"] == 1

    def test_it_uses_the_period_we_published(self, cron, client, settings):
        """消す期間が、ポリシーに書いた期間と同じであること。"""
        body = client.post(URL, **_auth(SECRET)).json()

        assert body["days"] == settings.GUEST_DATA_RETENTION_DAYS

    def test_vercel_cron_can_call_it(self, cron, client):
        """Vercel Cron は GET でしか叩けない。

        POST だけにすると、設定は正しいのに毎回 405 が返り、
        消えないまま誰も気づかない。合言葉は GET でも要る。
        """
        _old_session()

        response = client.get(URL, **_auth(SECRET))

        assert response.status_code == 200
        assert not LearningSession.objects.exists()

    def test_a_plain_get_without_the_secret_does_nothing(self, cron, client):
        """リンクを踏んだだけでは消えないこと。"""
        _old_session()

        assert client.get(URL).status_code == 401
        assert LearningSession.objects.count() == 1

    def test_other_methods_are_refused(self, cron, client):
        assert client.delete(URL, **_auth(SECRET)).status_code == 405

    def test_it_is_reachable_by_name(self, cron, client):
        """vercel.json に書くパスと、実際のパスが同じであること。"""
        assert reverse("maintenance-prune") == URL
