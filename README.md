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

レッスン1〜6と8は、同じ骨格から組み立てています（`frontend/src/course/shared.ts`）。

```
完成イメージ → お試し → 比較 → 自分で試す
```

**成果物ファースト**にしてあります。先に説明を読ませず、
1つ選ぶだけで最初の結果まで届かせてから、短い解説を挟みます。

### まだ無いもの

- 利用者登録・課金・外部連携（設定画面に「準備中」と出しています）
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
| 死活監視 | `/healthz`（DBを見ない） `/readyz`（DBを見る） |

管理者を作る:

```bash
docker compose exec backend python manage.py createsuperuser
```

`AI_PROVIDER=mock` のままでもレッスンは完走できるので、APIキー無しで試せます。

### 公開するときに必ず確認すること

- `DJANGO_SECRET_KEY` を50文字以上の乱数にする（開発用のままだと**起動しません**）
- `DJANGO_ALLOWED_HOSTS` に実際のドメインを入れる（未設定だと**起動しません**）
- `SECURE_SSL_REDIRECT=true` に戻す
- ロードバランサ配下に置くなら `TRUST_FORWARDED_FOR=true`
  （設定しないと、接続元単位の実行回数の上限が全員まとめて数えられます）
- `AI_RUNS_PER_DAY` を予算に合わせる。**これが最後の安全弁**です

```bash
# 設定の抜けを Django 自身に検査させる
docker compose exec backend python manage.py check --deploy
```

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
cd backend  && uv run pytest        # 178 tests
cd frontend && npm run test         # 164 tests
cd frontend && npm run check:a11y   # 15画面の WCAG 2.1 A/AA 検査
```

`check:a11y` は `npm run build && npm run preview` で立てた本番ビルドに当てます。
配色を変えたときに、読めなくなった場所が無いかを機械に調べさせるためのものです
（実際にここで、うすい青の上の文字が 4.42 で 4.5 に届かないのを見つけました）。

#### E2E（いまは失敗します）

`e2e/` の一式は、成果物ファーストの流れに追随できていません。
古いステップ（「用意された例文を使う」など）を操作しているため、**現状では失敗します**。
作り直しが要ります。

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
  apps/ai/         教材からAIを呼ぶ唯一の入口。アクション定義・プロバイダ抽象
                   models_catalog.py … 選べるモデルの名簿（画面に名前を書かないため）
  apps/lessons/    LearningSession / Attempt / LearningEvent / SkillProgress / Survey
  apps/profiles/   LearnerProfile（AI活用診断）
  apps/tutor/      ポーのフィードバックAPI・プロンプト
frontend/          React + TypeScript + Vite + Tailwind
  src/course/      教材データと進行。catalog.ts（9本）/ shared.ts（骨格）/
                   engine.ts（遷移）/ useCourseLesson.ts（状態）/ presentation.ts（見た目の割当）
  src/pages/       TopPage / HomePage / CoursePage / LessonRunner / SettingsPage
  src/components/  AppShell（ヘッダー・下タブ・カード）/ Icons（線画）/ course/ settings/
  src/lib/         draft（下書きと進捗）/ privacy（送信前の検査）/ settings（設定の保存）
  src/content/     固定文言
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
