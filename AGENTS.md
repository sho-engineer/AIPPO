# AGENTS.md

AIPPO — AI初心者の会社員が、手を動かして AI の使い方を覚える学習アプリ。

このファイルは `CLAUDE.md` と同じ内容。どのAIから読まれても同じ正本へ
案内するため、両方に置いてある。**仕様そのものはここに書かない。**

## Lesson を作る・直すとき

**先に正本を読む。** ここには仕様を写さない——写すと、片方だけが
更新されて、どちらが本当か分からなくなる。

- `docs/aippo/README.md` … 入口。何がどこにあるか
- `docs/aippo/lesson-creation-sop.md` … 制作の手順
- `docs/aippo/lesson-spec-schema.md` … Lesson Spec の形と、既存データとの関係
- `docs/aippo/lesson-status-rule.md` … 公開状態5つと、参照する場所
- `docs/aippo/lesson-release-gates.md` … 公開の条件と、人の承認
- `docs/aippo/ai-generation-policy.md` … Prompt・失敗時・Privacy
- `docs/aippo/ui-content-rules.md` … 画面・文章・画像・動きの決まり
- `docs/aippo/bug-severity.md` … P0 / P1 / P2
- `docs/aippo/lesson-request-flow.md` … 「Day3を作って」と言われたときの進め方
- `content/lessons/_template.yaml` … Lesson Spec のひな形
- `content/skill-registry.yaml` … AI技の台帳

## 絶対に守ること

- **AI も CI も `published` にしない。** 上げてよいのは `review` まで
- AI が作った Lesson は `draft` から始める
- **Canonical Po を再デザインしない。Po の絵を AI で作り直さない**
- AI技に AIPPO だけの造語を使わない
- 安全の一言（要件 §15）を消さない・文を変えない

## 検査

```bash
cd frontend
npm run validate:lessons   # Lesson Spec
npx tsc --noEmit
npm run lint
npm run test
npm run build
npx playwright test

cd ../backend
.venv/bin/python -m pytest -q
.venv/bin/ruff check .
```

## 構成

```
frontend/   React + Vite + Tailwind。Lesson Player は src/pages/LessonRunner.tsx
backend/    Django REST。教材は apps/catalog/
content/    Lesson Spec と AI技の台帳
docs/aippo/ Lesson 制作の正本
```

教材データは3層。`frontend/src/course/catalog.ts` →
`backend/apps/catalog/seed_catalog.json` → DB。
食い違いは `backend/tests/test_catalog_parity.py` が止める。
