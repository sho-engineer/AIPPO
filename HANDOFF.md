# AIPPO — 引き継ぎ

このZIPは `https://github.com/sho-engineer/AIPPO` へ入れるための一式です。
このセッションからは AIPPO へ push できなかったため（GitHub アクセスが
`sho-engineer/tripix` に固定されており、リポジトリ追加には承認が必要）、
ファイルの形でお渡しします。

**状態: MVP の完成条件（`docs/roadmap.md`）10項目をすべて満たしています。**

---

## 1. push する手順

```bash
# 1. AIPPO を clone する（まだ README しか入っていない状態を想定）
git clone https://github.com/sho-engineer/AIPPO.git
cd AIPPO

# 2. このZIPの中身を展開して上書きする（HANDOFF.md は入れなくてよい）
unzip -o /path/to/aippo.zip -d .
rm -f HANDOFF.md

# 3. コミットして push
git add -A
git commit -m "AIPPO MVP: レッスン1本の通し体験・ポー・操作ログ・E2E"
git push -u origin main
```

`main` へ直接入れたくない場合は、`git switch -c feat/aippo-mvp` してから push してください。

---

## 2. 動かし方

### バックエンド（Django REST）

```bash
cd backend
uv venv && uv pip install -e ".[dev]"
cp .env.example .env
uv run python manage.py migrate
uv run python manage.py runserver 127.0.0.1:8000
```

`.env` の `CORS_ALLOWED_ORIGINS` は **`http://localhost:5173,http://127.0.0.1:5173`
の両方**を入れてください。片方だけだと、もう片方のホストで開いたときに
通信が届かず、しかも画面には何も出ません（実際にこれで詰まりました）。

### フロントエンド（React + Vite）

```bash
cd frontend
npm install
cp .env.example .env
npm run dev          # http://localhost:5173
```

`AI_PROVIDER=stub` のままでも、レッスンは最後まで完走できます。
本物の AI を使うときだけ `backend/.env` に以下を入れてください。

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-opus-5
```

---

## 3. テスト

```bash
cd backend  && uv run pytest        # 58 件
cd frontend && npm run test         # 80 件
cd frontend && npm run test:e2e     # 30 件（PC・スマートフォンの2画面）
```

E2E のうち `e2e/exploratory.spec.ts` は **本物のバックエンド**に当てます。
先に Django を `127.0.0.1:8000` で起動しておいてください
（起動していなければ自動でスキップします）。

CI（`.github/workflows/ci.yml`）は backend / frontend / e2e の3ジョブです。
e2e ジョブは Django を起動して探索テストまで回します。APIキーは不要です。

---

## 4. 確定している設計判断

| # | 論点 | 決定 |
| --- | --- | --- |
| Q-1 | 学習者の識別 | ログイン無し。HttpOnly の `learner_key` Cookie（UUID・90日） |
| Q-2 | 操作ログの中身 | **本文は保存しない**。文字数・ヒント回数・やり直し回数のみ |
| Q-3 | AI実行の上限 | 1セッション10回（`MAX_ATTEMPTS_PER_SESSION`）。超過は 429 |
| Q-4 | ポーの発話量 | 通常100文字、例を出すときのみ150文字 |
| Q-5 | 実行と講評のモデル | `AiRun` と `TutorFeedback` を `Attempt` 1つに統合 |

憲章（`.specify/memory/constitution.md`）の原則 I・II は **交渉不可**です。

- **原則 I 迷わなさ最優先** — 1画面につき「次にやること」は必ず1つ。UIに専門用語を出さない
- **原則 II MVPの範囲を固定** — 検証6項目の外は作らない
- **原則 III 進行はアプリが持つ。ポーは助言だけ** — AI が止まってもレッスンは進む

---

## 5. 残っていること

**必須はこれだけです。**

- `frontend/public/poe/*.svg` の6枚は**仮画像**（丸に目と口だけ）。
  正式なポーの画像に差し替えてください。
  差し替え口は `frontend/src/components/PoeAvatar.tsx` の `POE_IMAGE_EXT` 1か所です。
  WebP を `neutral.webp` … の名前で同じ場所に置き、値を `"webp"` に変えるだけです。
  6枚の表情: `neutral` / `question` / `thinking` / `hint` / `warning` / `celebrate`

**MVP には入れていないもの**（意図的な除外・憲章 原則 II）

- ログイン、複数レッスン、学習プラン、法人向け機能
- Live2D / 音声 / 口パク / 3D / 複数キャラクター
- 本番デプロイ設定（PostgreSQL への切り替えは `backend/config/settings.py` で対応済み）

---

## 6. 探索テストで見つけて直した不具合

スタブではなく本物の Django・DB・Cookie に当てたことで、
実装とユニットテストだけでは気づけない不具合が6件見つかりました。
すべて修正済みで、回帰テストを追加してあります。

| 症状 | 原因 |
| --- | --- |
| 自分の文章で実行したあと振り返りへ進めない | 実行成功後の行き先が固定だった |
| ポーの助言が出ない | `dispatch` 直後の古い状態を読んでいた |
| 通信がまったく届かない（画面には何も出ない） | 接続先ホストの既定が固定・CORS の許可も片方だけ |
| ポーの返事を待つ間の操作が黙って捨てられる | 二重送信の錠前が助言の通信まで覆っていた |
| 進んだ画面が後ろへ引き戻される | 再開の問い合わせが遅れて届き、現在地を上書きしていた |
| 狭い画面でポーが下のボタンのタップを奪う | 画面下部に固定していて重なっていた |

詳細は `docs/aippo-mvp-design.md` の「探索テストで見つかった不具合」にあります。

---

## 7. ドキュメントの読む順

1. `README.md` — 全体像とセットアップ
2. `.specify/memory/constitution.md` — 開発憲章（最優先）
3. `docs/aippo-mvp-design.md` — 設計・影響範囲・進捗・テスト状況
4. `docs/ai-tutor-design.md` — ポーの設計・API契約・レッスン台本
5. `specs/001-handson-lesson-mvp/` — spec / plan / tasks
