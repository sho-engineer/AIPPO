"""誰が、いつ、誰の記録に触れたか。

管理画面の向こうには、実証実験で集めた全学習者の記録がある。
接続元は絞ってあり、合言葉も要る。だが**入ったあとに何をしたかは、
どこにも残っていなかった**。

Django の `LogEntry` は追加・変更・削除しか残さない。
**見ただけ**が抜けている。このアプリで一番起きてほしくないのは
書き換えではなく、運用する人が学習者の記録を意味もなく読んでいくこと。

ここで守るのは5つ。

  1. 見ただけでも残ること
  2. 教材を見ただけでは残らないこと（全部残すと肝心の1件が埋もれる）
  3. **中身を残さないこと**（監査の記録が2つ目の個人情報の山にならない）
  4. 消した操作が残ること。しかも消す**前**に
  5. 記録を残せなくても、元の操作は通ること
"""

from __future__ import annotations

import uuid

import pytest
from django.utils import timezone

from apps.accounts.models import LearnerIdentity, UserProfile
from apps.lessons.models import Attempt, AttemptStatus, LearningSession
from apps.ops.models import AuditAction, AuditLog

ADMIN_PREFIX = "/admin"
DELETE_DATA_URL = "/api/v1/accounts/learning-data/delete/"
DELETE_ACCOUNT_URL = "/api/v1/accounts/delete/"


@pytest.fixture
def staff(django_user_model):
    """管理画面に入れる人。"""
    return django_user_model.objects.create_superuser(
        username="operator", email="op@example.com", password="aippo-strong-pass-9"
    )


@pytest.fixture
def learner(django_user_model):
    """記録を持っている学習者。"""
    user = django_user_model.objects.create_user(
        username="learner@example.com",
        email="learner@example.com",
        password="aippo-strong-pass-9",
    )
    UserProfile.objects.create(user=user, email_verified_at=timezone.now())
    key = uuid.uuid4()
    LearnerIdentity.objects.create(user=user, learner_key=key)
    LearningSession.objects.create(learner_key=key, lesson_id="rewrite_text")
    return user, key


@pytest.mark.django_db
class TestLookingIsRecorded:
    def test_opening_the_list_is_recorded(self, client, staff):
        """一覧を開いただけでも残る。"""
        client.force_login(staff)

        client.get(f"{ADMIN_PREFIX}/lessons/attempt/")

        log = AuditLog.objects.filter(action=AuditAction.ADMIN_VIEW).first()
        assert log is not None
        assert log.actor == "operator"
        assert log.target_model == "lessons.attempt"
        assert log.detail["scope"] == "list"

    def test_opening_one_record_says_which(self, client, staff, learner):
        """1件を開いたときは、どれを開いたかまで残る。

        一覧を眺めたのと、特定の人を開いたのとでは重みが違う。
        """
        _, key = learner
        session = LearningSession.objects.filter(learner_key=key).first()
        client.force_login(staff)

        client.get(f"{ADMIN_PREFIX}/lessons/learningsession/{session.id}/change/")

        log = AuditLog.objects.filter(target_model="lessons.learningsession").first()
        assert log is not None
        assert log.target_id == str(session.id)
        assert log.detail["scope"] == "object"

    def test_the_catalog_is_not_recorded(self, client, staff):
        """教材を見ても残らない。

        教材は誰のものでもないので、見られて困るものではない。
        全部を対象にすると、教材を直すたびに記録が増えて、
        肝心の1件が埋もれる。
        """
        client.force_login(staff)

        client.get(f"{ADMIN_PREFIX}/catalog/lesson/")

        assert AuditLog.objects.count() == 0

    def test_a_blocked_request_is_not_recorded_as_a_view(self, client, staff, settings):
        """締め出した相手の 404 を「見た」として残さない。

        接続元で弾く側（AdminIpAllowlistMiddleware）がこの記録より
        **外側**にあるので、弾かれた要求はそもそもここへ届かない。
        並び順が入れ替わると、見えていない相手が「見た」として残る。
        """
        settings.ADMIN_ALLOWED_IPS = ["203.0.113.9"]
        client.force_login(staff)

        client.get(f"{ADMIN_PREFIX}/lessons/attempt/")

        assert AuditLog.objects.count() == 0

    def test_a_refused_request_is_not_recorded_as_a_view(self, client, django_user_model):
        """権限が無くて見られなかったものを「見た」として残さない。

        こちらは記録の側まで届く（接続元は許されている）ので、
        応答の結果を見て落とすしかない。残すと、実際には一度も
        開けていない人が閲覧者として並ぶ。
        """
        weak = django_user_model.objects.create_user(
            username="weak", email="weak@example.com",
            password="aippo-strong-pass-9", is_staff=True,
        )
        client.force_login(weak)

        response = client.get(f"{ADMIN_PREFIX}/lessons/attempt/")

        assert response.status_code >= 300
        assert AuditLog.objects.count() == 0

    def test_signed_out_visits_are_not_recorded(self, client):
        """ログイン画面など、誰が来たか分からないものは残さない。"""
        client.get(f"{ADMIN_PREFIX}/lessons/attempt/")

        assert AuditLog.objects.count() == 0


@pytest.mark.django_db
class TestItDoesNotBecomeASecondPileOfData:
    def test_the_contents_are_not_copied_into_the_log(self, client, staff, learner):
        """**中身を残さない。**

        監査のための記録が、それ自体2つ目の個人情報の山になっては
        本末転倒になる。誰の記録を開いたかまでにする。
        """
        _, key = learner
        secret = "取引先の電話番号は 090-0000-0000 です"
        session = LearningSession.objects.filter(learner_key=key).first()
        Attempt.objects.create(
            session=session,
            sequence=1,
            lesson_id="rewrite_text",
            step="ai_generate",
            user_input=secret,
            generated_output=secret,
            status=AttemptStatus.SUCCEEDED,
        )
        client.force_login(staff)

        client.get(f"{ADMIN_PREFIX}/lessons/attempt/")

        for log in AuditLog.objects.all():
            blob = f"{log.detail} {log.target_id} {log.target_model} {log.actor}"
            assert "090-0000-0000" not in blob
            assert secret not in blob

    def test_no_email_address_is_stored(self, client, staff, learner):
        """メールアドレスも入れない。

        誰かを指すときは、それ単体では意味を持たない値にする。
        """
        client.force_login(staff)
        client.get(f"{ADMIN_PREFIX}/accounts/userprofile/")

        for log in AuditLog.objects.all():
            assert "@" not in f"{log.detail}{log.target_id}"


@pytest.mark.django_db
class TestDeletionsAreRecorded:
    def test_deleting_learning_data_is_recorded(self, client, learner):
        """「本当に消えたのか」とあとから聞かれて、答えられること。"""
        user, _ = learner
        client.force_login(user)

        client.post(DELETE_DATA_URL, content_type="application/json")

        assert AuditLog.objects.filter(action=AuditAction.SELF_DATA_DELETE).exists()

    def test_deleting_the_account_is_recorded_before_it_goes(self, client, learner):
        """消す**前**に残すこと。

        消したあとでは user.pk が無くなり、「誰のアカウントが消えたか」を
        書けなくなる。ここは順番そのものが仕様になる。
        """
        user, _ = learner
        user_id = str(user.pk)
        client.force_login(user)

        client.post(DELETE_ACCOUNT_URL, content_type="application/json")

        log = AuditLog.objects.filter(action=AuditAction.SELF_ACCOUNT_DELETE).first()
        assert log is not None
        assert log.target_id == user_id

    def test_the_log_outlives_the_user(self, client, learner, django_user_model):
        """利用者を消しても、消した記録は残ること。

        外部キーにすると、一番残したい1件が道連れで消える。
        """
        user, _ = learner
        client.force_login(user)
        client.post(DELETE_ACCOUNT_URL, content_type="application/json")

        assert not django_user_model.objects.filter(pk=user.pk).exists()
        assert AuditLog.objects.filter(action=AuditAction.SELF_ACCOUNT_DELETE).exists()


@pytest.mark.django_db
class TestItNeverBreaksTheRealAction:
    def test_a_failing_recorder_does_not_block_deletion(self, client, learner, monkeypatch):
        """記録に失敗しても、元の操作は通る。

        逆にすると、監査のために足した仕組みが、アカウント削除を
        落とす原因になる。消せないほうが利用者にとって重い。
        """
        def boom(*args, **kwargs):
            raise RuntimeError("記録先が落ちている")

        monkeypatch.setattr(AuditLog.objects, "create", boom)

        user, _ = learner
        client.force_login(user)

        response = client.post(DELETE_ACCOUNT_URL, content_type="application/json")

        assert response.status_code == 200

    def test_a_failing_recorder_does_not_break_the_admin(self, client, staff, monkeypatch):
        def boom(*args, **kwargs):
            raise RuntimeError("記録先が落ちている")

        monkeypatch.setattr(AuditLog.objects, "create", boom)
        client.force_login(staff)

        response = client.get(f"{ADMIN_PREFIX}/lessons/attempt/")

        assert response.status_code == 200


@pytest.mark.django_db
class TestTheLogCannotBeTamperedWith:
    def test_the_admin_offers_no_way_to_change_or_delete(self, staff):
        """触った記録を触った人が消せるなら、記録が無いのと変わらない。"""
        from django.contrib import admin as django_admin

        registered = django_admin.site._registry[AuditLog]

        assert registered.has_add_permission(None) is False
        assert registered.has_change_permission(None) is False
        assert registered.has_delete_permission(None) is False

    def test_deleting_through_the_admin_is_refused(self, client, staff):
        """管理画面から消そうとしても通らないこと。"""
        client.force_login(staff)
        AuditLog.objects.create(action=AuditAction.ADMIN_VIEW, actor="someone")
        log = AuditLog.objects.first()

        response = client.post(f"{ADMIN_PREFIX}/ops/auditlog/{log.id}/delete/")

        assert response.status_code in {403, 404}
        assert AuditLog.objects.filter(pk=log.pk).exists()


@pytest.mark.django_db
class TestRetention:
    def test_old_logs_are_pruned(self, settings):
        """操作記録も、いつかは消す。

        中身は入れていないが、接続元は個人に結びつきうるし、
        管理画面を開くたびに1行増える。永久には持たない。
        """
        from datetime import timedelta

        from apps.lessons.management.commands.prune_data import prune

        settings.AUDIT_LOG_RETENTION_DAYS = 365
        old = AuditLog.objects.create(action=AuditAction.ADMIN_VIEW, actor="operator")
        # auto_now_add を後から押し戻す
        AuditLog.objects.filter(pk=old.pk).update(
            at=timezone.now() - timedelta(days=400)
        )
        fresh = AuditLog.objects.create(action=AuditAction.ADMIN_VIEW, actor="operator")

        prune(timezone.now() - timedelta(days=180))

        assert not AuditLog.objects.filter(pk=old.pk).exists()
        assert AuditLog.objects.filter(pk=fresh.pk).exists()

    def test_it_keeps_logs_longer_than_learner_data(self, settings):
        """学習データより長く取ること。

        触られたことに気づくのはたいていずっとあとになる。同じ物差しで
        切ると、問い合わせが来た時点で調べるための記録がもう無い。
        """
        assert settings.AUDIT_LOG_RETENTION_DAYS > settings.GUEST_DATA_RETENTION_DAYS
