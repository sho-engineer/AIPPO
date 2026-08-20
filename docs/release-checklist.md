# 仮リリース手順書

試験公開（クローズドベータ）として世に出すための手順。
上から順にやれば終わる。

**確かめ方は1つに寄せてある。**

```bash
cd backend
python manage.py preflight
```

NG が0件になれば、設定は揃っている。何が足りないかもここに出る。
一般公開として厳しく見るときは `python manage.py preflight --public`
（運営者情報の空欄が NG に上がる）。

---

## あなたに用意してもらうもの

コードでは埋められない。事実か、お金か、あなたの判断が要るもの。

### 必須（これが無いと公開できない）

| # | もの | どこで取るか | 無いとどうなるか |
|---|---|---|---|
| 1 | **Vercel アカウント** | https://vercel.com （無料枠可） | 置き場所が無い |
| 2 | **Neon の Postgres** | Vercel の Storage タブから作成（無料枠可） | SQLite は Vercel で毎回消える。登録も進捗も残らない |
| 3 | **メール送信の口** | Resend / SendGrid / Amazon SES など（下記） | 確認メールが届かず、**登録した人が誰も本人確認できない** |
| 4 | **AIの鍵** | OpenAI か Anthropic の API キー | `mock` のままだと決まった文しか返らない |

### 強く推奨（試験公開でも入れたほうがいい）

| # | もの | なぜ |
|---|---|---|
| 5 | **管理画面に入る固定IP** | `curl -s https://api.ipify.org` で分かる。合言葉だけが守りの状態を避ける |
| 6 | **Sentry の DSN** | https://sentry.io （無料枠可）。落ちても気づけない状態を避ける |

### 一般公開に切り替えるときに必要

| # | もの | なぜ |
|---|---|---|
| 7 | **運営者の名称・所在地・連絡先** | 規約とプライバシーポリシーに出る。**事実を私が決めることはできない**。空のままだと画面に「（公開前に記入）」と出る |

身内だけに配るあいだは 7 は空でよい。URL を知っている人だけが
触る状態なら、事業者表示の義務はかからない。一般に告知した時点で要る。

---

## メール送信について

ここが一番つまずく。Gmail の個人アカウント＋アプリパスワードでも
技術的には送れるが、勧めない——1日あたりの送信数に上限があり、
そもそも個人利用向けの口なので、**利用者への確認メールを送り続ける用途では
止められることがある**。止まった時点で、誰も登録を完了できなくなる。

送信専用のサービスを使うこと。無料枠のあるものだと:

| サービス | 無料枠 | 備考 |
|---|---|---|
| Resend | 月3,000通 / 日100通 | 設定が一番速い。独自ドメインなしでも `onboarding@resend.dev` で試せる |
| SendGrid | 日100通 | 審査がある |
| Amazon SES | 月3,000通（12か月） | 最初はサンドボックスで、宛先を登録した先にしか送れない |

独自ドメインから送るなら SPF / DKIM / DMARC の設定が要る。
入れないと迷惑メール扱いになり、**確認メールが届かない**。
手順は `docs/operations.md` の「4. メール送信の設定と到達性」にある。

---

## 手順

### 1. Vercel にプロジェクトを作る

`docs/deploy-vercel.md` の 1 のとおり。Root Directory は `./` のまま。

### 2. 環境変数を入れる

Vercel の Settings → Environment Variables に入れる。

```
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=<下のコマンドで作る>
DJANGO_ALLOWED_HOSTS=<あなたの>.vercel.app
FRONTEND_URL=https://<あなたの>.vercel.app
CORS_ALLOWED_ORIGINS=https://<あなたの>.vercel.app
VITE_API_BASE_URL=            ← キーだけ作って値は空

EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=<送信サービスのホスト>
EMAIL_HOST_USER=<利用者名>
EMAIL_HOST_PASSWORD=<鍵>
DEFAULT_FROM_EMAIL=<差出人アドレス>

AI_PROVIDER=gemini              ← 既定。または openai / anthropic
GEMINI_API_KEY=<鍵>             ← または OPENAI_API_KEY / ANTHROPIC_API_KEY
                                 ← 本番でユーザーの入力を扱うなら Gemini は Paid Tier の鍵

CRON_SECRET=<下のコマンドで作る>
DJANGO_ADMIN_PATH=<推測されない名前>/
DJANGO_ADMIN_ALLOWED_IPS=<あなたのIP>
SENTRY_DSN=<Sentryで取る>
```

鍵の作り方:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

`VITE_API_BASE_URL` を**空文字**にするのが要。ここを空にしないと
`https://<あなたの>.vercel.app:8000` へ投げてしまい、画面は出るのに
一切通信できない状態になる。

### 3. データベースを繋ぐ

Storage → Create Database → Neon → Connect。
`DATABASE_URL` が自動で入る。**手で書かない。**

### 4. 表を作り、教材を入れる（手元から1回だけ）

```bash
cd backend
DATABASE_URL="<Neonの接続文字列>" python manage.py migrate
DATABASE_URL="<Neonの接続文字列>" python manage.py seed_catalog
DATABASE_URL="<Neonの接続文字列>" python manage.py createsuperuser
```

`migrate` は二重送信を止めるキャッシュ表（`aippo_cache`）も作る。

**忘れても落ちない。** AI実行は 200 を返し続け、二重送信の防止だけが
静かに効かなくなる。本物のAIに切り替えたあとは、そのまま二重の費用になる。
動かして気づける類ではないので、`preflight` で見るようにしてある。

### 5. 確かめる

```bash
cd backend
DATABASE_URL="<Neonの接続文字列>" \
DJANGO_DEBUG=false DJANGO_SECRET_KEY="<入れた値>" \
DJANGO_ALLOWED_HOSTS="<あなたの>.vercel.app" \
FRONTEND_URL="https://<あなたの>.vercel.app" \
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend \
EMAIL_HOST="<ホスト>" DEFAULT_FROM_EMAIL="<差出人>" \
AI_PROVIDER=openai OPENAI_API_KEY="<鍵>" \
CRON_SECRET="<入れた値>" \
python manage.py preflight
```

NG が0件になるまで直す。

### 6. 手で通す（自動テストでは分からないところ）

配られた画面で、実際に次を1回ずつ。

- [ ] トップが開き、レッスンを**登録せずに**最後まで進められる
- [ ] AIの返事が返る（`mock` でないこと。同じ文が返り続けないか見る）
- [ ] 登録すると**確認メールが実際に届く**（迷惑メール入りも見る）
- [ ] 確認メールのリンクを押すと、確認済みになる
- [ ] パスワード再設定のメールも届く
- [ ] ログアウト → ログインで、進捗が残っている
- [ ] 管理画面が開く（CSSが当たっていること）。**変えたパスで**
- [ ] 別の回線（スマホの回線など）から管理画面が開けないこと
- [ ] 規約とプライバシーポリシーに「（公開前に記入）」が出ていないか確認
      （身内配布なら出ていてよい。一般公開なら直す）

### 7. 定期実行を確かめる

`vercel.json` に入っているので配置すれば動くが、初回は手で叩いて確かめる。

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://<あなたの>.vercel.app/api/v1/maintenance/prune/
```

`{"status":"ok",...}` が返ればよい。401 なら合言葉違い、
404 なら `CRON_SECRET` が入っていない。

---

## いまの中身

| | |
|---|---|
| 教材 | **9本すべて公開・受講可能** |
| 登録なしで使えるか | 使える。作ったものが残ってから登録できる |
| ログイン | メール＋パスワード / パスキー |
| 学習の記録 | 履歴・作ったもの・復習・修了証 |
| 探す | 用途の言葉で絞り込み（タグまで当たる） |
| あとで見る | 教材に目印を付けて取っておける |
| 知らせ | 学習リマインダー（2日あいたら。切れる） |
| 運用 | 管理画面のIP制限・操作記録・自動削除 |

AI設定・学習設定・言語設定・外部連携・サブスクリプション・ヘルプと、
通知の3項目（おすすめ／お知らせ／メール通知）は
**「準備中」として押せない形**で置いてある。中身が無いものを
動くように見せていない。

実際に効く設定は、アカウント設定・通知設定の学習リマインダー・
音（できたときの音）・学習データ / プライバシー・規約とポリシーの5つ。

音は既定で**切**。入れた人にだけ、1歩進むたびに短い音が鳴る。
音が鳴らない場合でも、できたことは画面の文字で必ず分かるようにしてある。

---

## 出したあとに見るところ

| どこ | 何を |
|---|---|
| `https://<URL>/health/ready` | DB・AI・メールが全部生きているか |
| Sentry | 例外が出ていないか |
| 管理画面 → 操作記録 | 誰が学習者の記録を見たか |
| Vercel の Logs | `cron.prune.done` と `cron.reminders.done` が1日1回出ているか |

---

## 詰まったときの読み先

| 症状 | 見る場所 |
|---|---|
| 画面は出るが通信できない | `VITE_API_BASE_URL` が空か。`docs/deploy-vercel.md` |
| 400 DisallowedHost | `DJANGO_ALLOWED_HOSTS` |
| 確認メールが届かない | `docs/operations.md` の 4 |
| 管理画面が 404 | `DJANGO_ADMIN_ALLOWED_IPS` に自分のIPが入っているか |
| 自動削除が動かない | `CRON_SECRET`。`docs/operations.md` の 3 |
