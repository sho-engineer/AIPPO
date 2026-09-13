# Lesson Creation SOP

Lesson を1本作るまでの手順。**毎回この順で進める。**

```
設計 → 素材 → 実装 → 自動テスト → 実ブラウザQA → Review → Release
```

Release だけは人が決める。AI も CI も `published` にしない
（[lesson-release-gates.md](lesson-release-gates.md)）。

---

## 0. 先に、いま動いているものを見る

**古い仕様書だけを正にしない。** 設計文書は書かれた日の姿で止まる。
Lesson は前後とつながっているので、隣が変わっていれば合わせ方も変わる。

作る前に、実際に動いているものを通す。

| 見るもの | どこ |
|---|---|
| Home | `frontend/src/pages/HomePage.tsx` |
| Course | `frontend/src/components/course/CourseOutline.tsx` |
| 前後の Lesson | 実際に開いて通す |
| Day1 の最新UI | `frontend/src/course/day1Steps.ts` |
| Day2 の最新UI | `frontend/src/course/day2Steps.ts` |
| Lesson Player | `frontend/src/pages/LessonRunner.tsx` |
| Section Intro | `frontend/src/components/course/SectionTransition.tsx` |
| AI生成画面 | `frontend/src/components/course/steps/Generating.tsx` |
| Result / Compare | `steps/Results.tsx` / `steps/Compare.tsx` |
| Skill Get | `frontend/src/components/course/day1/SkillRecap.tsx` |
| Completion | `steps/Completion.tsx` / `DayCompletePage.tsx` |
| Home への復帰 | 完了画面の主ボタンが「ホームに戻る」であること |

---

## 1. 設計

### できるようになることを、1つだけ決める

> Lesson が終わったとき、ユーザーが**何を1つ**できるようになるか

2つ書きたくなったら、それは Lesson 2本ぶん。分ける。

### AI技を2〜3個決める

- `content/skill-registry.yaml` にある id を使う。無ければ**先に台帳へ足す**
- **実在する一般的な言葉**にする。AIPPO だけの造語にしない
  ——ここで覚えた言葉が外の記事や同僚との会話で通じないと、
  このアプリの中でしか使えない知識になる
- 既存 Lesson と重なっていないか台帳で確かめる
- 重なる場合は `review`（復習）か `application`（応用）と書く

### 章立てを3〜4章にする

**基本の流れは、実践から始める。説明から始めない。**

```
実践 → 結果を見る → 変化に気づく → 概念を知る
     → もう一度使う → 自分の仕事で使う
     → Skill Get → Completion → Home
```

各章に、次の8つを**すべて**書く。1つでも欠けると、作る人が何を
書けばよいか決められない（Validator が Error にする）。

| 項目 | 何を書くか |
|---|---|
| SECTION NAME | 章の名前 |
| USER GOAL | この章で、学習者が何をできるようになるか |
| WHAT USER DOES | 学習者の操作 |
| WHAT AI DOES | AI が何をするか |
| EXPECTED OUTPUT | 返ってくるもの |
| WHAT USER NOTICES | 学習者が気づくこと |
| LEARNING TAKEAWAY | 持ち帰る1行 |
| NEXT ACTION | 次に何をするか |

### Spec に書き出す

`content/lessons/_template.yaml` を写して `content/lessons/day-N.yaml` を作る。
形は [lesson-spec-schema.md](lesson-spec-schema.md)。

---

## 2. 素材

- **サンプル文章**: 仕事で本当にありそうなもの。短すぎると変化が出ない
- **Prompt**: 決まりは [ai-generation-policy.md](ai-generation-policy.md)
- **画像**: 作る／作らないの**両方を記録する**。決まりは
  [ui-content-rules.md](ui-content-rules.md)。画像が情報を増やすだけなら作らない

画像生成にアクセスできない環境では、**生成済みとして報告しない**。
代わりに不足Assetとして次を出す。

```
Asset ID / 画像タイプ / 使用画面 / 目的 /
Image generation prompt / サイズ / 背景要件 / Canonical Po の Reference要件
```

---

## 3. 実装

**既存の Lesson Player を使う。** Lesson ごとの独自UIを作らない。

| 作り方 | いつ使うか |
|---|---|
| 骨格（`course/shared.ts` の `buildLessonFlow`） | 既定。材料を渡すだけで19画面が組める |
| 手書き（`course/day1Steps.ts` / `day2Steps.ts` の形） | 骨格では表せない並びのときだけ |

手書きにするなら、理由をファイルの頭に書く。

**手書きは例外ではなくなってきている。** Day1・Day2 はどちらも骨格を
離れた——理由も同じで、骨格は**条件を足すのが1回**しかなく、技を
2つ以上渡す回では「足したら何が変わったか」を見せ切れない。
4つの段に分けて段ごとに1つ足す形（Day1・Day2 の並び）が、いまのところ
いちばん通る。新しい Lesson は、まずそちらを見てから決める。

検査を書くときは、**どの Lesson が骨格型かを名前で決め打ちにしない**。
骨格の形を見る検査は `flowLessonId()`（`e2e/support/openLessons.ts`）や
並びからの判定で選ぶ——名前で書くと、Lesson を1本手書きにするたびに
検査の側を書き替えることになり、見ているものが「前回どれだったか」に
なる。

変えたら3層をそろえる。

```bash
cd frontend && node dump-catalog.mjs   # catalog.ts → catalog-snapshot.json
# snapshot の該当 Lesson を backend/apps/catalog/seed_catalog.json へ反映
cd ../backend && .venv/bin/python -m pytest tests/test_catalog_parity.py
```

---

## 4. 自動テスト

```bash
cd frontend
npm run validate:lessons   # Lesson Spec
npx tsc --noEmit           # 型
npm run lint               # Lint
npm run test               # 単体
npm run build              # Build
npx playwright test        # E2E

cd ../backend
.venv/bin/python -m pytest -q
.venv/bin/ruff check .
```

---

## 5. 実ブラウザQA

iPhone 相当で、**開始から Home 復帰まで通す**。

| サイズ | 何の端末か |
|---|---|
| 320 × 568 | いちばん小さい |
| 375 × 667 | iPhone SE |
| 390 × 844 | iPhone 12〜14 |
| 430 × 932 | Pro Max |

見るもの: Layout Shift / Text Flash / Card内Scroll / CTA が画面外へ出ないこと /
Back が直前の状態へ戻ること / Close が開いた元の画面へ戻ること。

---

## 6. Review

- `status` を `review` にする（**`published` にしない**）
- P0 / P1 / P2 を整理する（[bug-severity.md](bug-severity.md)）
- 完了報告を書く

---

## 7. Release

[lesson-release-gates.md](lesson-release-gates.md) の条件を満たし、
**人が承認したときだけ** `published` にする。
