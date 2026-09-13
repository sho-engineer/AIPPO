# 「Day3を作って」と言われたとき

AI（Claude Code / Codex）が Lesson 制作を頼まれたときの進め方。

**ユーザーに中身を考えさせない。** 既存 Course・前後の Lesson・
Skill Registry・公開状況を先に読み、**AI 側から草案を出す**。

---

## 1. 草案を出す

承認は**この草案に対する1回だけ**。細かい文言や技術選択で、毎回
確認を求めない。

前提がどうしても足りないときだけ、**最大3問**まで聞く。

### 草案に必ず含めるもの

```
LESSON            Day n
TITLE
LEARNING GOAL     1つだけ
TARGET USER
AI SKILLS         2〜3個。Registry の id と、new / review / application
既存Skillとの関係  どれが初出で、どれが復習か
SECTIONS          3〜4章。各章に8項目
SECTION FLOW      実践 → 結果 → 気づき → 概念 → 再実行 → 自分の仕事
SAMPLE MATERIAL   教材に使うサンプル文章
AI GENERATION DESIGN  Prompt の設計（入力・指示・条件・出力形式）
IMAGES TO CREATE      作る画像と、その理由
IMAGES NOT NEEDED     作らない画像と、その理由
EXPECTED DURATION
前Lessonとの差     何が新しいか
次Lessonへの接続   何を渡すか
懸念点
```

---

## 2. 承認されたら、最後まで通す

「これで進めて」「実装して」「OK」「この内容で作って」などが来たら、
**1つの制作タスクとして**次を実行する。途中で細かく確認を挟まない。

1. Lesson Spec を確定（`content/lessons/day-N.yaml`）
2. サンプル文章を作る
3. Lesson 内部の Prompt を作る
4. 必要画像を判断する（**作らない判断も記録する**）
5. 必要な画像 Prompt / Asset request を作る
6. 既存 Lesson Player へ実装する
7. 単体テストを書く
8. E2E を書く
9. `npm run validate:lessons`
10. Lint
11. Type check
12. Build
13. E2E
14. Preview 環境を確認
15. iPhone 実ブラウザで完走
16. P0 / P1 / P2 を整理
17. `status` を **`review`** にする（`published` にしない）
18. 完了報告

---

## 画像を作れない環境では

**生成済みとして報告しない。** 代わりに不足Assetとして次を出す。

```
Asset ID          day3-section-01
画像タイプ         Section Intro
使用画面           Day3 / Section 1 の章扉
目的              段が変わったことを伝える
Image prompt      （実際に投げられる文）
サイズ            941 × 1672
背景要件           薄い青のグラデーション。白は使わない
Po Reference      Canonical Po（frontend/public/assets/po/）を参照。
                  作り直さない
```

---

## 報告の決まり

- **実装していないものを、実装済みとして報告しない**
- **実行していないテストを、成功として報告しない**
- **設定していない GitHub 設定を、設定済みとして報告しない**
- Codex Work 用の Skill を Repository に置いても、
  **Work へインストール済みとは報告しない**
