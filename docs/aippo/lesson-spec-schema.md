# Lesson Spec の形と、既存データとの関係

## 形式は YAML

`content/lessons/*.yaml`。ひな形は `content/lessons/_template.yaml`。

**なぜ YAML か。** Spec は人と AI が手で書き換える前提のもので、章ごとの
短い文が大量に並ぶ。JSON だと引用符と読点で埋まり、書き換えるたびに
構文を壊す。既存の `seed_catalog.json` が JSON なのは**機械が書く**
ファイルだからで、役が違う。

**依存を1つ足した。** `yaml`（devDependency）。理由はこれだけで、
実行時のバンドルには入らない（Validator は Node で動く）。

---

## Spec は正本ではない

Lesson の中身そのものは、いまも次の3層が正本。

```
frontend/src/course/catalog.ts          同梱データ（通信が届かないときの控え）
        ↓ node dump-catalog.mjs
backend/apps/catalog/seed_catalog.json  取り込み用
        ↓ python manage.py seed_catalog
DB（apps/catalog/models.py）            配信されるもの
```

Spec を4層目の正本にすると、**同じ内容を3か所へ書く**ことになる。
だから Spec が持つのは、実装に**書けないもの**と、実装から**読み取れ
ないもの**だけにしてある。

| Spec が持つ | 実装が持つ |
|---|---|
| なぜこの章立てか（8項目） | 画面の並び（steps） |
| 学習目標を1つに絞った結果 | 画面の文言 |
| AI技の id と usage（new / review / application） | 技の表示名（learnedSkills） |
| Prompt の設計意図・失敗時の扱い | 実際の aiAction |
| 画像を**作らないと決めた**記録 | 画像のパス |
| QA と Review の記録 | — |

## 同期のしかた

**片方向。** Spec を直しても実装は変わらないし、その逆も無い。
食い違いは Validator が見つける。

```bash
cd frontend && npm run validate:lessons
```

| Spec | 実装 | 判定 |
|---|---|---|
| `title` | `Lesson.title` | 一致しなければ **Error** |
| `day` | `Lesson.number` | 一致しなければ **Error** |
| `implementation_id` | `Lesson.id` | 見つからなければ **Error** |
| `status` | `Lesson.availability` | 食い違えば **Error** |
| `ai_skills[].id` → 台帳の `label` | `Lesson.learnedSkills` | 台帳の名前が実装に無ければ **Error** |
| `sections` の数 | 章扉（`section_transition`）の数 | 章扉があるのに数が違えば **Error** |
| `estimated_minutes` | `Lesson.estimatedMinutes` | 違えば Warning |
| `assets` のパス | `frontend/public/` | 無ければ **Error** |

新しい Lesson を作るときは **Spec が先**、実装があと。すでに動いて
いる Lesson は、実装から Spec を起こす（`content/lessons/day-1.yaml`
がその例）。

---

## 状態の対応

Spec の `status` は5つ、Django の Model は2つの列で持つ。

| Spec `status` | `Lesson.status` | `Lesson.availability_status` |
|---|---|---|
| `draft` | `draft` | — |
| `review` | `review` | — |
| `coming_soon` | `published` | `coming_soon` |
| `published` | `published` | `available` |
| `paused` | `published` | `paused` |

列が2つあるのは、**「一覧に出すか」と「始められるか」が別のこと**
だから。1つにまとめると「近日公開のつもりが一覧から消える」か
「書きかけが始められる」のどちらかになる（`models.py` の註）。

意味と遷移は [lesson-status-rule.md](lesson-status-rule.md)。
