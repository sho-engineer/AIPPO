# AIPPO Lesson 制作の正本

Lesson を作るときの決まりは、**ここが正本**。

Claude Code も Codex も開発者も、同じものを読む。特定のAIだけが読む
ファイル（`CLAUDE.md` / `AGENTS.md`）に仕様を書かない——片方だけが
更新され、どちらが本当か分からなくなるため。あの2つは**ここへの
道案内**だけを持つ。

## 読む順

| # | ファイル | 何が書いてあるか |
|---|---|---|
| 1 | [lesson-creation-sop.md](lesson-creation-sop.md) | 制作の手順。設計から Review まで |
| 2 | [lesson-spec-schema.md](lesson-spec-schema.md) | Lesson Spec の形と、既存データとの関係 |
| 3 | [lesson-status-rule.md](lesson-status-rule.md) | 公開状態5つと、参照する場所 |
| 4 | [lesson-release-gates.md](lesson-release-gates.md) | 公開の条件と、人の承認 |
| 5 | [ai-generation-policy.md](ai-generation-policy.md) | Prompt の決まり・失敗時・Privacy |
| 6 | [ui-content-rules.md](ui-content-rules.md) | 画面・文章・画像・動きの決まり |
| 7 | [bug-severity.md](bug-severity.md) | P0 / P1 / P2 の分け方 |

## データの置き場

| 置き場 | 中身 |
|---|---|
| `content/skill-registry.yaml` | AI技の台帳。全Lesson共通 |
| `content/lessons/*.yaml` | Lesson Spec（設計書＋検査対象） |
| `content/lessons/_template.yaml` | 新しい Lesson のひな形 |

## 検査

```bash
cd frontend && npm run validate:lessons
```

Error が1件でもあれば CI が止まる。Warning は読んで判断する
（機械に決められないことは Error にしない）。

## 実装の正本は、ここではない

Lesson の**中身そのもの**は、いまも次の3層が正本。

```
frontend/src/course/catalog.ts          同梱データ（通信が届かないときの控え）
        ↓ dump-catalog.mjs
backend/apps/catalog/seed_catalog.json  取り込み用
        ↓ seed_catalog command
DB（apps/catalog/models.py）            配信されるもの
```

Lesson Spec はこの3層の**上に乗る設計書**で、4層目の正本ではない。
同じ内容を3か所へ書かないため。関係と同期のしかたは
[lesson-spec-schema.md](lesson-spec-schema.md)。
