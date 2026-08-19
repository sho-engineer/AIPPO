from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"
    verbose_name = "アカウント"

    def ready(self) -> None:
        # ログインした時刻を控える。ログインの上限を数える起点になる
        # （apps/accounts/session.py）。
        from apps.accounts import session

        session.connect()
