# Quickstart — ローカル開発環境

**Feature**: 001 ハンズオンレッスン1本 + AIチューター

---

## 前提

| ツール | バージョン |
| --- | --- |
| Python | 3.12 以上 |
| Node.js | 20 以上 |
| uv | 最新（推奨。`pip` でも可） |

---

## 1. バックエンド（Django REST）

```bash
cd backend

# 依存関係のインストール
uv sync            # または: python -m venv .venv && pip install -e ".[dev]"

# 環境変数
cp .env.example .env
# .env を編集し、ANTHROPIC_API_KEY を設定する
# AI を使わずに動かす場合は AI_PROVIDER=stub のままでよい

# マイグレーションと起動
uv run python manage.py migrate
uv run python manage.py runserver 8000
```

`http://localhost:8000/api/tutor/feedback/` が利用可能になる。

### 環境変数

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | （開発用の固定値） | 本番では必ず変更する |
| `DJANGO_DEBUG` | `true` | |
| `DATABASE_URL` | `sqlite:///db.sqlite3` | 本番は PostgreSQL |
| `AI_PROVIDER` | `stub` | `stub` \| `anthropic` |
| `ANTHROPIC_API_KEY` | （未設定） | `AI_PROVIDER=anthropic` のとき必須 |
| `AI_MODEL` | `claude-opus-5` | |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | |

**`AI_PROVIDER=stub` のままレッスンを完走できることが、憲章 原則 III の要件。**

### テスト

```bash
cd backend
uv run pytest              # 全テスト
uv run pytest -k tutor     # チューター関連のみ
```

---

## 2. フロントエンド（React + Vite）

```bash
cd frontend

npm install
cp .env.example .env       # VITE_API_BASE_URL=http://localhost:8000
npm run dev
```

`http://localhost:5173` でレッスンを開ける。

### テスト

```bash
cd frontend
npm run test          # Vitest（reducer / コンポーネント）
npm run test:e2e      # Playwright（AI はスタブ応答）
```

---

## 3. チューター画像

`frontend/public/poe/` に6枚を配置する。

```
neutral.webp / question.webp / thinking.webp / hint.webp / warning.webp / celebrate.webp
```

- 512×512px、背景透過、キャラクターの位置と大きさを統一
- 未配置でも動作する（`alt` テキストが表示される）。
  実装中は同一規格のプレースホルダで進めてよい

詳細は [`docs/ai-tutor-design.md`](../../docs/ai-tutor-design.md) を参照。

---

## 4. 動作確認

```bash
# チューターのフィードバック（スタブ）
curl -s -X POST http://localhost:8000/api/tutor/feedback/ \
  -H 'Content-Type: application/json' \
  -d '{
    "lesson_id": "rewrite_text_001",
    "step": "review_input",
    "user_input": "このメールをいい感じにしてください",
    "attempt_count": 1
  }' | python -m json.tool
```

期待されるレスポンス:

```json
{
  "message": "...",
  "emotion": "hint",
  "action": "retry",
  "hint_level": 1,
  "completed": false
}
```

---

## 5. Spec-Driven Development の流れ

このフィーチャーは Spec Kit の成果物に従って実装する。

```
.specify/memory/constitution.md          開発憲章（最優先）
specs/001-handson-lesson-mvp/spec.md     仕様（何を・なぜ）
specs/001-handson-lesson-mvp/plan.md     実装計画（どう作るか）
specs/001-handson-lesson-mvp/tasks.md    タスク分解 ← 実装はここから
```

実装中に仕様の不足に気づいた場合は、コードではなく **spec.md を先に直す**。
