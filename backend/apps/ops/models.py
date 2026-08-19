"""誰が、いつ、誰の記録に触れたか。

管理画面の向こうには、実証実験で集めた**全学習者の記録**がある。
接続元は絞ってあり（`middleware.AdminIpAllowlistMiddleware`）、
合言葉も要る。だが**入ったあとに何をしたかは、どこにも残っていなかった**。

Django の `LogEntry` では足りない理由
------------------------------------
`django.contrib.admin` は追加・変更・削除を記録する。だが
**見ただけ**は記録しない。このアプリで一番起きてほしくないのは
書き換えではなく、運用する人が学習者の入力や記録を意味もなく
読んでいくこと。そこがまるごと抜けている。

「消しました」と言えるようにする
--------------------------------
プライバシーポリシーには、記録を消すと書いてある。消したことを
あとから示せるのは、消した本人の記憶か、この記録だけになる。
利用者から「本当に消えたのか」と聞かれたときに、
答えられないのは答えとして弱い。

この記録自体が漏れないようにする
--------------------------------
**中身は書かない。** 誰の記録を見たかまでは残すが、そこに
何が書いてあったかは残さない。監査のための記録が、
それ自体2つ目の個人情報の山になっては本末転倒になる。

同じ理由で、メールアドレスも本文も入れない。誰かを指すときは
`user_id` のような、それ単体では意味を持たない値にする。

消せないようにする
------------------
管理画面からは読むだけにする（`admin.py`）。触った記録を
触った人が消せるなら、記録が無いのと変わらない。
"""

from __future__ import annotations

import uuid

from django.db import models


class AuditAction(models.TextChoices):
    """残す出来事。

    増やすときは「あとから聞かれて答えられないと困ること」だけにする。
    全部残すと量に埋もれて、肝心の1件が見つからなくなる。
    """

    #: 管理画面で、学習者の記録を一覧・詳細で開いた
    ADMIN_VIEW = "admin_view", "管理画面で閲覧"
    #: 管理画面で書き換えた
    ADMIN_CHANGE = "admin_change", "管理画面で変更"
    #: 管理画面で消した
    ADMIN_DELETE = "admin_delete", "管理画面で削除"
    #: 本人が学習の記録を消した
    SELF_DATA_DELETE = "self_data_delete", "本人が学習データを削除"
    #: 本人がアカウントを消した
    SELF_ACCOUNT_DELETE = "self_account_delete", "本人がアカウントを削除"
    #: 定期実行で古いデータを消した
    RETENTION_PRUNE = "retention_prune", "保存期間切れの削除"


class AuditLog(models.Model):
    """触った記録を1件。

    消せない・書き換えられないことに意味があるので、
    あとから直す口（`save` での更新）は用意しない。
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    at = models.DateTimeField(auto_now_add=True, db_index=True)

    action = models.CharField(max_length=32, choices=AuditAction.choices, db_index=True)

    #: 誰が。運用する人なら管理画面のログイン名、本人の操作なら "self"、
    #: 定期実行なら "system"。
    #:
    #: 外部キーにしない。利用者を消したときに、消した記録まで
    #: 一緒に消えてしまう（それは一番残したい1件になる）。
    actor = models.CharField(max_length=150, blank=True)

    #: 何に対して。"lessons.Attempt" のような表の名前。
    target_model = models.CharField(max_length=100, blank=True)

    #: どれか。1件を開いたときだけ入る。一覧は空。
    target_id = models.CharField(max_length=100, blank=True)

    #: どこから。締め出しの調査に要る。
    ip = models.GenericIPAddressField(null=True, blank=True)

    #: 補足。**中身は入れない**（何件だったか、どの経路か、程度）。
    detail = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-at"]
        indexes = [
            models.Index(fields=["actor", "at"]),
            models.Index(fields=["target_model", "at"]),
        ]
        verbose_name = "操作記録"
        verbose_name_plural = "操作記録"

    def __str__(self) -> str:
        who = self.actor or "(不明)"
        what = self.target_model or "-"
        return f"{self.at:%Y-%m-%d %H:%M} {who} {self.action} {what}"
