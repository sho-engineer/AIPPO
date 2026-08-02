# Phase 1: Data Model — 001 ハンズオンレッスン1本 + AIチューター

**Date**: 2026-08-02 | **Plan**: [plan.md](./plan.md)

---

## 1. 状態機械

### 状態

| 状態 | 画面上の「次の行動」（1つだけ） |
| --- | --- |
| `INTRO` | 「はじめる」を押す |
| `SELECT_USE_CASE` | 題材を4つから1つ選ぶ |
| `FIRST_INPUT` | 穴埋めフォームを埋めて「AIに送る」を押す |
| `GENERATING` | 待つ（操作不可。30秒で中断ボタンを出す） |
| `REVIEW_RESULT` | 結果を確認して「次へ」を押す |
| `IMPROVE_INPUT` | 改善の方向を1つ選んで再実行する |
| `REAL_TASK` | 自分の文章を入力して実行する |
| `REFLECTION` | 学んだことを確認して「完了する」を押す |
| `COMPLETE` | 成果物をコピーする |

### 許可された遷移

```
INTRO           --START-->          SELECT_USE_CASE
SELECT_USE_CASE --SELECT_CASE-->    FIRST_INPUT
FIRST_INPUT     --SUBMIT-->         GENERATING
FIRST_INPUT     --BACK-->           SELECT_USE_CASE
GENERATING      --RUN_SUCCEEDED-->  REVIEW_RESULT
GENERATING      --RUN_FAILED-->     FIRST_INPUT      (直前の入力を保持)
GENERATING      --CANCEL-->         FIRST_INPUT      (直前の入力を保持)
REVIEW_RESULT   --NEXT-->           IMPROVE_INPUT
REVIEW_RESULT   --BACK-->           FIRST_INPUT
IMPROVE_INPUT   --SUBMIT-->         GENERATING
IMPROVE_INPUT   --NEXT-->           REAL_TASK
REAL_TASK       --SUBMIT-->         GENERATING
REAL_TASK       --NEXT-->           REFLECTION
REFLECTION      --COMPLETE-->       COMPLETE
REFLECTION      --BACK-->           REAL_TASK
```

**遷移表に無い遷移は無視し、現在の状態を維持する**（FR-002）。

`GENERATING` からの復帰先は、`GENERATING` へ入る直前の状態を
`returnTo` として保持して決定する（`FIRST_INPUT` / `IMPROVE_INPUT` / `REAL_TASK`）。

---

## 2. エンティティ

### Lesson（レッスン）— フロントエンドのデータ（JSON）

`frontend/src/content/lessons/rewrite_text_001.json`

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `id` | string | `rewrite_text_001` |
| `title` | string | 「文章を分かりやすくする」 |
| `goal` | string | このレッスンで身につくこと（1文） |
| `useCases` | UseCase[] | 題材の選択肢（4件） |
| `fillInFields` | FillInField[] | 穴埋め項目の定義 |
| `improvements` | Improvement[] | 改善方向の選択肢（4件） |
| `steps` | Record<LessonStep, StepContent> | ステップ別の固定文言 |

**UseCase**

| フィールド | 型 | 例 |
| --- | --- | --- |
| `id` | string | `work_email` |
| `label` | string | 「仕事のメール」 |
| `sampleText` | string | 例文（本文） |

**FillInField**

| フィールド | 型 | 例 |
| --- | --- | --- |
| `key` | string | `audience` / `tone` / `length` |
| `label` | string | 「誰向け」 |
| `placeholder` | string | 「社外のお客様」 |
| `options` | string[] | 選択肢（自由入力も許可） |
| `required` | boolean | true |

**Improvement**

| フィールド | 型 | 例 |
| --- | --- | --- |
| `id` | string | `shorter` |
| `label` | string | 「もっと短くしたい」 |
| `instruction` | string | AIへ追加する条件文 |

**StepContent**

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `primaryAction` | string | ユーザーが次に取る行動（1つ） |
| `tutorMessage` | string | チューターの固定文言 |
| `tutorEmotion` | TutorEmotion | 固定文言に対応する表情 |
| `helpText` | string? | 補足（任意） |

### LearningSession（学習セッション）— DB

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `id` | UUID | 主キー |
| `learner_key` | UUID | 匿名学習者の識別子（Cookie 由来） |
| `lesson_id` | string | `rewrite_text_001` |
| `current_step` | string | 9状態のいずれか |
| `use_case_id` | string? | 選択した題材 |
| `fill_in_values` | JSON | 穴埋め入力（キー→値） |
| `real_task_text` | text? | 自分の文章（最大5,000文字） |
| `attempt_count` | int | AI実行の累計回数 |
| `started_at` | datetime | |
| `completed_at` | datetime? | |
| `updated_at` | datetime | |

インデックス: `(learner_key, lesson_id)`、`completed_at`

### Attempt（試行）— DB

1回のユーザー操作＝1レコード。AI生成とポーのフィードバックを1つに持つ。
AIPPO 開発概要 §14 に合わせ、旧 `AiRun` と `TutorFeedback` を統合したもの
（設計判断 Q-5）。1操作＝1レコードなのでログ分析が単純になり、
利用料の記録先も明確になる。

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `id` | UUID | 主キー |
| `session_id` | FK → LearningSession | |
| `sequence` | int | セッション内の実行順（1から） |
| `lesson_id` | string | |
| `step` | string | 実行元のステップ |
| `user_input` | text | 対象の文章（**本文はここに置く**） |
| `conditions` | JSON | 穴埋め条件＋改善指示 |
| `generated_output` | text | AI出力（失敗時は空） |
| `tutor_message` | string | 最大150文字（段階3のみ150、他は100） |
| `tutor_emotion` | string | 6種類 |
| `tutor_action` | string | 5種類 |
| `tutor_origin` | string | `ai` / `fallback`（品質監視用） |
| `hint_level` | int | 0〜3 |
| `completed` | boolean | |
| `status` | string | `succeeded` / `failed` / `timeout` |
| `model_name` | string | AI利用料の記録（§17） |
| `token_usage` | JSON | `{input, output, cache_read}` |
| `latency_ms` | int? | |
| `created_at` | datetime | |

`(session_id, sequence)` はユニーク。比較表示は `sequence` 順に並べる（FR-021）。

### LearningEvent（学習イベント）— DB

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `id` | UUID | 主キー |
| `session_id` | FK → LearningSession | |
| `lesson_id` | string | |
| `event_type` | string | research.md R-03 の一覧 |
| `step` | string? | 発生時点のステップ |
| `input_length` | int | **文字数のみ。本文は保存しない** |
| `hint_count` | int | ヒント利用回数 |
| `retry_count` | int | 再試行回数 |
| `completed` | boolean | |
| `duration_ms` | int? | 直前のイベントからの経過 |
| `occurred_at` | datetime | |

インデックス: `(session_id, occurred_at)`、`event_type`

**ユーザー入力の本文は LearningEvent に保存しない**（憲章 原則 VI / 設計判断 Q-2）。
本文は `Attempt` 側に置き、ログとコンテンツを分離する。
こうしておけば、後から「ログだけ長期保管」ができる。

### LearnerProfile（AI活用診断）— DB

匿名 `learner_key` に紐づく。MVP で埋めるのは先頭3項目のみ（設計判断 Q-1）。

| フィールド | 型 | MVP | 説明 |
| --- | --- | :---: | --- |
| `id` | UUID | | 主キー |
| `learner_key` | UUID | ✅ | 一意 |
| `ai_experience` | enum | ✅ | `none` / `tried` / `occasional` / `regular` |
| `job_category` | string | ✅ | 職種 |
| `pain_point` | string | ✅ | 困っていること |
| `learning_goal` | string | — | フェーズ3 |
| `detail_preference` | enum | — | フェーズ3 |
| `used_ai_services` | JSON | — | フェーズ3 |

### SkillProgress（習得記録）— DB

`id` / `learner_key` / `skill_key` / `lesson_id` / `acquired_at`。
`(learner_key, skill_key)` はユニーク。

`skill_key` の例: `state_audience`（相手を伝えられる）、
`state_length`（長さを伝えられる）、`review_output`（結果を確認できる）。

### Survey（完了時アンケート）— DB

`id` / `session_id`（1対1）/ `answers`（JSON）/ `created_at`。

MVP の検証項目のうち、アプリ内イベントでは測れない
「7日以内の再利用」「有料利用の意向」をここで取得する。

---

## 3. フロントエンドの型

```ts
export type TutorEmotion =
  | "neutral" | "question" | "thinking" | "hint" | "warning" | "celebrate";

export type TutorAction =
  | "wait" | "retry" | "next" | "show_hint" | "complete";

export interface TutorMessage {
  message: string;
  emotion: TutorEmotion;
  action: TutorAction;
}

export type LessonStep =
  | "INTRO" | "SELECT_USE_CASE" | "FIRST_INPUT" | "GENERATING"
  | "REVIEW_RESULT" | "IMPROVE_INPUT" | "REAL_TASK" | "REFLECTION" | "COMPLETE";

export interface LessonState {
  step: LessonStep;
  returnTo: Extract<LessonStep, "FIRST_INPUT" | "IMPROVE_INPUT" | "REAL_TASK">;
  useCaseId: string | null;
  fillInValues: Record<string, string>;
  realTaskText: string;
  improvementId: string | null;
  runs: AiRunResult[];
  attemptCount: number;
  tutor: TutorMessage;
  isSubmitting: boolean;
  error: string | null;
}

export interface AiRunResult {
  sequence: number;
  inputText: string;
  outputText: string;
}
```

---

## 4. バリデーション

| 対象 | ルール | 違反時の扱い |
| --- | --- | --- |
| `fillInValues` の必須項目 | 空でない | 送信せず、不足項目を **1つだけ** 表示（FR-003） |
| `real_task_text` | 1〜5,000文字 | 入力時点で文字数を表示。超過は送信不可 |
| `user_input`（API） | 1〜5,000文字 | 400 を返し、不足内容を示す（FR-011） |
| `attempt_count`（API） | 1以上の整数 | 400 |
| `step`（API） | 定義済みステップのいずれか | 400 |
| `message`（AI出力） | 100文字以内 | 超過はフォールバックへ差し替え（FR-014） |
| `hint_level`（AI出力） | 0〜3 | 範囲外はフォールバックへ差し替え |
