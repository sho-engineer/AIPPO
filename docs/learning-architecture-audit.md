# 学習構造の監査（Phase 1）

「AIPPO — Learning Architecture, Tips/Recipes, Rewards, and AI Provider
Strategy」で示された10フェーズのうち、Phase 1（既存 Course / Lesson
データ構造の監査）の結果と、Phase 2以降への引き継ぎ事項をまとめる。

実データを見て判断したことが1つある: **Lesson の複数 Path 再利用は、
いま着手する理由がまだ無い**（下記「今すぐ着手しない理由」）。
やらない判断ではなく、順番を後ろにする判断。

## 1. いまの構造

```
Course (backend/apps/catalog/models.py)
├── slug, title, description, difficulty
├── access_type / status / availability_status（コース単位）
└── lessons: Lesson[]  ← ForeignKey（1コースにしか属せない）
      ├── slug（グローバルに一意）, number, title, goal
      ├── template: outcome_first | custom
      ├── availability_status（レッスン単位。コースとは別）
      └── steps: LessonStep[]
```

- フロントは起動時に `GET /api/v1/catalog/` を1回だけ読み、`live.ts` の
  `all` / `current` に入れる。届かない環境向けに `catalog.ts` へ
  Foundation コース1本ぶんを同梱してある（オフラインでも完走できる）。
- 進捗（`completedIds`）は **レッスン id 単位のフラットな集合**
  （`aippo:completed` → `{lessons: string[]}`）で、コースに紐付いていない。
  → これは Phase 2-3 にとって好都合。Lesson がどのコース（Path）から
    開かれても、完了記録は共有される。進捗まわりの変更は要らない。

## 2. 実データで見た現状

```
first_step_7days      published / available     9 レッスン（全て中身あり）
work_writing          published / coming_soon    4 レッスン（steps 0）
summarize_organize    published / coming_soon    4 レッスン（steps 0）
make_images           published / coming_soon    5 レッスン（steps 0）
expand_ideas          published / coming_soon    4 レッスン（steps 0）
better_answers        published / coming_soon    4 レッスン（steps 0）
safe_at_work          published / coming_soon    3 レッスン（steps 0）

レッスン合計 33、slug の重複 0
```

いま中身があるのは Foundation コース（`first_step_7days`）1本だけ。
残り6コースは題名・目標だけを予約した空の骨組み（Phase 13 の成果物）。

## 3. 仕様（§2, §22）とのギャップ

| 仕様の要求 | いまの状態 | ギャップ |
| --- | --- | --- |
| Lesson を複数 Learning Path から再利用できる（複製しない） | `Lesson.course` は ForeignKey。1レッスンは1コースにしか属せない | ある。ただし**まだ実害が出ていない**（下記） |
| 呼び名は Skill / Learning Path / Stamp / Credit | 画面・テストとも「コース」表記 | ある。UI文言と E2E の assertion 文字列を広く書き換える作業 |
| Recipe が `category` を持つ | `appliedTips.ts` に `id/title/description/requiredLessonIds/flow/accessLevel/order` はあるが `category` が無い | ある（本コミットで追加） |
| Stamp が Path 単位 | 実装は Course 単位（`milestones.ts`）。ただし今は Course = Path 相当の唯一の単位なので、意味は一致している | 名前だけの差。Path 概念を導入したら追従が要る |

## 4. 今すぐ着手しない理由（Lesson の複数 Path 再利用）

Lesson を「複数 Path から参照できる」形にするには、`Lesson.course` の
ForeignKey を Course-Lesson の中間テーブル（並び順を Path 側に持たせる
必要があるため）に置き換える、本番データベースのマイグレーションが要る。
これは:

- 本番で稼働中のスキーマを変える（"must not break" の対象：
  Django Admin 教材登録・既存の進捗・レッスン状態）
- 中間テーブルへ移すときの並び順（`sort_order` / `number` は
  いまレッスン側にある）の移設方法に、複数のやり方がある

一方で、実データが示すとおり **再利用が要る場面がまだ1件も無い**
（中身のあるレッスンは9本とも Foundation コース専用。他の6コースは
空の骨組みで、Foundation のレッスンを借りる設計にもなっていない）。

推測でスキーマを1回変えるより、実際に「このレッスンを2つ目の Path が
要る」という具体的な要求が出た時点（=どこかのコースへ本当に中身を
入れる作業をする時点）で、その要求に合わせて中間テーブル化するほうが、
移設方法を誤る可能性が低い。**Phase 2-3 は次にコース本文を作るときに
合わせて着手する**、という順番の変更を提案する。

## 5. 進めたこと（本コミット）

- Gemini プロバイダを追加し、既定にした（Phase 8, 9）
- Recipe（`AppliedTip`）に `category` を追加（Phase 4 の一部）

## 6. 未着手（次の一手として残す）

- Phase 2-3: Lesson の複数 Path 再利用（上記の理由で保留。次にコース
  本文を作る作業と合わせる）
- Phase 6-7: Stamp / Credit の formal 化（Stamp と Credit の区別、
  earn 条件の重複防止）— 現行の `milestones.ts` は近い形をすでに持つが、
  「Lesson完了 / 実践課題完了 / Recipeを試した / Path内Challenge完了」
  という4種の earn 条件はまだ1種（レッスン完了）のみ
  → 未着手（今のスタンプラリー実装が Course=Path 前提のため、
    Path 概念の導入と合わせて設計し直すのが自然）
- Phase 10: AI Cost Tracking（`AIUsage` は取れているが永続化していない）
