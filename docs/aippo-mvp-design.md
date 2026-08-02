# AIPPO MVP 設計・影響範囲

**作成日**: 2026-08-02
**最終更新**: 2026-08-02（Phase 0〜6 完了。§19 の MVP 完成条件を充足）
**位置づけ**: 「AIPPO 開発概要」§20 への回答。

## 進捗

| Phase | 状態 |
| --- | --- |
| **0. 移設準備・改名・設計判断の反映** | ✅ **完了** |
| **1. 画面モック** | ✅ **完了**（トップ・診断3問・用途提案・レッスンレイアウト） |
| **2. レッスン状態管理** | ✅ **完了**（9状態の状態機械＋各コンポーネント） |
| **3. AI文章生成** | ✅ **完了**（`POST /api/lessons/rewrite-text/generate/`） |
| **4. AIチューターフィードバック** | ✅ **完了**（§8 準拠の hint_level 0-3） |
| **5. ログ取得** | ✅ **完了**（学習イベント・セッション再開・アンケート） |
| **6. E2Eテスト** | ✅ **完了**（Playwright 30件＋探索テスト） |

Q-1 〜 Q-5 は **推奨案どおりで確定** し、実装へ反映済み。
§3.4 の各項目に反映結果を追記してある。

### テストの現状

| 種類 | 件数 | 実行方法 |
| --- | --- | --- |
| バックエンド（pytest） | 58 | `cd backend && pytest` |
| フロントエンド（Vitest） | 80 | `cd frontend && npm test` |
| E2E（Playwright / APIスタブ） | 14 × 2画面 | `cd frontend && npx playwright test e2e/lesson.spec.ts` |
| 探索テスト（本物のバックエンド） | 9 × 2画面 | Django 起動後に `npx playwright test e2e/exploratory.spec.ts` |

E2E は desktop Chrome と Pixel 5 の2プロジェクトで回す。

### 探索テストで見つかった不具合

スタブではなく本物の Django・DB・Cookie に当てて、実装だけでは気づけない
5件を検出した。いずれも修正済みで、回帰テストを追加してある。

| # | 症状 | 原因 | 対処 |
| --- | --- | --- | --- |
| 1 | 自分の文章で実行すると振り返りへ進めない | `RUN_SUCCEEDED` の行き先が固定だった | `nextStep()` を遷移元に応じて分岐 |
| 2 | ポーの助言が出ない | `dispatch` 直後の `stateRef` を読んでいた | 遷移先を引数で明示 |
| 3 | 接続先ホストのずれで通信が届かない | 既定が `localhost` 固定・CORS 許可も片方だけ | 表示中のホストから導出（`api/config.ts`）＋CORS を両方許可 |
| 4 | ポーの返事を待つ間の操作が黙って捨てられる | 二重送信の錠前が助言の通信まで覆っていた | 生成の完了で解除。追い越された古い返事は捨てる |
| 5 | 進んだ画面が後ろへ引き戻される | 再開の問い合わせが遅れて届き、現在地を上書き | まだ何もしていないときだけ再開を適用 |

加えて、狭い画面でポーが下のボタンのタップを奪っていたため
`pointer-events-none` を付けた（憲章 原則 I）。

---

## 0. 前提と、明記しておく仮定

### 確認できなかったこと

`sho-engineer/AIPPO` リポジトリを **このセッションからは読めなかった**。
GitHub アクセスが `sho-engineer/tripix` に固定されており、
リポジトリ追加には承認が必要で、非対話セッションでは承認フローを実行できない。

### したがって置いた仮定

| # | 仮定 | 外れた場合の影響 |
| --- | --- | --- |
| A-1 | `sho-engineer/AIPPO` は新規作成直後で、空か README のみ | 既存コードがある場合、§3 の「追加」の一部が「変更」に変わる |
| A-2 | 既存の CI / デプロイ設定は無い | ある場合は §8 に CI 調整タスクを追加 |
| A-3 | ライセンス・公開範囲は public（前回の指定を踏襲） | private なら README の記述のみ調整 |
| A-4 | 本設計の実装は AIPPO リポジトリの `main` から切ったブランチで行う | — |

**A-1 が外れていた場合、§1 と §3 は実装着手前に作り直す。**

### 現時点で存在する資産

前セッションで、同一のプロダクト構想に対して Spec Kit ベースの骨組みを作成済み。
`sho-engineer/Tripix` の `claude/ai-learning-platform-plan-92rie0` ブランチの
`ai-handson/` 配下に退避してある。**これは AIPPO へ移設できる**（§3.1）。

---

## 1. 現在のリポジトリ構成

### 1.1 `sho-engineer/AIPPO`

**確認済み（2026-08-02）。仮定 A-1 は正しかった。**

| 項目 | 実測値 |
| --- | --- |
| 公開範囲 | public |
| 既定ブランチ | `main` |
| コミット | `Initial commit` の1件のみ |
| ファイル | `README.md`（内容は `# AIPPO` の1行）のみ |
| CI / デプロイ設定 | なし（A-2 も正しかった） |

したがって §3 の「追加」はすべて追加のまま。作り直しは不要。

**アクセス状況**:

| 操作 | 可否 | 備考 |
| --- | :---: | --- |
| クローン（読み取り） | ✅ | git プロキシ経由で可能 |
| push（書き込み） | ❌ | 403。`add_repo` を `access: "push"` で呼ぶ必要があり、承認が要る |
| GitHub REST API | ❌ | 403。セッションが `sho-engineer/tripix` に固定されている |

push できるようになるまで、実装は
`Tripix:claude/ai-learning-platform-plan-92rie0` の `aippo/` 配下で進める。

### 1.2 移設候補の既存資産（`Tripix:claude/ai-learning-platform-plan-92rie0` の `ai-handson/`）

```
.specify/                          GitHub Spec Kit
├── memory/constitution.md         開発憲章（6原則）
├── templates/                     spec / plan / tasks テンプレート
└── scripts/bash/                  フィーチャー作成スクリプト
.claude/skills/speckit-*/          /speckit-* スキル 10本

docs/
├── business-plan.md               事業構想・5領域・収益モデル
├── roadmap.md                     フェーズ1〜6と判定条件
└── ai-tutor-design.md             チューター設計・API契約・レッスン台本

specs/001-handson-lesson-mvp/
├── spec.md                        User Story 4本 / FR-001〜026 / SC-001〜008
├── plan.md                        2プロジェクト構成・憲章ゲート
├── research.md                    プロバイダ選定・タイムアウト・イベント設計・匿名識別
├── data-model.md                  9状態の遷移表・エンティティ定義
├── contracts/tutor-feedback.md    POST /api/tutor/feedback/ の契約
├── quickstart.md                  ローカル起動手順
└── tasks.md                       T001〜T060

backend/                           Django 5 + DRF
├── config/                        settings / urls / wsgi
├── apps/lessons/
│   ├── models.py                  LearningSession / AiRun / LearningEvent
│   ├── middleware.py              匿名 learner_key Cookie
│   └── urls.py                    （空。実装はタスク T025/T049/T050）
├── apps/tutor/
│   ├── models.py                  TutorFeedback
│   ├── serializers.py             入出力検証 + JSON Schema
│   ├── prompts.py                 ステップ別システムプロンプト
│   ├── fallbacks.py               ステップ別・hint_level 別の固定ヒント
│   ├── services/base.py           AiProvider インターフェース
│   ├── services/provider.py       Anthropic 実装（構造化出力）
│   ├── services/stub.py           スタブ実装
│   ├── services/feedback.py       オーケストレーション
│   ├── views.py                   POST /api/tutor/feedback/
│   └── urls.py
└── tests/                         20 passed

frontend/                          React 18 + TS + Vite + Tailwind
├── src/types/tutor.ts             TutorEmotion / TutorAction / TutorMessage
├── src/lesson/machine.ts          9状態・遷移表・PRIMARY_ACTION
├── src/lesson/reducer.ts          useReducer 本体
├── src/components/TutorAvatar.tsx 6表情・吹き出し・aria-live・スマホ下部固定
├── src/api/tutor.ts               fetch + AbortController + フォールバック
├── src/content/ui.ts              固定文言の一元管理
├── src/content/lessons/rewrite_text_001.json  レッスン教材
├── src/pages/LessonPage.tsx       画面シェル
└── tests/                         49 passed
```

**検証済み**: backend 20 tests / frontend 49 tests / `tsc --noEmit` クリーン。

---

## 2. 使用されている技術

移設候補の資産が採用している構成。AIPPO 開発概要 §12 と **完全に一致** している。

| 層 | 技術 | 概要 §12 との差 |
| --- | --- | --- |
| Backend | Python 3.12 / Django 5 / DRF | 一致 |
| DB | SQLite（開発） / PostgreSQL（本番） | 一致 |
| Backend テスト | pytest + pytest-django | 一致 |
| Frontend | React 18 / TypeScript 5 / Vite | 一致 |
| スタイル | Tailwind CSS | 一致 |
| Frontend テスト | Vitest + React Testing Library | 一致 |
| E2E | Playwright | 一致（未実装。タスク T054） |
| AI | プロバイダ抽象 + Anthropic 実装（`claude-opus-5`） | 一致（1プロバイダのみ） |
| Lint | ruff / ESLint + Prettier | 概要に指定なし |

**AI プロバイダは画面から直接呼ばない。** `AiProvider` プロトコル →
サービスクラス → ビューの順で隔離済み。OpenAI / Google への差し替えは
`services/` に実装を1本足すだけで済む。

---

## 3. AIPPO MVP を実装するために追加・変更が必要な箇所

### 3.1 移設・改名（機械的な作業）

| 対象 | 現在 | AIPPO |
| --- | --- | --- |
| プロジェクト名 | AI Handson | **AIPPO** |
| チューター名 | （無名） | **ポー** |
| 画像ディレクトリ | `public/tutor/` | `public/poe/` |
| コンポーネント | `TutorAvatar` | `PoeAvatar`（API 名 `tutor` は据え置き） |
| README / docs | AI Handson 表記 | AIPPO 表記、キャッチコピー追加 |
| リポジトリ | Tripix の `ai-handson/` | AIPPO のルート |

API のパス（`/api/tutor/feedback/`）は概要 §13 の指定どおりなので変更しない。
**UIの呼称は「ポー」、コードの層名は `tutor` で統一** し、混在を避ける。

### 3.2 新規追加（AIPPO 概要にあり、既存 spec に無いもの）

これが実質的な差分の中心。

| # | 項目 | 概要の出典 | 影響範囲 |
| --- | --- | --- | --- |
| N-1 | **AI活用診断** | §11 必須機能 | 新規アプリ `apps/profiles/`、`LearnerProfile` モデル、診断画面、診断→用途提案のマッピング |
| N-2 | **おすすめ用途の提示** | §11 必須機能 | 診断結果からレッスン／用途を推薦するルール（MVPは静的マッピング） |
| N-3 | **AI文章生成API の独立** | §13 | `POST /api/lessons/rewrite-text/generate/`。既存 spec では汎用の run API だった |
| N-4 | **操作ログAPI のパス変更** | §13 | `POST /api/learning-events/`（既存 spec は `/api/lessons/{id}/events/`） |
| N-5 | **簡易アンケート** | §11 必須機能 | 完了画面のアンケート（4〜5問）、`Survey` モデルまたは `LearningEvent` の拡張 |
| N-6 | **安全ルール** | §15 | プロンプトに追加。個人情報検知時の `warning` 表情、断定回避、専門家確認の案内 |
| N-7 | **AI利用料の記録** | §17 | `Attempt.model_name` / `token_usage` |
| N-8 | **SkillProgress** | §14 | 「できるようになったこと」の記録。学習フロー §3 step 8 |
| N-9 | **次の課題の提案** | §3 step 9 | 完了画面。MVPは静的な次レッスン提示 |
| N-10 | **トップ画面** | §18 Phase 1 | ブランド・キャッチコピー・診断への導線 |

### 3.3 変更（既存実装の修正）

| # | 項目 | 現在 | AIPPO 概要 |
| --- | --- | --- | --- |
| C-1 | **hint_level の意味** | 1=観点 / 2=具体例 / 3=穴埋め | 1=方向 / 2=**選択肢や穴埋め** / 3=**具体例**（§8） |
| C-2 | **message 長** | 100文字以内（ハード） | 100文字を基本とする（§15。ソフト） |
| C-3 | **hint_level 0** | 未使用 | 「ヒントなし」として定義（§8） |
| C-4 | **データモデル** | LearningSession / AiRun / LearningEvent / TutorFeedback | + User / LearnerProfile / Lesson / LessonStep / **Attempt** / SkillProgress（§14） |
| C-5 | **レッスンID** | `rewrite_text_001` | 一致（変更不要） |
| C-6 | **チューターの初回メッセージ** | 汎用文言 | ポーの自己紹介（§6） |

**C-1 は最優先で直す。** 現在の `prompts.HINT_LEVEL_GUIDE` と
`fallbacks.FALLBACK_MESSAGES` の2と3を入れ替える。

### 3.4 設計上の懸念（判断を仰ぎたい点）

いずれも実装は可能。**進め方の推奨と、その理由を添える。**

#### Q-1: AI活用診断を MVP に含めると、レッスン完成が遅れる

> ✅ **確定**: 推奨どおり3問に絞る。`LearnerProfile` を実装済み（MVP使用は3項目）。

概要 §17 は「まず1レッスンを最後まで完成させる」としつつ、
§11 は AI活用診断を必須機能に挙げている。両立させるなら診断は最小構成にすべき。

**推奨**: 診断を **3問の選択式** に絞る（職種 / AI利用経験 / 今いちばん面倒なこと）。
自由入力なし、スコアリングなし、結果は用途3件の静的マッピング。
`LearnerProfile` のフィールドは §14 の6項目すべてを持たせるが、
**MVPで埋めるのは3項目のみ**とし、残りはフェーズ3で追加する。

理由: 診断の精度は「実際に使ってもらった後」でないと検証できない。
先に精度を作り込むと、レッスン完成が遅れるうえ手戻りも大きい。

#### Q-2: 操作ログにユーザー入力の全文を保存するか

> ✅ **確定**: 推奨どおり保存しない。`LearningEvent.input_length` のみ実装済み。

§13 は「入力文字数」を記録項目に挙げつつ、
「入力全文をログへ保存する場合は個人情報・機密情報の扱いに注意する」と補足している。

**推奨**: `LearningEvent` には **本文を保存しない**（文字数のみ）。
本文は `Attempt.user_input` に保持し、こちらへアクセス制限をかける。
ログとコンテンツを分離しておけば、後から「ログだけ長期保管」ができる。

#### Q-3: MVP に `User` モデル（ログイン）が必要か

> ✅ **確定**: 推奨どおり匿名Cookieのみ。`User` は導入していない。

§14 は `User` を挙げているが、§11 の MVP に決済もログイン画面も無い。
初回30分で成果物を作らせる（§5）目標に対し、登録は最初の離脱要因になる。

**推奨**: MVP は **匿名セッションキー（HttpOnly Cookie, 90日）** で識別する。
実装済み（`apps/lessons/middleware.py`）。`LearnerProfile` は
`learner_key` に紐づけ、`User` は導入せず、フェーズ後半で
匿名セッションをアカウントへ引き継げる構造にしておく。

#### Q-4: `hint_level: 3` の「具体例」と 100文字制限が衝突する

> ✅ **確定**: 推奨どおり段階3のみ150文字。Serializer で段階別に切り替え済み。

具体例を提示すると 100文字に収まらない場合がある。

**推奨**: `hint_level` が 3 のときのみ **150文字まで許容** する。
Serializer の上限をレベル別に切り替える。

#### Q-5: `Attempt` と既存 `AiRun` / `TutorFeedback` の関係

> ✅ **確定**: 推奨どおり `Attempt` へ統合済み。`model_name` / `token_usage` も追加。

§14 の `Attempt` は、生成結果とチューターのフィードバックを1レコードに持つ設計。
既存実装は `AiRun`（生成）と `TutorFeedback`（フィードバック）に分けている。

**推奨**: **`Attempt` に統合する**（§14 に合わせる）。
1回のユーザー操作＝1レコードのほうがログ分析が単純になり、
`model_name` / `token_usage` の記録先も明確になる。
`AiRun` / `TutorFeedback` は `Attempt` へマージする。

---

## 4. フロントエンドとバックエンドの責務分担

### 原則

**学習フローの進行はフロントエンドが所有し、LLM も バックエンドも進行を決めない**
（概要 §9 / §17）。

### 分担表

| 責務 | Frontend | Backend | 理由 |
| --- | :---: | :---: | --- |
| 学習状態（9状態）の保持と遷移 | ✅ | — | 進行はアプリが所有（§9） |
| 遷移の妥当性判定 | ✅ | — | 遷移表は1か所に置く |
| ポーの表情・吹き出しの表示 | ✅ | — | |
| 固定文言（ボタン・案内・エラー） | ✅ | — | AIを使わない部分（§17） |
| レッスン教材（用途・穴埋め項目・改善案） | ✅ | — | JSON で管理（§17）。レッスン追加でバックエンド変更不要 |
| 入力の検証（必須・文字数） | ✅ | ✅ | UXのため即時、正しさのためサーバーでも |
| 二重送信の防止 | ✅ | ✅ | §17 |
| AbortController による中断 | ✅ | — | 画面離脱時 |
| AIプロバイダの資格情報 | — | ✅ | クライアントへ出さない |
| プロンプトの組み立て | — | ✅ | 差し替えを一元化 |
| AI応答のスキーマ検証 | — | ✅ | 不適合をユーザーへ出さない |
| フォールバック文言の決定 | — | ✅ | AI障害時もレッスンを止めない |
| `hint_level` の決定 | — | ✅ | AIの自己申告を採用しない |
| 学習セッション・Attempt の永続化 | — | ✅ | |
| 操作ログの記録 | 送信のみ | ✅ | 送信失敗でレッスンを止めない |
| 匿名学習者の識別 | Cookie 保持 | ✅ 発行 | HttpOnly のため JS からは触らない |
| AI利用料（token_usage）の記録 | — | ✅ | |
| 診断の質問文 | ✅ | — | 固定文言 |
| 診断結果 → 用途のマッピング | — | ✅ | 後から変えたい |

### 状態の置き場所

```
ブラウザ（useReducer）    現在のステップ・入力途中の値・実行結果の配列
     ↓ ステップ通過ごとに送信
サーバー（DB）            到達ステップ・確定した入力・Attempt・イベント
     ↓ 再訪時に返す
ブラウザ                  RESUME で復元
```

途中の入力はサーバーへ都度送らない（通信を減らし、離脱時の不完全データを避ける）。

---

## 5. レッスン状態管理の設計

### 5.1 状態と「次の行動」

各状態でユーザーが取る行動は **常に1つだけ** 提示する。

| 状態 | ポーの表情（既定） | 次の行動 |
| --- | --- | --- |
| `INTRO` | `neutral` | 「はじめる」を押す |
| `SELECT_USE_CASE` | `question` | 用途を4つから1つ選ぶ |
| `FIRST_INPUT` | `hint` | 穴埋めを埋めて「AIに送る」 |
| `GENERATING` | `thinking` | 待つ |
| `REVIEW_RESULT` | `neutral` | 結果を確認して「次へ」 |
| `IMPROVE_INPUT` | `question` | 改善の方向を1つ選ぶ |
| `REAL_TASK` | `question` | 自分の文章を入力する |
| `REFLECTION` | `neutral` | 学んだことを確認して「完了する」 |
| `COMPLETE` | `celebrate` | 成果物をコピーする |

### 5.2 遷移表

```
INTRO           --START-->          SELECT_USE_CASE
SELECT_USE_CASE --SELECT_CASE-->    FIRST_INPUT
FIRST_INPUT     --SUBMIT-->         GENERATING
FIRST_INPUT     --BACK-->           SELECT_USE_CASE
GENERATING      --RUN_SUCCEEDED-->  REVIEW_RESULT
GENERATING      --RUN_FAILED-->     returnTo   （入力を保持）
GENERATING      --CANCEL-->         returnTo   （入力を保持）
REVIEW_RESULT   --NEXT-->           IMPROVE_INPUT
REVIEW_RESULT   --BACK-->           FIRST_INPUT
IMPROVE_INPUT   --SUBMIT-->         GENERATING
IMPROVE_INPUT   --NEXT-->           REAL_TASK
REAL_TASK       --SUBMIT-->         GENERATING
REAL_TASK       --NEXT-->           REFLECTION
REFLECTION      --COMPLETE-->       COMPLETE
REFLECTION      --BACK-->           REAL_TASK
```

- **遷移表に無い遷移は無視し、現在の状態を維持する。** 例外を投げない
- `GENERATING` の復帰先は `returnTo`（`FIRST_INPUT` / `IMPROVE_INPUT` / `REAL_TASK`）
- `COMPLETE` は終端

### 5.3 実装

`useReducer` を使う。reducer は2種類のアクションを扱う。

| 種別 | 例 | 挙動 |
| --- | --- | --- |
| 遷移を伴う | `START` / `SUBMIT` / `NEXT` / `BACK` | 遷移表を引く。拒否されたら state をそのまま返す |
| 入力の保持のみ | `SET_FILL_IN` / `SET_REAL_TASK` / `SET_TUTOR` | ステップを変えない |

**`SET_TUTOR` が遷移を伴わないことが重要。**
AI の応答（`action: "next"` など）は表示のヒントであって、遷移の指示ではない。
遷移を実行するのは reducer だけ。

実装済み・テスト済み（`frontend/src/lesson/`、31 tests）。

---

## 6. AIチューターAPIの設計

### 6.1 エンドポイント

```
POST /api/tutor/feedback/
```

**リクエスト**（概要 §13 のとおり）

```json
{
  "lesson_id": "rewrite_text_001",
  "step": "review_input",
  "user_input": "このメールをいい感じにしてください",
  "attempt_count": 1
}
```

| フィールド | 制約 |
| --- | --- |
| `lesson_id` | 最大100文字、既知のIDのみ |
| `step` | 定義済みステップのいずれか |
| `user_input` | 1〜5,000文字 |
| `attempt_count` | 1以上の整数 |

`session_id` はボディに含めない。`learner_key` Cookie からサーバーが解決する。

**レスポンス（200）**

```json
{
  "message": "誰に送るメールなのかを追加してみましょう。",
  "emotion": "hint",
  "action": "retry",
  "hint_level": 1,
  "completed": false
}
```

### 6.2 処理の流れ

```
1. リクエスト検証（Serializer）             不正 → 400（不足内容を返す）
2. attempt_count から hint_level を決める   ← AIの申告は採用しない
3. ステップ別プロンプトを組み立てる
4. AI を呼ぶ（構造化出力でスキーマを拘束）
        タイムアウト 12秒 / リトライ 1回
5. 応答を Serializer で検証                 不適合 → フォールバックへ
6. Attempt / LearningEvent に記録
7. 200 で返す
```

**AI が失敗・タイムアウト・形式逸脱のいずれでも HTTP 200 と固定ヒントを返す。**
エラーをユーザーに見せない。レッスンは必ず前に進む（§17）。

### 6.3 hint_level（AIPPO §8 に合わせる。**要修正 C-1**）

| level | 内容 | 例 |
| --- | --- | --- |
| 0 | ヒントなし | — |
| 1 | 考える方向を示す | 「誰が読む文章かを伝えると回答が変わります」 |
| 2 | 選択肢や穴埋め形式を示す | 「【誰向け】に【どんな表現】で、の形で書いてみましょう」 |
| 3 | 具体例を示す | 「例:『社外のお客様向けに、丁寧に、3行で』」 |

`attempt_count` → `hint_level` は `min(attempt_count, 3)`。
**1回目で正解そのものを提示しない。**

### 6.4 AI文章生成API（新規 N-3）

```
POST /api/lessons/rewrite-text/generate/
```

```json
{ "original_text": "入力文章", "audience": "上司", "tone": "丁寧", "length": "短め" }
```

- タイムアウト 30秒、**リトライなし**（待ち時間が倍増するため）
- 同一内容の二重送信は拒否
- `Attempt` に `model_name` / `token_usage` を記録（§17）

### 6.5 プロバイダ抽象

```
views.py → services/generation.py → AiProvider（Protocol）
                                       ├── AnthropicProvider   実装済み
                                       ├── StubProvider        実装済み
                                       ├── OpenAIProvider      将来
                                       └── GoogleProvider      将来
```

プロバイダ固有の型・SDK をビュー層へ漏らさない。
`AI_PROVIDER=stub` のままレッスンを完走できることを統合テストで担保する。

### 6.6 AIへ送るデータの範囲

送るもの: システムプロンプト（固定）、`user_input`、`hint_level`。
送らないもの: `learner_key`、`session_id`、Cookie、IPアドレス、会話履歴、他レッスンの入力。

### 6.7 システムプロンプト（§15 準拠、安全ルール込み — 新規 N-6）

```
あなたは、AI初心者向けハンズオン学習アプリ「AIPPO」の
AIチューター「ポー」です。
対象者は、AIに興味はありますが、
何に使えばよいか分からない非IT人材です。

役割:
- ユーザーを否定しない
- 専門用語を使わない
- 一度に一つだけ改善点を伝える
- 正解をすぐに出しすぎない
- 最初に良かった点を一つ伝える
- 次に行う操作を明確にする
- 100文字以内を基本とする
- 子ども扱いしない
- 明るいが、テンションを上げすぎない

安全ルール:
- 個人情報や機密情報が含まれる可能性がある場合は注意する
- AIの回答を事実として断定しない
- 数字、日付、固有名詞は確認するよう案内する
- 医療、法律、金融などの重要判断は専門家への確認を案内する

出力:
指定されたJSON形式だけを返す。
```

これに「現在のレッスン」「現在の段階」「評価項目」「ヒントの段階」を差し込む。

---

## 7. データモデル案

§14 に沿い、Q-5 の推奨（`Attempt` へ統合）を反映した案。

### 7.1 一覧

| モデル | MVP | 役割 |
| --- | :---: | --- |
| `User` | ✗ | Q-3 により MVP では導入しない |
| `LearnerProfile` | ✅ | 診断結果。`learner_key` に紐づく |
| `Lesson` | データ | フロントエンドの JSON（DB化はフェーズ3） |
| `LessonStep` | データ | 同上 |
| `LearningSession` | ✅ | 1回のレッスン挑戦 |
| `Attempt` | ✅ | 1回の操作＝生成＋フィードバック |
| `LearningEvent` | ✅ | 操作ログ（本文を持たない） |
| `SkillProgress` | ✅ | できるようになったこと |
| `Survey` | ✅ | 完了時アンケート |

### 7.2 定義

**LearnerProfile** — 診断結果

```
id                  UUID
learner_key         UUID（一意）
ai_experience       none | tried | occasional | regular   ← MVPで使用
job_category        文字列                                ← MVPで使用
pain_point          文字列                                ← MVPで使用
learning_goal       文字列（任意）                        フェーズ3
detail_preference   brief | standard | detailed（任意）   フェーズ3
used_ai_services    JSON 配列（任意）                     フェーズ3
created_at / updated_at
```

**LearningSession** — 1回のレッスン挑戦

```
id                  UUID
learner_key         UUID（索引）
lesson_id           文字列
current_step        9状態のいずれか
use_case_id         文字列
fill_in_values      JSON（誰向け / 表現 / 長さ）
real_task_text      テキスト（最大5,000文字）
attempt_count       整数
started_at / completed_at / updated_at
索引: (learner_key, lesson_id), completed_at
```

**Attempt** — 1回の操作（§14 準拠、`AiRun` + `TutorFeedback` を統合）

```
id                  UUID
session             FK → LearningSession
sequence            整数（セッション内の順序）
lesson_id / step    文字列
user_input          テキスト        ← 本文はここだけに置く
generated_output    テキスト
tutor_message       文字列（最大150文字）
tutor_emotion       6種のいずれか
tutor_action        5種のいずれか
tutor_origin        ai | fallback   ← 品質監視用
hint_level          0〜3
completed           真偽
status              succeeded | failed | timeout
model_name          文字列          ← 利用料の記録（§17）
token_usage         JSON（input / output / cache）
latency_ms          整数
created_at
制約: (session, sequence) が一意
```

**LearningEvent** — 操作ログ（`POST /api/learning-events/`）

```
id                  UUID
session             FK → LearningSession
lesson_id / step    文字列
event_type          下記の一覧
input_length        整数    ← 文字数のみ。本文は保存しない（Q-2）
hint_count          整数
retry_count         整数
completed           真偽
duration_ms         整数
occurred_at         日時
索引: (session, occurred_at), event_type
```

イベント種別:
`lesson_started` / `use_case_selected` / `step_entered` / `input_submitted` /
`ai_run_requested` / `ai_run_succeeded` / `ai_run_failed` / `hint_shown` /
`improvement_selected` / `real_task_submitted` / `lesson_completed` /
`lesson_abandoned` / `tutor_fallback_used`

**SkillProgress** — できるようになったこと

```
id / learner_key / skill_key / lesson_id / acquired_at
```

`skill_key` の例: `state_audience`（相手を伝えられる）、
`state_length`（長さを伝えられる）、`review_output`（結果を確認できる）。

**Survey** — 完了時アンケート（§11）

```
id / session / answers（JSON）/ created_at
```

設問（MVP検証項目に対応）: 迷った箇所の有無 / 7日以内に使いそうか /
有料プランへの関心 / 自由記述。

### 7.3 個人情報の扱い

- 本文が入るのは `Attempt.user_input` / `generated_output` と
  `LearningSession.real_task_text` の3か所のみ
- `LearningEvent` は文字数のみ
- ログ・エラートラッキングへ本文を出力しない
- 外部AIプロバイダへ送るのは最小限のフィールドのみ

---

## 8. 実装順序

概要 §18 の Phase 1〜6 に沿う。既存資産の状況を併記する。

### Phase 0: 移設（新規）

- AIPPO リポジトリ接続
- 既存資産の移設と AIPPO 名称への改名（§3.1）
- `hint_level` 2/3 の入れ替え（C-1）
- CI（GitHub Actions）で backend / frontend のテストを回す

**完了条件**: AIPPO の `main` でテストが緑。

### Phase 1: 画面モック（AI API を使わない）

- トップ画面（ブランド・キャッチコピー・診断への導線）— **新規**
- ポーの表示（6表情・吹き出し）— **実装済み**（`TutorAvatar` → `PoeAvatar` に改名）
- レッスン画面のレイアウト — シェルのみ実装済み
- AI活用診断（3問）— **新規**、固定レスポンス

**完了条件**: 固定レスポンスでトップ → 診断 → レッスン画面まで遷移できる。

### Phase 2: レッスン状態管理

- 9状態の遷移 — **実装済み**（`machine.ts` / `reducer.ts`、31 tests）
- 各状態でポーのメッセージと表情を変える — **実装済み**
- 用途選択・穴埋めフォーム・結果比較の各コンポーネント — **新規**

**完了条件**: AIなしで `INTRO` → `COMPLETE` まで手動で通せる。

### Phase 3: AI文章生成

- `POST /api/lessons/rewrite-text/generate/` — **新規**
- 生成サービス（プロバイダ抽象は実装済み）
- `Attempt` への記録（`model_name` / `token_usage`）
- 二重送信防止・30秒タイムアウト

**完了条件**: 実際に文章が書き換わり、改善前後を並べて表示できる。

### Phase 4: AIチューターフィードバック

- `POST /api/tutor/feedback/` — **実装済み**（20 tests）
- 安全ルールをプロンプトへ追加（N-6）
- `hint_level` を AIPPO 定義へ修正（C-1）
- `AiRun` / `TutorFeedback` を `Attempt` へ統合（Q-5）

**完了条件**: AI を全面停止してもレッスンを完走できる。

### Phase 5: ログ取得

- `POST /api/learning-events/` — **新規**
- フロントエンドからのイベント送信（失敗してもレッスンを止めない）
- `SkillProgress` の記録
- 完了時アンケート

**完了条件**: 通し操作でイベント列が記録され、再訪時に続きから再開できる。

### Phase 6: E2Eテスト

- Playwright で §18 の9ステップシナリオ
- AI はテスト用レスポンスへ差し替え

**完了条件**: E2E が緑。§19 の完成条件をすべて満たす。

### 見積の目安

| Phase | 内容 | 相対規模 |
| --- | --- | --- |
| 0 | 移設・改名・CI | 小 |
| 1 | 画面モック・診断 | 中 |
| 2 | 状態管理・各コンポーネント | 中（状態機械は流用） |
| 3 | AI文章生成 | 中 |
| 4 | チューター（既存の修正が中心） | 小 |
| 5 | ログ・アンケート・進捗 | 中 |
| 6 | E2E | 小 |

---

## 9. テスト計画

### 9.1 層ごとの方針

| 層 | ツール | 対象 | AI の扱い |
| --- | --- | --- | --- |
| Backend 単体 | pytest | Serializer / プロンプト組み立て / フォールバック選択 | 呼ばない |
| Backend サービス | pytest | フィードバック生成・文章生成のオーケストレーション | **モック** |
| Backend API | pytest + DRF テストクライアント | 各エンドポイント | **モック** |
| Frontend 単体 | Vitest | 遷移表 / reducer / 入力検証 | 呼ばない |
| Frontend コンポーネント | Vitest + RTL | `PoeAvatar` / フォーム / 結果比較 | 呼ばない |
| E2E | Playwright | 通しシナリオ | **スタブ応答へ差し替え** |

**AI プロバイダを実際に呼ぶ自動テストは書かない。** 不安定でコストもかかる。

### 9.2 必ず担保する振る舞い

| # | 検証内容 | 層 | 状況 |
| --- | --- | --- | --- |
| V-1 | 遷移表の全許可遷移が意図どおり | Frontend 単体 | ✅ 実装済み |
| V-2 | 不正な遷移で状態が変わらない | Frontend 単体 | ✅ 実装済み |
| V-3 | `GENERATING` 失敗時に入力が保持される | Frontend 単体 | ✅ 実装済み |
| V-4 | 二重送信が拒否される | Frontend / Backend | 前者✅ |
| V-5 | 6表情の画像切替 | Frontend コンポーネント | ✅ 実装済み |
| V-6 | `aria-live` でメッセージ変更が通知される | Frontend コンポーネント | ✅ 実装済み |
| V-7 | 狭い画面で入力欄を隠さない | Frontend コンポーネント | ✅ 実装済み |
| V-8 | `hint_level` がサーバー側で決まる（AI申告を採用しない） | Backend サービス | ✅ 実装済み |
| V-9 | スキーマ不適合がフォールバックへ倒れる | Backend サービス | ✅ 実装済み |
| V-10 | AI例外時も 200 が返る | Backend API | ✅ 実装済み |
| V-11 | 外部へ送るフィールドが最小限 | Backend サービス | ✅ 実装済み |
| V-12 | `LearningEvent` に本文が保存されない | Backend API | 未 |
| V-13 | `token_usage` が記録される | Backend API | 未 |
| V-14 | **AI 全面停止でレッスンを完走できる** | 統合 | 未 |
| V-15 | 通しシナリオで `celebrate` に到達する | E2E | 未 |

**V-14 が最重要。** これが通らない限り、ユーザーテストに出せない。

### 9.3 手動確認

自動化しないが、リリース前に毎回確認する。

- スマートフォン幅（375px）でポーが入力欄を隠さない
- UI に専門用語（プロンプト・トークン・モデル・API 等）が出ていない
- 初回利用者が外部の助けなしに完走できる（対面観察）
- ログ・エラー通知に入力本文が出ていない

---

## 10. MVP外として除外する機能

概要 §11・§16 に沿う。**これらの実装依頼が来ても、MVP完成までは着手しない。**

### 明示的に作らないもの

| 分類 | 項目 |
| --- | --- |
| キャラクター | Live2D / 3D / 音声会話 / 口パク / 複数キャラクター |
| プラットフォーム | ネイティブアプリ / 多言語 |
| 学習機能 | 高度なAI自動採点 / 自由な教材生成 / 個人用教材生成 |
| コース | OpenAI・Google・Anthropic のベンダー別コース |
| エンゲージメント | 高度なゲーミフィケーション / ランキング / コミュニティ |
| 法人 | 法人管理画面 / 企業別教材 / AIスキル診断（法人向け） / 資格制度 |
| 課金 | 決済機能 / サブスクリプション管理 |
| 認証 | ソーシャルログイン / パスワード認証（Q-3 により匿名で代替） |
| 情報 | AIビジネス情報 |
| 事業 | AI導入支援・PoC・システム開発（別ブランドで提供） |

### 構造だけ用意して実装しないもの

将来の拡張で手戻りしないよう、**インターフェースだけ**先に作る。

| 項目 | 用意するもの | 実装しないもの |
| --- | --- | --- |
| 複数AIプロバイダ | `AiProvider` プロトコル | OpenAI / Google の実装 |
| 複数レッスン | JSON による教材定義 | 2本目以降のレッスン |
| アカウント | 匿名 `learner_key` からの引き継ぎを想定した外部キー | ログイン画面・認証 |
| 教材のDB管理 | `Lesson` / `LessonStep` のモデル定義 | 管理画面・CRUD |

---

## 付録: 次のアクション

1. **`sho-engineer/AIPPO` をこのセッションへ接続する**（承認が必要）
2. 接続後、§1 の「現在のリポジトリ構成」を実測に置き換える
3. §3.4 の Q-1 〜 Q-5 について判断をもらう
4. 判断が出たら Phase 0（移設・改名・CI）から着手する

Q-1 〜 Q-5 はいずれも推奨案を書いてある。
**特に指示がなければ推奨案で進める** — その場合、判断待ちで止まらずに Phase 0 を始められる。
