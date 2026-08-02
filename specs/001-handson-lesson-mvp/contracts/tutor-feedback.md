# API 契約: チューターのフィードバック

**Endpoint**: `POST /api/tutor/feedback/`

**関連要件**: FR-010 〜 FR-017、FR-024

---

## リクエスト

```http
POST /api/tutor/feedback/
Content-Type: application/json
Cookie: learner_key=<uuid>
```

```json
{
  "lesson_id": "rewrite_text_001",
  "step": "review_input",
  "user_input": "このメールをいい感じにしてください",
  "attempt_count": 1
}
```

| フィールド | 型 | 必須 | 制約 |
| --- | --- | --- | --- |
| `lesson_id` | string | ✅ | 最大100文字。既知のレッスンIDのみ |
| `step` | string | ✅ | 最大50文字。定義済みステップのいずれか |
| `user_input` | string | ✅ | 1〜5,000文字 |
| `attempt_count` | integer | ✅ | 1以上 |

`session_id` はリクエストボディに含めない。`learner_key` Cookie から
サーバー側で進行中の `LearningSession` を解決する（憲章 原則 VI）。

---

## レスポンス（200 OK）

```json
{
  "message": "何を伝えたいメールなのか、目的を一つ追加してみましょう。",
  "emotion": "hint",
  "action": "retry",
  "hint_level": 1,
  "completed": false
}
```

| フィールド | 型 | 制約 |
| --- | --- | --- |
| `message` | string | 1〜100文字 |
| `emotion` | enum | `neutral` \| `question` \| `thinking` \| `hint` \| `warning` \| `celebrate` |
| `action` | enum | `wait` \| `retry` \| `next` \| `show_hint` \| `complete` |
| `hint_level` | integer | 0〜3 |
| `completed` | boolean | |

**`action` は表示のヒントであり、状態遷移の指示ではない。**
遷移を実行するのはフロントエンドの reducer のみ（憲章 原則 III）。

---

## AI障害時の挙動（FR-013）

AI呼び出しが失敗・タイムアウト・形式不適合のいずれかになった場合も、
**HTTP 200 とフォールバック内容** を返す。エラーをユーザーへ露出しない。

```json
{
  "message": "誰が読む文章なのかを伝えると、AIの回答が変わります。",
  "emotion": "hint",
  "action": "retry",
  "hint_level": 1,
  "completed": false
}
```

フォールバック文言は `backend/apps/tutor/fallbacks.py` にステップ別・
`hint_level` 別で定義する。返却したことは `TutorFeedback.origin = "fallback"` と
学習イベント `tutor_fallback_used` に記録する。

---

## エラーレスポンス

### 400 Bad Request（入力検証エラー・FR-011）

```json
{
  "errors": {
    "user_input": ["この項目は5000文字以内で入力してください。"]
  }
}
```

フロントエンドは `errors` の **最初の1件だけ** をユーザーへ表示する（FR-003）。

### 404 Not Found

進行中の学習セッションが見つからない場合。フロントエンドはレッスンを
`INTRO` から再開する。

### 429 Too Many Requests

同一 `learner_key` からの過剰なリクエスト。`Retry-After` ヘッダを付与する。

---

## レスポンススキーマ（AIへの構造化出力指定にも使用）

```json
{
  "type": "object",
  "properties": {
    "message":    { "type": "string" },
    "emotion":    { "type": "string",
                    "enum": ["neutral", "question", "thinking", "hint", "warning", "celebrate"] },
    "action":     { "type": "string",
                    "enum": ["wait", "retry", "next", "show_hint", "complete"] },
    "hint_level": { "type": "integer" },
    "completed":  { "type": "boolean" }
  },
  "required": ["message", "emotion", "action", "hint_level", "completed"],
  "additionalProperties": false
}
```

このスキーマは AI プロバイダの構造化出力（`output_config.format`）へ渡すものと、
`TutorFeedbackResponseSerializer` が検証するものを一致させる。
構造化出力を使う場合でも、**サーバー側の検証は省略しない**（FR-012）。

---

## AIへ渡す指示（システムプロンプトの方針）

ステップ別に `backend/apps/tutor/prompts.py` で組み立てる。共通部分:

```
あなたはAI初心者向け学習アプリの案内役です。
対象者は、AIに興味はありますが、
何に使えばよいか分からない非IT人材です。

役割:
- ユーザーを否定しない
- 専門用語を使わない
- 一度に一つだけ改善点を伝える
- 正解をすぐに出しすぎない
- まず良かった点を一つ伝える
- 次に行う操作を明確にする
- 100文字以内で回答する
```

ステップ別に「現在のレッスン」「現在の段階」「評価項目」を差し込む。

`hint_level` は `attempt_count` から決める（FR-017）。
段階の意味は AIPPO 開発概要 §8 に従う:

| `attempt_count` | `hint_level` | ヒントの粒度 | メッセージ上限 |
| --- | --- | --- | --- |
| — | 0 | ヒントなし | 100文字 |
| 1 | 1 | 考える方向を示す（例:「誰が読む文章かを伝えると回答が変わります」） | 100文字 |
| 2 | 2 | 選択肢や穴埋め形式を示す（例:「【誰向け】に【どんな表現】で」） | 100文字 |
| 3以上 | 3 | 具体例を示す（例:「社外のお客様向けに、丁寧に、3行で」） | **150文字** |

**1回目で正解そのものを提示してはならない。**

段階3のみ上限を 150 文字へ緩める。具体例を含めると 100 文字に収まらないため
（設計判断 Q-4）。上限は `hint_level` に応じて Serializer が切り替える。

`hint_level` を決めるのは **サーバー側**であり、AI の自己申告は採用しない。

---

## 送信するデータの範囲（FR-024）

AIプロバイダへ送るのは以下のみ。

- ステップ別のシステムプロンプト（固定）
- `user_input`（ユーザーが入力した文章）
- `attempt_count` から算出した `hint_level`

送らないもの: `learner_key`、`session_id`、Cookie、IPアドレス、
過去の会話履歴、他レッスンの入力内容。
