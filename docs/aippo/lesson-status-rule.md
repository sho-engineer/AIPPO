# Lesson の公開状態

## 5つの状態

| 状態 | 一覧に出る | 始められる | 意味 |
|---|---|---|---|
| `draft` | ✗ | ✗ | AI か開発者が作成中 |
| `review` | ✗ | ✗ | CI を通ったあと、人の確認待ち |
| `coming_soon` | ✓ | ✗ | まだ。リリース判定が済めば開く |
| `published` | ✓ | ✓ | 一般ユーザーが始められる |
| `paused` | ✓ | ✗ | 公開後の緊急停止。原因を直すまで開かない |

`coming_soon` と `paused` は、学習者から見ると同じ（どちらも「準備中」
の札で、押しても開かない）。違うのは**こちら側の事情**で、戻すときの
判断が変わる。

## いまの状態

| Lesson | 状態 |
|---|---|
| AI活用診断 | `published` |
| Day1 文章を分かりやすくする | `published` |
| Day2 以降 | `coming_soon` |

決めているのは**2か所だけ**。

```
backend/apps/catalog/release_seeding.py   RELEASE_COMING_SOON  ← 本物
frontend/src/course/catalog.ts            RELEASE_COMING_SOON  ← 控え
```

控えは通信が届かないときにだけ使う。API が返した値が常に優先される。
2つが食い違っていないことは
`backend/tests/test_first_release_catalog.py::test_the_two_release_gates_agree`
が見張る（片方だけ直すと、圏外で見た人と繋がった人に別の並びが出る）。

## 1本公開するとき

1. 上の2ファイルから slug を1行ずつ消す
2. `frontend/tests/comingSoon.test.tsx` と
   `backend/tests/test_first_release_catalog.py` の期待値を更新
3. Spec の `status` を `published` にし、`release.*` を埋める
4. `npm run validate:lessons`

**画面側は1つも触らない。**

## 判定を書き写さない

公開状態を見る場所は9つあるが、**判定はすべて1か所を通る**。

| 場所 | 通る道 |
|---|---|
| Home / 今日のつづき | `startableLessons()` |
| Course / Lesson Card | `isComingSoon()` |
| 次のおすすめ | `nextLessons()` |
| AI活用診断 | `recommendPlan()` |
| Lesson Completion | `nextLessons()` |
| Lesson Player / 直接URL | `App.tsx` の `openLesson()` |
| Progress の分母 | `startableLessons()` |
| サーバー（最後の砦） | `apps/catalog/access.py` |

frontend は `src/course/availability.ts`、backend は
`apps/catalog/access.py`。画面ごとに `availability === "coming_soon"`
と書くと、**必ずどれかが古くなる**——押せるボタンが1つ残るだけで、
始められないはずの教材が始まる。

`isStartable()` は **`available` だけを通す**。「近日公開でなければ
始められる」と書くと、状態が1つ増えるたびに穴が開く（`paused` を
足したときに実際そうなった）。

## 未公開 Lesson が満たすこと

- Lesson Player を開始できない
- 開始CTAを表示しない
- 完了状態に変更できない
- 次の Lesson として自動開始しない
- URL 直接入力でも開始できない
- 診断結果から開始できない
- **全体進捗の分母に入らない**

E2E が見る: `frontend/e2e/releaseGate.spec.ts`。
サーバー側は `backend/tests/test_coming_soon.py`。

## 終えたことは、あとから消さない

公開範囲を狭めたとき、**すでに終えた Lesson の記録は残す**。

- 教材の行は「準備中」ではなく「完了」を出す（`LessonTimeline` の `statusOf`）
- 節目のまとめは、終えた Lesson の到達点を数える（`CourseCheckpoint`）

リリース範囲はこちら側の都合で、やったことは本人のもの。
