# Phase 0: Research — 001 ハンズオンレッスン1本 + AIチューター

**Date**: 2026-08-02 | **Plan**: [plan.md](./plan.md)

plan.md の Phase 0 で挙げた4点を確定する。

---

## R-01: AIプロバイダの選定と構造化出力

### 決定

**Anthropic Claude を初期プロバイダとする。モデルは `claude-opus-5`。**
Python SDK（`anthropic`）を使用し、`AiProvider` インターフェース越しにのみ呼び出す。

### 理由

- チューターのフィードバックは固定スキーマ（`message` / `emotion` / `action` /
  `hint_level` / `completed`）に必ず適合させる必要がある（憲章 原則 III）。
  Claude の **構造化出力**（`output_config.format` に JSON Schema を渡す）で、
  返却形式をスキーマレベルで拘束できる
- 長文の教材データや資料の扱いを将来的に追加する際、同一プロバイダで拡張できる
- 開発者が Claude Code を日常的に使っており、運用の勘所がある

### 実装メモ

```python
# backend/apps/tutor/services/provider.py（抜粋・設計イメージ）
import anthropic

client = anthropic.Anthropic()  # ANTHROPIC_API_KEY を環境変数から解決

response = client.messages.create(
    model="claude-opus-5",
    max_tokens=1024,
    system=system_prompt,                       # ステップ別の指示（prompts.py）
    output_config={"format": {"type": "json_schema", "schema": TUTOR_SCHEMA}},
    messages=[{"role": "user", "content": user_payload}],
)
```

- `TUTOR_SCHEMA` は `contracts/tutor-feedback.md` のレスポンススキーマと一致させる。
  スキーマは `additionalProperties: false` と `required` を必須とする
- 構造化出力を使っても、**サーバー側の検証は省略しない**。
  受け取った JSON は必ず `TutorFeedbackResponseSerializer` に通し、
  不適合ならフォールバック文言に差し替える（FR-012）
- 会話履歴は送らない。1回のフィードバックは1回のリクエストで完結させる（FR-024）
- 思考（thinking）は既定で有効。短いフィードバック生成では不要なため、
  `output_config` の `effort` を `low` にしてレイテンシとコストを抑える。
  `max_tokens` はフォールバックを含めても十分な 1024 とする

### 却下した選択肢

| 選択肢 | 却下理由 |
| --- | --- |
| プロバイダを最初から複数実装 | MVPスコープ外（憲章 原則 II）。インターフェースだけ用意する |
| プロンプトで「JSONのみ返して」と指示し自前パース | 形式逸脱が一定確率で発生する。構造化出力の方が安定 |
| フロントエンドから直接AIを呼ぶ | 資格情報がクライアントへ露出する。却下 |

---

## R-02: タイムアウト・リトライ・レート制限

### 決定

| 対象 | 設定 |
| --- | --- |
| チューターのフィードバック | 接続 5秒 / 全体 12秒 でタイムアウト。リトライ 1回 |
| レッスン本体のAI実行 | 全体 30秒でタイムアウト。リトライなし |
| レート制限（429）・サーバーエラー（5xx） | 1回だけ指数バックオフで再試行し、失敗したらフォールバック |
| フロントエンドの待機表示 | 15秒経過で案内文を切り替え、30秒で中断して再試行を促す |

### 理由

- SC-006 が「フィードバック表示まで p95 5秒以内」なので、
  12秒はあくまで上限であり、通常はここに到達しない
- SDK は既定で 429 / 5xx を指数バックオフ再試行する（`max_retries`、既定2）。
  チューターは待たせたくないので **1回に減らす**
- レッスン本体のAI実行はユーザーが結果を待つ主目的の処理なので、
  リトライで待ち時間が倍増するより、失敗を早く伝えて再実行させる方がよい

### 実装メモ

- Python SDK は `client.with_options(timeout=..., max_retries=...)` で
  リクエスト単位に上書きできる。クライアントを使い回しつつ設定を変える
- タイムアウトは `anthropic.APITimeoutError` として送出される。
  `429` は `anthropic.RateLimitError`、`5xx` は `anthropic.APIStatusError`。
  例外の種類ごとに分岐し、いずれの場合も **HTTP 200 + フォールバック内容** を返す
  （ユーザーにエラーを見せない。FR-013）
- ログには例外クラス名・ステップ・所要時間のみ記録し、`user_input` の本文は残さない
  （憲章 原則 VI）

---

## R-03: 学習イベントの最小スキーマ

### 決定

MVP検証項目6点に直接対応するイベントのみを定義する。

| イベント種別 | 記録タイミング | 対応する検証項目 |
| --- | --- | --- |
| `lesson_started` | レッスン開始 | ①使い道を発見できるか |
| `use_case_selected` | 題材を選択 | ① |
| `step_entered` | 各ステップへ遷移 | ②一人で操作できるか |
| `ai_run_requested` | AI実行を開始 | ② |
| `ai_run_succeeded` / `ai_run_failed` | AI実行の結果 | ② |
| `improvement_selected` | 改善方向を選択 | ② |
| `real_task_submitted` | 自分の文章で実行 | ③成果物を完成できるか |
| `lesson_completed` | 完了画面に到達 | ③⑤ |
| `lesson_abandoned` | セッション終了時に未完了 | ② |
| `tutor_fallback_used` | フォールバック文言を返した | （品質監視） |

各イベントの共通フィールド:

```
event_type    文字列（上記のいずれか）
session_id    学習セッションのID
lesson_id     レッスン識別子
step          発生時点のステップ
occurred_at   発生時刻
duration_ms   直前のイベントからの経過（任意）
```

### 理由

- 検証項目④（7日以内の再利用）と⑥（有料利用意向）は、
  アプリ内イベントでは測れないため **完了後アンケート** で取得する。
  MVPではアンケートのリンク提示までとし、集計基盤は範囲外とする
- ユーザー入力の本文はイベントに含めない。本文は `LearningSession` 側に保持する

### 却下した選択肢

- 汎用的なクリックトラッキング（すべてのDOMイベント）→ ノイズが多く検証に寄与しない
- 外部アナリティクスSaaSの導入 → MVPスコープ外。まず自前テーブルに蓄積する

---

## R-04: 匿名利用の識別方法

### 決定

**サーバー発行の匿名セッションキー（HttpOnly Cookie）で識別する。**
メールアドレスやパスワードは MVP では要求しない。

- 初回アクセス時に UUIDv4 の `learner_key` を発行し、
  `HttpOnly` / `Secure` / `SameSite=Lax` の Cookie に格納する
- 有効期限は 90日。同一ブラウザからの再訪はこれで判定する（FR-023）
- Cookie が無い/期限切れの場合は新規学習者として扱う

### 理由

- 憲章 原則 I の「迷わなさ」に照らして、ログインを最初の障壁にしたくない
- 憲章 原則 VI に照らして、収集する個人情報を最小にできる
- 有料テスト（フェーズ2後半）で認証が必要になった時点で、
  匿名セッションを既存アカウントへ引き継げる構造にしておく

### 制約と受容

- 端末をまたぐ継続はできない。MVPの検証項目には影響しないため受容する
- Cookie を消した場合、進捗は失われる。完了画面で成果物のコピーを促すことで緩和する

### 却下した選択肢

| 選択肢 | 却下理由 |
| --- | --- |
| メール+パスワード登録を必須化 | 初回離脱の主要因になる。MVPの検証を歪める |
| ソーシャルログイン | spec の Out of Scope |
| localStorage のみ | サーバー側の学習イベントと紐付けにくい |

---

## 未解決事項

なし。Phase 1 へ進める。
