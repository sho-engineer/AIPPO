---
description: "Task list for 001 ハンズオンレッスン1本 + AIチューター（MVP）"
---

# Tasks: ハンズオンレッスン1本 + AIチューター（MVP）

**Input**: `/specs/001-handson-lesson-mvp/`

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/tutor-feedback.md](./contracts/tutor-feedback.md)

**Tests**: 憲章 原則 V により、reducer / serializer / API / E2E のテストは **必須**。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 他タスクと並行して着手できる（ファイルが重ならない）
- **[Story]**: 対応する User Story（US1〜US4）

---

## Phase 1: Setup（共通基盤）

- [ ] T001 リポジトリ直下に `backend/` と `frontend/` を作成し、`.gitignore` を整備する
- [ ] T002 [P] `backend/pyproject.toml` を作成（Django 5 / DRF / pytest / pytest-django / anthropic / django-cors-headers）
- [ ] T003 [P] `frontend/package.json` を作成（React 18 / TypeScript 5 / Vite / Tailwind / Vitest / Testing Library / Playwright）
- [ ] T004 [P] `backend/` に ruff、`frontend/` に ESLint + Prettier を設定する
- [ ] T005 [P] `backend/.env.example` と `frontend/.env.example` を作成する（quickstart.md の変数表に一致させる）

---

## Phase 2: Foundational（全ストーリーの前提。ここが終わるまで US へ進まない）

- [ ] T006 `backend/config/settings.py` を作成（環境変数読み込み、CORS、DRF 既定、SQLite/PostgreSQL 切替）
- [ ] T007 `backend/config/urls.py` を作成し、`/api/` を各アプリへルーティングする
- [ ] T008 `backend/apps/lessons/models.py` に `LearningSession` / `AiRun` / `LearningEvent` を定義する（data-model.md §2）
- [ ] T009 `backend/apps/tutor/models.py` に `TutorFeedback` を定義する
- [ ] T010 マイグレーションを作成し、`pytest` が空DBで起動することを確認する
- [ ] T011 [P] `backend/apps/lessons/middleware.py` に匿名 `learner_key` Cookie の発行・解決を実装する（research.md R-04）
- [ ] T012 [P] `frontend/src/types/tutor.ts` に `TutorEmotion` / `TutorAction` / `TutorMessage` / `LessonStep` / `LessonState` を定義する（data-model.md §3）
- [ ] T013 [P] `frontend/src/content/ui.ts` に固定文言（ボタン・エラー・案内）を集約する（憲章 原則 IV）
- [ ] T014 `frontend/src/content/lessons/rewrite_text_001.json` にレッスン教材を定義する（題材4件・穴埋め3項目・改善4件・9ステップの固定文言）
- [ ] T015 `frontend/src/lesson/machine.ts` に状態と遷移表を定義する（data-model.md §1）
- [ ] T016 `frontend/src/lesson/reducer.ts` に `useReducer` の reducer を実装する。遷移表に無い遷移は現状態を維持する
- [ ] T017 `frontend/tests/reducer.test.ts` に reducer の単体テストを書く（全許可遷移＋不正遷移の無視＋`returnTo` の復帰）

**Checkpoint**: reducer のテストが緑。バックエンドが起動しマイグレーション済み。

---

## Phase 3: User Story 1 — 用意された題材でAIを一度動かす（P1）🎯 MVP

**Goal**: レッスン開始 → 題材選択 → 穴埋め → AI実行 → 結果表示 まで通しで動く。

**Independent Test**: `INTRO` から `REVIEW_RESULT` まで操作し、AI出力が画面に出る。

### 実装

- [ ] T018 [P] [US1] `frontend/src/components/PoeAvatar.tsx` を実装する（6表情の画像切替、吹き出し、`aria-live="polite"`、スマホでは画面下部固定）
- [ ] T019 [P] [US1] `frontend/tests/PoeAvatar.test.tsx` にコンポーネントテストを書く（表情ごとの画像切替、メッセージ表示、`aria-live` 属性、`isVisible=false` で非表示）
- [ ] T020 [P] [US1] `frontend/src/components/PrimaryAction.tsx` を実装する（各ステップで「次の行動」を1つだけ表示。憲章 原則 I）
- [ ] T021 [US1] `frontend/src/components/FillInForm.tsx` を実装する（`fillInFields` から生成。必須未入力時は不足項目を1つだけ表示）
- [ ] T022 [US1] `frontend/src/components/ResultCompare.tsx` を実装する（元の文章とAI出力を並べて表示）
- [ ] T023 [US1] `backend/apps/lessons/serializers.py` にレッスン実行 API の入出力 Serializer を実装する
- [ ] T024 [US1] `backend/apps/lessons/services/runner.py` にレッスン本体のAI実行サービスを実装する（穴埋め入力から依頼文を組み立て、`AiProvider` 経由で実行、30秒タイムアウト、リトライなし）
- [ ] T025 [US1] `backend/apps/lessons/views.py` に `POST /api/lessons/{lesson_id}/runs/` を実装する（`AiRun` を採番して保存、二重送信を拒否）
- [ ] T026 [US1] `frontend/src/api/lesson.ts` に実行APIのクライアントを実装する（`AbortController`、二重送信防止）
- [ ] T027 [US1] `frontend/src/lesson/useLesson.ts` で reducer と API を結線する（実行中は `thinking` 表情、成功で `REVIEW_RESULT`、失敗で入力を保持したまま復帰）
- [ ] T028 [US1] `frontend/src/pages/LessonPage.tsx` を実装し、`INTRO` 〜 `REVIEW_RESULT` を描画する
- [ ] T029 [US1] `backend/tests/test_lessons_api.py` に実行 API のテストを書く（AI はモック。成功 / タイムアウト / 二重送信拒否）

**Checkpoint**: US1 単体で「AIを一度使えた」体験が成立する。

---

## Phase 4: User Story 2 — チューターのヒントで依頼内容を改善する（P2）

**Goal**: 良かった点1つ・改善点1つを受け取り、改善方向を選んで再実行し、改善前後を見比べる。

**Independent Test**: `REVIEW_RESULT` から `IMPROVE_INPUT` を経て2回目の出力が並んで表示される。

### 実装

- [ ] T030 [P] [US2] `backend/apps/tutor/serializers.py` に `TutorFeedbackRequestSerializer` / `TutorFeedbackResponseSerializer` を実装する（contracts/tutor-feedback.md の制約に一致）
- [ ] T031 [P] [US2] `backend/apps/tutor/services/base.py` に `AiProvider` インターフェースを定義する（プロバイダ固有の型をここから漏らさない）
- [ ] T032 [P] [US2] `backend/apps/tutor/services/stub.py` に開発・テスト用のスタブ実装を書く
- [ ] T033 [US2] `backend/apps/tutor/services/provider.py` に Anthropic 実装を書く（`claude-opus-5`、構造化出力、接続5秒/全体12秒、リトライ1回。research.md R-01/R-02）
- [ ] T034 [US2] `backend/apps/tutor/prompts.py` にステップ別のシステムプロンプトと評価項目を定義する
- [ ] T035 [US2] `backend/apps/tutor/fallbacks.py` にステップ別・`hint_level` 別の固定ヒントを定義する
- [ ] T036 [US2] `backend/apps/tutor/services/feedback.py` にオーケストレーションを実装する（`attempt_count` → `hint_level` 決定、AI呼び出し、応答検証、不適合・失敗時はフォールバック、`TutorFeedback` 保存）
- [ ] T037 [US2] `backend/apps/tutor/views.py` に `POST /api/tutor/feedback/` を実装する
- [ ] T038 [US2] `frontend/src/api/tutor.ts` にフィードバック API クライアントを実装する（`AbortController`、二重送信防止、失敗時は固定ヒントへ）
- [ ] T039 [US2] `frontend/src/pages/LessonPage.tsx` に `IMPROVE_INPUT`（改善方向の選択と再実行）を追加する
- [ ] T040 [US2] `frontend/src/components/ResultCompare.tsx` を複数実行の比較表示に拡張する（FR-021）
- [ ] T041 [P] [US2] `backend/tests/test_tutor_api.py` にAPIテストを書く（正常系 / 入力検証エラー / AI例外時に200＋フォールバック）
- [ ] T042 [P] [US2] `backend/tests/test_tutor_feedback_service.py` にサービステストを書く（`hint_level` の段階付け、100文字超過・スキーマ不適合のフォールバック差し替え）

**Checkpoint**: AI を全面停止（`AI_PROVIDER=stub` かつ例外注入）してもレッスンが進む。

---

## Phase 5: User Story 3 — 自分の文章で試して完了する（P2）

**Goal**: 自由入力で再実行し、成果物を得て完了する。

**Independent Test**: 自由入力 → 実行 → 振り返り → 完了（`celebrate`）まで操作できる。

### 実装

- [ ] T043 [US3] `frontend/src/pages/LessonPage.tsx` に `REAL_TASK` を追加する（自由入力欄、5,000文字カウンタ、空のときは「用意された例文で試す」を提示）
- [ ] T044 [US3] `frontend/src/pages/LessonPage.tsx` に `REFLECTION` を追加する（このレッスンで身についたことを1文で表示）
- [ ] T045 [US3] `frontend/src/pages/LessonPage.tsx` に `COMPLETE` を追加する（`celebrate` 表情、成果物のコピーボタン）
- [ ] T046 [US3] `backend/apps/lessons/views.py` の実行 API を `REAL_TASK` 由来の入力に対応させる（`real_task_text` を `LearningSession` に保存、5,000文字上限）
- [ ] T047 [P] [US3] `backend/tests/test_lessons_api.py` に自由入力の検証テストを追加する（上限超過は400、空は400）

**Checkpoint**: MVPの提供価値「自分の成果物を完成できる」が成立する。

---

## Phase 6: User Story 4 — 学習の記録が残る（P3）

**Goal**: 操作が学習イベントとして記録され、再訪時に続きから再開できる。

**Independent Test**: 通し操作後にイベント列を確認し、再訪時に到達ステップが復元される。

### 実装

- [ ] T048 [US4] `backend/apps/lessons/services/events.py` に学習イベント記録サービスを実装する（research.md R-03 の10種）
- [ ] T049 [US4] `backend/apps/lessons/views.py` に `POST /api/lessons/{lesson_id}/events/` を実装する（本文を含めないことを検証）
- [ ] T050 [US4] `backend/apps/lessons/views.py` に `GET /api/lessons/{lesson_id}/session/` を実装する（`learner_key` から進行中セッションを返す）
- [ ] T051 [US4] `frontend/src/lesson/useLesson.ts` から各ステップ通過時にイベントを送信する（送信失敗はレッスン進行を止めない）
- [ ] T052 [US4] `frontend/src/pages/LessonPage.tsx` の初期化で前回の到達ステップから再開する（FR-023）
- [ ] T053 [P] [US4] `backend/tests/test_learning_events.py` にテストを書く（イベント記録、離脱時の到達ステップ保持、本文が保存されないこと）

---

## Phase 7: Polish & E2E

- [ ] T054 `frontend/e2e/lesson.spec.ts` に Playwright の E2E テストを書く（レッスン開始 → 仕事のメール選択 → 穴埋め入力 → AI実行 → ヒント確認 → 修正 → 完了 → `celebrate` 表示。AI はテスト用レスポンスへ差し替え）
- [ ] T055 AI 全面停止状態での完走を統合テストで担保する（憲章 原則 III の適合判定）
- [ ] T056 [P] スマートフォン幅（375px）でチューターが入力欄を隠さないことを確認・修正する（FR-008）
- [ ] T057 [P] UI 文言から専門用語（プロンプト・トークン・モデル・API 等）が露出していないことを確認する（FR-026）
- [ ] T058 [P] ログ・エラートラッキングに `user_input` の本文が出力されないことを確認する（憲章 原則 VI）
- [ ] T059 [P] `frontend/public/poe/` の6枚を配置し、512×512px・背景透過・位置統一を確認する
- [ ] T060 `README.md` に quickstart.md へのリンクと起動手順の要約を追記する

---

## 依存関係

```
Phase 1 (Setup)
  └─> Phase 2 (Foundational)
        ├─> Phase 3 (US1, P1)  ← ここまでで最小の価値が成立
        │     └─> Phase 4 (US2, P2)
        │           └─> Phase 5 (US3, P2)
        ├─> Phase 6 (US4, P3)  ← US1 完了後は US2/US3 と並行可
        └─> Phase 7 (Polish & E2E)  ← US1〜US3 完了後
```

- **US1 は US2/US3 の前提**。US1 単体でも価値が成立するため、ここで一度止めて検証してよい
- **US4 は US1 完了後なら並行して進められる**（別ファイル・別エンドポイント）
- Phase 7 の E2E は US3 まで完了してから着手する

---

## 並行実行できるまとまり

| まとまり | タスク |
| --- | --- |
| Setup | T002 / T003 / T004 / T005 |
| Foundational | T011 / T012 / T013 |
| US1 の独立部品 | T018 / T019 / T020 |
| US2 のサービス層 | T030 / T031 / T032 |
| テスト | T041 / T042 / T047 / T053 |
| Polish | T056 / T057 / T058 / T059 |

---

## 完了の定義（roadmap.md の MVP完成条件と一致）

- [ ] キャラクター1体 / 表情6枚 / 吹き出し
- [ ] 1つのレッスン（9ステップ）
- [ ] 穴埋め入力
- [ ] AI実行
- [ ] 1回の改善
- [ ] 自分の文章で再実行
- [ ] 完了画面
- [ ] 操作ログ
- [ ] reducer / serializer / API / E2E のテストが緑
- [ ] AI 停止状態でレッスンを完走できる
