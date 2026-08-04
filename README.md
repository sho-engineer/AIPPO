# AIPPO（アイッポ）

**AIが気になる。でも、何をすればいいか分からない人へ。**

AIPPOは、実際にAIを触りながら、自分に合った使い道を見つけられるハンズオン学習アプリです。

> AIの最初の一歩を、ハンズオンで。

名前の由来: **AI ＋ 一歩**。AIに興味はあるものの何をすればよいか分からない人が、
AIを使い始める最初の一歩を支援する。

---

## AIPPOがやらないこと

AIPPOは、プロンプトを暗記させるサービスではありません。
ユーザーが次の考え方を身につけることを目的とします。

- AIに何を任せられるか考える
- 目的を明確にする
- 必要な背景や条件を伝える
- AIの回答を確認する
- 不十分な回答を改善する
- AIに任せる部分と人間が判断する部分を分ける
- 新しい課題でもAIの使い道を考える

---

## AIチューター「ポー」

学習の進行役。自由に雑談するチャットボットではなく、
**ユーザーが次に何をすればよいかを一つずつ案内する**役割に限定します。

| 表示状態 | 用途 |
| --- | --- |
| `neutral` | 通常の説明、待機 |
| `question` | ユーザーへの質問 |
| `thinking` | AI処理中 |
| `hint` | ヒントや改善案 |
| `warning` | 個人情報、誤情報などへの注意 |
| `celebrate` | 課題完了 |

ポーの応答は自由テキストではなく、構造化データとして扱います。

```json
{
  "message": "誰に向けた文章なのかを追加してみましょう。",
  "emotion": "hint",
  "action": "retry",
  "hint_level": 1,
  "completed": false
}
```

---

## 現在地

**教材9本ぶんが通しで動きます。** `AI_PROVIDER=mock` のままでも最後まで完走できます。

```
タイトル → ホーム ─┬─ 教材一覧 ─┬─ レッスン（19ステップ）→ 完了
                   │             └─ 設定
                   └─ 設定
```

| レッスン | 内容 | AI |
| --- | --- | --- |
| 0 | AI活用診断（3問）→ おすすめ3本 | 使わない |
| 1 | 文章を分かりやすくする | 使う |
| 2 | 長い文章を短くまとめる | 使う |
| 3 | 分からないことを説明してもらう | 使う |
| 4 | 選択肢を比較する | 使う |
| 5 | 計画を作る | 使う |
| 6 | 回答を改善する | 使う |
| 7 | AIの回答を安全に使う | 使わない |
| 8 | 自分の困りごとで試す（Final Challenge） | 使う |

教材の本体は **DB にあり、管理画面から直せます**（`backend/apps/catalog`）。
画面は起動時に `GET /api/v1/catalog/` を1回聞き、届いたらそれに差し替えます。
届かないときは同梱の9本で動きます（`frontend/src/course/live.ts`）。
教材が1本も無い画面は「壊れている」のと見分けがつかないためです。

レッスン1〜6と8は、同じ骨格から組み立てています（`frontend/src/course/shared.ts`）。

```
完成イメージ → お試し → 比較 → 自分で試す
```

**成果物ファースト**にしてあります。先に説明を読ませず、
1つ選ぶだけで最初の結果まで届かせてから、短い解説を挟みます。

**登録なしで最後まで使えます。** 記録は匿名の `learner_key`（HttpOnly Cookie）に
紐づいています。登録すると、その鍵が自分のものとして結びつき、別の端末から
ログインしても続きから始められます。記録そのものは書き換えないので、
引き継ぎは何度実行しても同じ結果になります。

```
ゲスト（learner_key）── 登録 ─→ LearnerIdentity: learner_key → user
                                  ↑ 別端末でログインすると、その端末の鍵も同じ人へ
```

| 入口 | できること |
| --- | --- |
| 設定 > アカウント設定 | 登録・ログイン・表示名・パスワード変更・ログアウト・退会 |
| レッスン完了画面 | 「登録して残す」の誘い（ログイン済みなら出ません） |

進み具合は **端末とサーバーの両方から取り、足し合わせて** 出します
（`frontend/src/course/progress.ts`）。どちらか一方を選ぶと、返事を待つ
あいだに「終わったはずのレッスンが未完了に戻った」ように見える瞬間が出ます。

### まだ無いもの

- 課金・外部連携（設定画面に「準備中」と出しています）
- 規約の**運営者情報**（名称・所在地・連絡先）。事実でないものを書けないので
  `frontend/src/content/legal.ts` の `OPERATOR` に「（公開前に記入）」を
  置いてあります。埋め忘れると画面にそのまま出るので気づけます
- 通知の配信（設定は保存できますが、送る仕組みがまだありません）
- 教材の多言語化（言語設定は画面の言葉だけ。教材本文は日本語のまま）
- Playwright の E2E 一式（成果物ファーストの流れに追随できておらず、
  **いまは失敗します**。作り直しが必要です）
- ポーの `talking` / `blink` 用の絵（`neutral` で代用しています）

---

## ドキュメント

| ドキュメント | 内容 |
| --- | --- |
| [`docs/aippo-mvp-design.md`](docs/aippo-mvp-design.md) | **MVP設計・影響範囲**。責務分担、状態管理、API、データモデル、実装順序、テスト計画 |
| [`.specify/memory/constitution.md`](.specify/memory/constitution.md) | 開発憲章。すべての仕様・計画・実装に優先する |
| [`docs/ai-tutor-design.md`](docs/ai-tutor-design.md) | ポーの設計・API契約・レッスン台本 |
| [`docs/business-plan.md`](docs/business-plan.md) | 事業構想・将来構想 |
| [`docs/roadmap.md`](docs/roadmap.md) | フェーズ1〜6と判定条件 |
| [`specs/001-handson-lesson-mvp/`](specs/001-handson-lesson-mvp/) | 最初のフィーチャーの spec / plan / tasks |

---

## 動かす（まとめて）

```bash
cp .env.docker.example .env
# .env の DJANGO_SECRET_KEY と POSTGRES_PASSWORD を埋める
#   python -c "import secrets; print(secrets.token_urlsafe(48))"

docker compose up --build
```

| | 場所 |
| --- | --- |
| 画面 | http://localhost:5173 |
| 管理画面 | http://localhost:8000/admin/ （`createsuperuser` が必要） |
| 死活監視 | `/health/live`（何も見ない。落ちていたら**再起動**） `/health/ready`（DB・AI・メールを見る。だめなら**振り分けを外す**） |

管理者を作る:

```bash
docker compose exec backend python manage.py createsuperuser
```

`AI_PROVIDER=mock` のままでもレッスンは完走できるので、APIキー無しで試せます。

### 公開するときに必ず確認すること

**入れないと起動しません。** 設定を1つ忘れたまま公開されるより、
動き出す前に止まったほうがよいからです。

| 変数 | なぜ要るか |
| --- | --- |
| `DJANGO_SECRET_KEY` | 50文字以上の乱数。開発用のままだと署名を誰でも偽造できます |
| `DJANGO_ALLOWED_HOSTS` | 実際のドメイン |
| `FRONTEND_URL` | 確認メールと再設定メールのリンクの行き先 |
| `EMAIL_HOST` / `DEFAULT_FROM_EMAIL` | `EMAIL_BACKEND` に smtp を指定したときのみ |

**入れないと事故になります。**

| 変数 | なぜ要るか |
| --- | --- |
| `AI_RUNS_PER_DAY` | 予算に合わせる。**これが最後の安全弁**です |
| `SECURE_SSL_REDIRECT=true` | 公開時は戻す |
| `TRUST_FORWARDED_FOR=true` | ロードバランサ配下のときだけ。設定しないと、接続元単位の上限が全員まとめて数えられます |
| `OPENAI_API_KEY` | `AI_PROVIDER=openai` のとき。無いと 503 で**はっきり失敗**します（黙って mock へ倒しません） |

画面と API を**別ドメイン**に置くときは、次も要ります。

| 変数 | 値 |
| --- | --- |
| `SESSION_COOKIE_SAMESITE` / `CSRF_COOKIE_SAMESITE` | `None`（HTTPS 必須） |
| `CSRF_TRUSTED_ORIGINS` | 画面のオリジン |
| `CORS_ALLOWED_ORIGINS` | 同上 |

任意: `SENTRY_DSN`（`pip install -e ".[monitoring]"`）。
空なら何も読み込みません。本文は送らない設定で初期化します。

```bash
# 設定の抜けを Django 自身に検査させる
docker compose exec backend python manage.py check --deploy

# 起きたあと、捌ける状態かを確かめる
curl -fsS https://<ドメイン>/health/ready
# {"status":"ok","checks":{"database":true,"ai":true,"email":true},...}
```

`/health/ready` が 503 のときは `checks` を見ます。
どれがだめかまでは返しますが、理由は返しません（攻撃の下調べに使えるため）。

### Preview 環境へ出す

このリポジトリだけでは出せません。**下の3つは人が用意する必要があります。**
コードの側は、渡されればそのまま動く形になっています。

| 要るもの | 何に使うか | 無いとどうなるか |
| --- | --- | --- |
| 置き場所（VM / コンテナ基盤 / PaaS）とドメイン | `DJANGO_ALLOWED_HOSTS` `FRONTEND_URL` | 起動しません |
| SMTPの接続情報 | 確認メールとパスワード再設定 | 送れないまま登録が開き、確認も再設定もできない人が溜まります（`/health/ready` が 503 になります） |
| AIプロバイダのAPIキー | 教材のAI実行 | `AI_PROVIDER=mock` なら不要。本物を使うなら必須で、無いと 503 |

手順（compose で出す場合）:

```bash
cp .env.docker.example .env
# .env を埋める。最低限:
#   DJANGO_SECRET_KEY  POSTGRES_PASSWORD
#   DJANGO_ALLOWED_HOSTS  CORS_ALLOWED_ORIGINS  FRONTEND_URL
#   SECURE_SSL_REDIRECT=true  TRUST_FORWARDED_FOR=true（LB配下なら）
#   EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend と EMAIL_HOST / DEFAULT_FROM_EMAIL
#   AI_PROVIDER と鍵（mock のままなら鍵は不要）

docker compose up -d --build
docker compose exec backend python manage.py migrate --noinput
docker compose exec backend python manage.py seed_catalog     # 教材をDBへ入れる
docker compose exec backend python manage.py createsuperuser  # 管理画面に入る人

curl -fsS https://<ドメイン>/health/ready
```

**1日1回、古い記録を消す仕組みを止めないでください。**
プライバシーポリシーに「最後の利用から180日で削除します」と書いてあります。
書いたなら、そのとおりに動かなければ意味がありません。

```bash
# cron でも、コンテナ基盤の定期実行でもよい
docker compose exec backend python manage.py prune_data

# はじめて動かすときは、何が消えるかを先に見る
docker compose exec backend python manage.py prune_data --dry-run
```

消えるのは**登録していない人**の古い記録だけです。登録した人の記録は、
本人が設定画面から消すまで残ります。

Preview では、まず `AI_PROVIDER=mock` で通しの動作を確かめ、
そのあと鍵を入れて本物へ切り替えるのが安全です。鍵を入れた瞬間から費用が
発生するので、`AI_RUNS_PER_DAY` を先に決めてください。

出したあと最初に見るもの:

1. `/health/ready` が `ok`（3つとも `true`）
2. 教材一覧に9本出て、公開した2本だけ始められる
3. 登録 → 確認メールが届く → 別の端末でログイン → 続きが出る
4. 管理画面で教材の文言を直す → 画面を再読み込みして反映される

---

## セットアップ（開発）

### バックエンド（Django REST）

```bash
cd backend
uv venv && uv pip install -e ".[dev]"
cp .env.example .env
uv run python manage.py migrate
uv run python manage.py runserver 8000
```

`AI_PROVIDER=mock` のままでもレッスンは完走できます（`stub` は同じものの旧名）。

### フロントエンド（React + Vite）

```bash
cd frontend
npm install
cp .env.example .env
npm run dev          # http://localhost:5173
```

### テスト

```bash
cd backend  && uv run pytest        # 321 tests
cd frontend && npm run test         # 203 tests
cd frontend && npm run check:a11y   # 19画面の WCAG 2.1 A/AA 検査
```

`check:a11y` は `npm run build && npm run preview` で立てた本番ビルドに当てます。
配色を変えたときに、読めなくなった場所が無いかを機械に調べさせるためのものです
（実際にここで、うすい青の上の文字が 4.42 で 4.5 に届かないのを見つけました）。

#### E2E（いまは失敗します。CIでも動かしていません）

`e2e/` の一式は、成果物ファーストの流れに追随できていません。
古いステップ（「用意された例文を使う」など）を操作しているため、**現状では失敗します**。
作り直しが要ります。

そのあいだ、CI では代わりに2つを動かしています。

| CIのジョブ | 何を見るか |
| --- | --- |
| `a11y` | 本番ビルドの19画面を WCAG 2.1 A/AA で検査 |
| `smoke` | 本物の Django に当てて、`/health/ready`・教材の配信・登録とログイン状態・合言葉なしの書き込みが断られること |

| ファイル | 何を見るか | 状態 |
| --- | --- | --- |
| `e2e/lesson.spec.ts` | 通しの導線。APIはスタブに差し替える | 要修正 |
| `e2e/a11y.spec.ts` | アクセシビリティ | 要修正（`check:a11y` が代役） |
| `e2e/exploratory.spec.ts` | 本物のバックエンドに当てる探索テスト | 要修正 |
| `e2e/screenshots.spec.ts` | 各画面の書き出し（`CAPTURE_SCREENSHOTS=1` のときだけ） | 要修正 |

本番と同じビルド成果物に当てたいときは `E2E_TARGET=build` を付けます。
開発サーバーでしか見ないと、ビルドしたときだけ壊れるものを取りこぼします。

#### 探索テスト（本物のバックエンドに当てる）

`e2e/exploratory.spec.ts` だけは API をスタブせず、実際の Django・DB・Cookie を通します。
スタブでは見つからない不具合（接続先のずれ・Cookie・同時実行・重なり）を拾うためのものです。

```bash
# 別のターミナルで Django を起動しておく。
# テストは全部おなじ接続元から来るので、接続元単位の上限は外す
# （付けたままだと、テストが上限に当たって壊れたように見えます）。
cd backend && AI_RUNS_PER_IP_PER_DAY=0 AI_RUNS_PER_DAY=0 \
  uv run python manage.py runserver 127.0.0.1:8000

cd frontend && npm run test:e2e
```

Django が起動していないときは自動でスキップします。
`AI_PROVIDER=mock` のままで完走できることを確かめるので、APIキーは不要です。

---

## 構成

```
.specify/          Spec Kit（憲章・テンプレート・スクリプト）
.claude/skills/    /speckit-* スキル
.github/workflows/ CI
docs/              設計・事業ドキュメント
specs/             フィーチャー別の spec / plan / tasks
backend/           Django REST Framework
  apps/accounts/   登録・ログイン・ゲストの記録の引き継ぎ
                   models.py … LearnerIdentity（learner_key → user）/ UserProfile
                   migration.py … claim_guest_data（冪等。記録は書き換えない）
  apps/ai/         教材からAIを呼ぶ唯一の入口。アクション定義・プロバイダ抽象
                   models_catalog.py … 選べるモデルの名簿（画面に名前を書かないため）
  apps/catalog/    教材そのもの（骨格＋差分）。Django Admin から編集する
                   flow.py / expand.py … 骨格に差分を重ねて1本ぶんへ組み立てる
                   access.py … 近日公開の教材を開かせない
                   validation.py … 公開前の検査（admin.py から呼ぶ）
  apps/lessons/    LearningSession / Attempt / LearningEvent / SkillProgress / Survey
  apps/profiles/   LearnerProfile（AI活用診断）
  apps/tutor/      ポーのフィードバックAPI・プロンプト
frontend/          React + TypeScript + Vite + Tailwind
  src/course/      教材データと進行。live.ts（サーバーの教材へ差し替え）/
                   catalog.ts（同梱の9本）/ shared.ts（骨格）/ engine.ts（遷移）/
                   useCourseLesson.ts（状態）/ progress.ts（進み具合）/
                   presentation.ts（見た目の割当）
  src/pages/       TopPage / HomePage / CoursePage / LessonRunner / SettingsPage
  src/auth/        AuthContext（ログイン状態。端末には何も貯めない）
  src/api/         http.ts（Cookie と CSRF の作法）/ accounts.ts / ai.ts / lesson.ts
  src/components/  AppShell（ヘッダー・下タブ・カード）/ Icons（線画）/
                   auth/（登録・ログイン）/ course/ settings/
  src/lib/         draft（下書きと進捗）/ privacy（送信前の検査）/ settings（設定の保存）
  src/content/     固定文言。legal.ts に利用規約・プライバシーポリシー・
                   AI利用上の注意（外部へ飛ばさず、アプリの中で読ませる）
```

---

## 設計上の要点

**学習フローはアプリ側が制御します。** LLM に進行を任せません。
状態遷移を実行するのはフロントエンドの reducer だけで、
AI の応答（`action`）は表示のヒントであって遷移の指示ではありません。

**固定文で済む部分にAIを使いません。** ボタン・案内・エラー・完了メッセージ・
安全上の注意は `frontend/src/content/` に集約し、AIはユーザー入力への
個別フィードバックに限定します。

**AIが止まってもレッスンは止まりません。** 障害・タイムアウト・形式逸脱の
いずれでも HTTP 200 と固定ヒントを返します。

**ログイン状態は Cookie にしかありません。** 合言葉（トークン）を
localStorage へ置きません。置くと、画面に差し込まれた script から読み取れます。
セッション Cookie は HttpOnly / Secure / SameSite で、書き込みのときだけ
CSRF の合言葉をヘッダで添えます（`frontend/src/api/http.ts`）。

**認証の連打は数えて止めます。** 登録・ログイン・パスワード再設定は、
接続元と宛先の**両方**で回数を数えます（`backend/apps/accounts/throttle.py`）。
接続元だけだと複数の場所から1つのアカウントを狙う形を、宛先だけだと1か所から
多数のアカウントを試す形を止められません。数は DB に置きます。プロセス内に
置くと gunicorn の worker ごとに別々の数になり、上限が worker の数だけ緩みます。
IPもメールアドレスもそのままでは保存せず、HMAC だけを持ちます。

**引き継ぎは記録を書き換えません。** 登録でやるのは「その learner_key が
誰のものか」を1行足すことだけです。二度実行しても結びつきは1つのままで、
途中で失敗しても学習の記録は元の場所に残ります。引き継ぎに失敗しても
**登録そのものは成功させます**。ここで登録ごと失敗させると、次の登録で
「そのメールアドレスは使われています」に当たって詰みます。

---

## MVPで作らないもの

ネイティブアプリ / 複数キャラクター / Live2D / 3D / 音声会話 /
高度なゲーミフィケーション / ランキング / コミュニティ / 法人管理画面 /
資格制度 / **教材の多言語化** / 高度なAI自動採点 / ベンダー別コース /
自由な教材生成 / 決済機能

設定に言語の項目はありますが、切り替わるのは画面の言葉だけです。
教材本文とAIの答えは日本語のままで、そのことを設定画面に明記しています。

将来構想は [`docs/business-plan.md`](docs/business-plan.md) に記録しますが、
**将来像は広げても、最初のプロダクトは広げません。**
