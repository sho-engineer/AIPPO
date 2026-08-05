"""管理画面の各ページが開くこと。

クローズドベータの問い合わせは、だいたいこの3つになる。

    「進み具合が消えた」    → その人にどの端末が結びついているか
    「ログインできない」    → 試行回数の上限に当たっていないか
    「確認メールが来ない」  → メールの確認が済んでいるか

登録されていないと、そのたびにサーバーへ入って shell を叩くことになる。
問い合わせのたびに本番の DB へ直接触るのは、事故が起きるほうへ倒れる。

実際 accounts の3つが登録漏れで 404 だった。管理画面は普段の開発で
開かないので、壊れていても気づかない。ここで機械に開かせる。
"""

from __future__ import annotations

import pytest
from django.contrib import admin
from django.urls import reverse


@pytest.fixture
def staff(django_user_model, client):
    user = django_user_model.objects.create_superuser(
        "admin@example.com", "admin@example.com", "admin-pass-9xyz"
    )
    client.force_login(user)
    return user


@pytest.mark.django_db
class TestEveryRegisteredPageOpens:
    def test_the_index_opens(self, staff, client):
        assert client.get(reverse("admin:index")).status_code == 200

    def test_every_model_list_opens(self, staff, client):
        """登録した分だけ、一覧が開くこと。

        `list_display` に打ち間違いがあると、開いた瞬間に 500 になる。
        書いた本人は開かずに次へ行くので、気づくのは運用の最中になる。
        """
        broken = []
        for model, _ in admin.site._registry.items():
            meta = model._meta
            url = reverse(f"admin:{meta.app_label}_{meta.model_name}_changelist")
            response = client.get(url)
            if response.status_code != 200:
                broken.append(f"{meta.app_label}.{meta.model_name} -> {response.status_code}")

        assert not broken, "一覧が開かない: " + ", ".join(broken)


@pytest.mark.django_db
class TestTheOnesSupportNeeds:
    """問い合わせの調べ先が、ちゃんと登録されていること。"""

    @pytest.mark.parametrize(
        "app_label,model_name",
        [
            ("accounts", "userprofile"),
            ("accounts", "learneridentity"),
            ("accounts", "auththrottle"),
            ("catalog", "course"),
            ("catalog", "lesson"),
            ("lessons", "learningsession"),
            ("lessons", "learningevent"),
            ("profiles", "learnerprofile"),
        ],
    )
    def test_it_is_reachable(self, staff, client, app_label, model_name):
        url = reverse(f"admin:{app_label}_{model_name}_changelist")

        assert client.get(url).status_code == 200


@pytest.mark.django_db
class TestWhatCannotBeDoneByHand:
    """手で作れてはいけないもの。

    learner_key と人の結びつきを手で足せると、他人の記録を
    別の人へ付け替えられる。試行回数も、手で足す場面が無い。
    """

    def test_identities_cannot_be_added(self, staff, client):
        url = reverse("admin:accounts_learneridentity_add")

        assert client.get(url).status_code == 403

    def test_throttle_rows_cannot_be_added(self, staff, client):
        url = reverse("admin:accounts_auththrottle_add")

        assert client.get(url).status_code == 403
