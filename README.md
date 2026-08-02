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

**Phase 1 完了**（画面モック）。次は Phase 2（レッスンの各コンポーネント）。

トップ → AI活用診断（3問）→ おすすめ用途 → レッスン画面 まで、
AI を使わない固定レスポンスで通しの導線が動きます。

最初のレッスンは **「AIに文章を分かりやすくしてもらう」** の1本のみ。
まず1レッスンを最後まで完成させます。

| Phase | 状態 |
| --- | --- |
| 0. 移設準備・改名・設計判断の反映 | ✅ 完了 |
| 1. 画面モック | ✅ 完了 |
| 2. レッスン状態管理 | ✅ 完了 |
| 3. AI文章生成 | ✅ 完了 |
| 4. ポーのフィードバック | ✅ 完了 |
| 5. ログ取得 | ✅ 完了 |
| 6. E2Eテスト | ✅ 完了 |

**MVP の完成条件（[`docs/roadmap.md`](docs/roadmap.md)）は全10項目を満たしています。**
残るのは仮画像のポー6枚を正式な画像に差し替えることだけです。

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

## セットアップ

### バックエンド（Django REST）

```bash
cd backend
uv venv && uv pip install -e ".[dev]"
cp .env.example .env
uv run python manage.py migrate
uv run python manage.py runserver 8000
```

`AI_PROVIDER=stub` のままでもレッスンは完走できます。

### フロントエンド（React + Vite）

```bash
cd frontend
npm install
cp .env.example .env
npm run dev          # http://localhost:5173
```

### テスト

```bash
cd backend  && uv run pytest        # 58 tests
cd frontend && npm run test         # 80 tests
cd frontend && npm run test:e2e     # Playwright（AI はスタブ応答）
```

E2E は **PC（Chrome）と スマートフォン（Pixel 5）の2画面** で回します。

#### 探索テスト（本物のバックエンドに当てる）

`e2e/exploratory.spec.ts` だけは API をスタブせず、実際の Django・DB・Cookie を通します。
スタブでは見つからない不具合（接続先のずれ・Cookie・同時実行・重なり）を拾うためのものです。

```bash
# 別のターミナルで Django を起動しておく
cd backend && uv run python manage.py runserver 127.0.0.1:8000

cd frontend && npm run test:e2e
```

Django が起動していないときは自動でスキップします。
`AI_PROVIDER=stub` のままで完走できることを確かめるので、APIキーは不要です。

---

## 構成

```
.specify/          Spec Kit（憲章・テンプレート・スクリプト）
.claude/skills/    /speckit-* スキル
.github/workflows/ CI
docs/              設計・事業ドキュメント
specs/             フィーチャー別の spec / plan / tasks
backend/           Django REST Framework
  apps/lessons/    LearningSession / Attempt / LearningEvent / SkillProgress / Survey
  apps/profiles/   LearnerProfile（AI活用診断）
  apps/tutor/      ポーのフィードバックAPI・プロンプト・プロバイダ抽象
frontend/          React + TypeScript + Vite + Tailwind
  src/lesson/      状態機械と useReducer
  src/components/  PoeAvatar ほか
  src/content/     固定文言・レッスン教材JSON
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
資格制度 / 多言語 / 高度なAI自動採点 / ベンダー別コース /
自由な教材生成 / 決済機能

将来構想は [`docs/business-plan.md`](docs/business-plan.md) に記録しますが、
**将来像は広げても、最初のプロダクトは広げません。**
