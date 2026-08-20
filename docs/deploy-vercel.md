# デプロイ手順（Vercel Services、1プロジェクトに画面とAPIを同居させる）

リポジトリ直下の `vercel.json` で、`frontend/` と `backend/` を
2つの「サービス」として定義してある。Vercel は両方をまとめて1つの
プロジェクトとしてデプロイし、URL のパスで振り分ける。

```
https://<プロジェクト>.vercel.app
  ├── /api/*      ──▶  backend サービス（Django、Vercel Function）
  ├── /admin/*    ──▶  backend
  ├── /static/*   ──▶  backend（管理画面のCSSなど）
  ├── /health/*, /healthz, /readyz  ──▶  backend
  └── それ以外     ──▶  frontend サービス（Vite でビルドした静的ファイル）
                                    │
                         DATABASE_URL └──▶ 外部の PostgreSQL（Neon など）
```

画面とAPIが**同じドメイン**になるので、CORS も Cookie の SameSite も
悩まなくてよい。これが Oracle 案（別ドメイン）との一番の違い。

---

## 1. Vercel でプロジェクトを作る

1. https://vercel.com → **Add New → Project**
2. `sho-engineer/AIPPO` を **Import**
3. **Application Preset** が `Services` になっていること
   （`vercel.json` があれば自動でそうなる。「vercel.json required」の
   表示が出ていたら、`main` に `vercel.json` が入っていない）
4. **Root Directory は `./` のまま**（サブフォルダにしない。
   サービスの場所は `vercel.json` 側に書いてある）
5. **Deploy を押す前に**、次の「2. 環境変数」を先に入れる

---

## 2. 環境変数を入れる

デプロイ後に URL が確定するので、最初は仮の値で入れて、
4 で本物に直す。プロジェクト名を `aippo` にしたなら、
URL は `https://aippo.vercel.app` になる。

### 必ず入れるもの

| キー | 値 |
|---|---|
| `DJANGO_DEBUG` | `false` |
| `DJANGO_SECRET_KEY` | 50文字以上のランダム文字列（下記） |
| `DJANGO_ALLOWED_HOSTS` | `aippo.vercel.app` |
| `FRONTEND_URL` | `https://aippo.vercel.app` |
| `CORS_ALLOWED_ORIGINS` | `https://aippo.vercel.app` |
| `VITE_API_BASE_URL` | **空**（キーだけ作って値を入れない） |
| `EMAIL_BACKEND` | `django.core.mail.backends.console.EmailBackend` |
| `AI_PROVIDER` | `mock` |

`DJANGO_SECRET_KEY` の作り方:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

`VITE_API_BASE_URL` を**空文字**にするのが要。同じドメインに同居して
いるので、`/api/v1/...` という相対URLで自分自身へ届く。未設定のままだと
`https://aippo.vercel.app:8000` へ投げてしまい、8000番は無いので
画面は出るのに一切通信できない。

### 自動で入るもの

| キー | 入れ方 |
|---|---|
| `DATABASE_URL` | 3 で Neon を繋ぐと自動で入る。手で書かない |

### あとで足すもの

| キー | いつ |
|---|---|
| `AI_PROVIDER` を `gemini`（既定・費用と無料枠の都合） / `openai` / `anthropic` に、対応する `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | 本物のAIを使うとき。本番でユーザーの入力を扱うなら Gemini は Paid Tier（学習利用しない契約）の鍵にすること |
| `EMAIL_BACKEND` を smtp に、`EMAIL_HOST` `EMAIL_HOST_USER` `EMAIL_HOST_PASSWORD` `DEFAULT_FROM_EMAIL` | 実際に確認メールを送るとき |
| `CSRF_TRUSTED_ORIGINS` | 独自ドメインを足したとき |
| `SESSION_COOKIE_AGE` / `SESSION_ABSOLUTE_MAX_AGE` | ログインの期限を変えたいとき（既定は30日 / 90日） |
| `PASSKEY_RP_ID` / `PASSKEY_ORIGINS` | パスキーのドメインを明示したいとき（未設定なら `FRONTEND_URL` から決まる） |
| `CRON_SECRET` | 定期実行（古いデータの削除・学習リマインダー）を動かすとき。**入れるまで両方とも止まったまま** |
| `AUDIT_LOG_RETENTION_DAYS` | 操作記録を何日残すか（既定365。ゲストの学習データの30日より長く取る） |
| `GUEST_DATA_RETENTION_DAYS` | 登録なしの記録を何日残すか（既定30。ゲストのCookieは7日で切れる） |
| `SENTRY_DSN` | 例外を見張りたくなったとき |

### 一般に公開する前に入れるもの

| キー | 例 |
|---|---|
| `VITE_OPERATOR_NAME` | `〇〇株式会社` / 個人なら氏名 |
| `VITE_OPERATOR_ADDRESS` | `東京都〇〇区…` |
| `VITE_OPERATOR_CONTACT` | `support@example.com` |

規約とプライバシーポリシーに出る運営者の情報。**入れないと画面に
「（公開前に記入）」と出たまま公開される。**

コードに直接書かず環境変数にしてあるのは、事実でない社名や住所が
うっかりリポジトリに入るのを防ぐため（それ自体が景品表示法や
特定商取引法の問題になる）。住所や窓口は、コードを直さずに変わる
ものでもある。

身内だけのクローズドベータのうちは空でよい。一般公開の直前に入れる。

---

## 3. データベースを繋ぐ（Neon）

**SQLite は使えない。** Vercel の実行環境は要求ごとに使い捨てになるので、
書き込んでも次の要求では消えている。登録も進捗も残らない。
外部の PostgreSQL が必須。

1. プロジェクトの **Storage** タブ → **Create Database**
2. **Neon**（Postgres）を選ぶ。無料枠でよい
3. リージョンは利用者に近いところ（日本なら Tokyo / Singapore）
4. 作成したら **Connect** でこのプロジェクトに紐付ける
   → `DATABASE_URL` が環境変数に自動で入る
5. **再デプロイ**（Deployments → 最新の … → Redeploy）

---

## 4. 表を作る（マイグレーション。手元から1回だけ）

Vercel の実行環境には入れないので、手元から Neon へ直接繋いで実行する。
接続文字列は Storage タブに出ている。

```bash
cd backend
DATABASE_URL="<Neonの接続文字列>" python manage.py migrate
DATABASE_URL="<Neonの接続文字列>" python manage.py seed_catalog
```

`migrate` は二重送信の抑止に使うキャッシュ表（`aippo_cache`）も作る
（`apps/lessons/migrations/0006_cache_table.py`）。

**忘れても落ちない**——AI実行は通り、二重送信の防止だけが静かに外れる。
本物のAIでは二重の費用になるので、`manage.py preflight` で確かめること。

管理画面に入りたいときは、続けて:

```bash
DATABASE_URL="<Neonの接続文字列>" python manage.py createsuperuser
```

---

## 5. URL を実際の値に直す

1 でついた本当の URL（`https://<実際の名前>.vercel.app`）に合わせて、
`DJANGO_ALLOWED_HOSTS` / `FRONTEND_URL` / `CORS_ALLOWED_ORIGINS` を直し、
**再デプロイ**する。ここがずれていると `DisallowedHost` で400が返る。

---

## 6. 動作確認

上から順に見ていくと、どこで切れているか分かる。

| URL | 期待 |
|---|---|
| `https://<URL>/health/live` | `{"status": "ok"}` |
| `https://<URL>/health/ready` | `{"status": "ok"}`（DBまで届いている証明） |
| `https://<URL>/admin/` | ログイン画面。**CSSが当たっていること**（当たっていなければ `/static/*` のルーティングが効いていない） |
| `https://<URL>/api/v1/catalog/lessons/` | レッスン一覧のJSON（空配列なら `seed_catalog` 忘れ） |
| `https://<URL>/` | 画面が出て、レッスンを1本最後まで進められる |

`AI_PROVIDER=mock` のままでも教材9本は完走できる設計になっている。
登録・ログインも試せるが、`EMAIL_BACKEND=console` のうちは確認メールが
実際には届かない（Vercel のログに本文が出るだけ）。

---

## 残っている注意点

- **実行時間の上限**: AI生成は最大20秒かかる想定で、`vercel.json` で
  `maxDuration: 30` にしてある。Hobby プランの上限は 60 秒なので収まるが、
  本物のAIに切り替えて遅いモデルを指すと足りなくなることがある。
- **コールドスタート**: しばらく使われないと最初の1回が遅い。
  Django の起動が挟まるので数秒かかることがある。
- **Services は Vercel 側でもまだ実験的**（ドキュメントに "Experimental"
  と書かれている）。仕様が変わる可能性がある。うまくいかない場合の
  逃げ道として、Oracle Cloud に載せる手順を `docs/deploy-oracle.md` に
  残してある。
- **定期実行には `CRON_SECRET` が要る**: 古いデータの削除（`prune_data`）と
  学習リマインダーは Vercel Cron から叩く形で入っているが、
  **`CRON_SECRET` を入れるまで入り口は 404 のまま**動かない。
  合言葉が空のときに素通りさせると、入れ忘れた配置で
  「誰でも全データを消せる URL」が開くため、安全な側へ倒してある。
- **管理画面の操作記録**: 誰がどの学習者の記録を開いたかを残している
  （`apps/ops/models.py` の `AuditLog`、管理画面からは読むだけ）。
  既定で365日保持。`ADMIN_ALLOWED_IPS` と併せて使うこと。
