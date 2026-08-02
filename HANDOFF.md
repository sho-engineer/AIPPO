# 引き継ぎメモ

このファイルは移設用の一時ドキュメント。**AIPPO へ push したら削除してよい。**

作成日: 2026-08-02

---

## 1. これは何か

**AIPPO（アイッポ）** — AI初心者向けハンズオン学習アプリ。
「AIが気になる。でも、何をすればいいか分からない人へ。」

前のチャットで「AIPPO 開発概要」を受け取り、§20 の依頼
（設計と影響範囲を提示 → 段階的に実装）に沿って Phase 0〜1 を実装したもの。

## 2. なぜ ZIP で渡されたか

作業したセッションが `sho-engineer/Tripix` にスコープ固定されており、
`sho-engineer/AIPPO` へ push できなかった。3経路すべて 403 または承認待ち:

| 経路 | 結果 |
| --- | --- |
| `add_repo`（push権限） | 承認が必要。非対話セッションではダイアログを出せない |
| git push（プロキシ経由） | 403 |
| GitHub REST API | 403（Tripix でさえ 403。API 用トークンではない） |

読み取り（clone）だけは可能で、AIPPO の状態は確認済み（下記 §6）。

## 3. push の手順

AIPPO の `main` には既に `Initial commit`（`# AIPPO` の1行 README）がある。
このZIPの中身とは**履歴が繋がっていない**ため、そのままでは push できない。

### 推奨: ブランチで push して PR を作る

```bash
unzip aippo.zip -d AIPPO && cd AIPPO
git init -b main
git add -A
git commit -m "Initialize AIPPO: Spec Kit, MVP design, Phase 0-1"
git remote add origin https://github.com/sho-engineer/AIPPO.git
git fetch origin
git checkout -b init-aippo
git push -u origin init-aippo
```

GitHub 上で `init-aippo` → `main` の PR を作成し、マージする。
README が競合するので、このZIPの README を採用すること。

### 代替: main を上書きする

`main` は1行 README だけなので、履歴を捨ててよければこちらが簡単。

```bash
unzip aippo.zip -d AIPPO && cd AIPPO
git init -b main
git add -A
git commit -m "Initialize AIPPO: Spec Kit, MVP design, Phase 0-1"
git remote add origin https://github.com/sho-engineer/AIPPO.git
git push -u --force origin main
```

## 4. 現在地

| Phase | 状態 |
| --- | --- |
| 0. 改名・設計判断の反映 | ✅ 完了 |
| 1. 画面モック | ✅ 完了 |
| 2. レッスン状態管理 | 状態機械と画面遷移は完了。用途選択・穴埋め・結果比較の各コンポーネントが未着手 |
| 3. AI文章生成 | 未着手 |
| 4. ポーのフィードバック | API 実装済み |
| 5. ログ取得 | モデルのみ。API 未着手 |
| 6. E2Eテスト | 未着手 |

**テスト**: backend 34 passed / frontend 77 passed / `tsc --noEmit` クリーン /
`vite build` 成功。

## 5. 確定済みの設計判断

「AIPPO 開発概要」を読んだうえで判断が必要だった5点。
すべて推奨案で確定し、実装へ反映済み。詳細は `docs/aippo-mvp-design.md` §3.4。

| # | 論点 | 決定 |
| --- | --- | --- |
| Q-1 | AI活用診断の粒度 | **3問の選択式**に絞る。自由入力・スコアリングなし。`LearnerProfile` は §14 の6項目を定義しつつ MVP で埋めるのは3項目 |
| Q-2 | 操作ログに入力全文を保存するか | **保存しない**。`LearningEvent` は文字数のみ。本文は `Attempt` 側 |
| Q-3 | `User` モデル / ログインの要否 | **導入しない**。匿名 `learner_key`（HttpOnly Cookie, 90日） |
| Q-4 | `hint_level:3` と100文字制限の衝突 | **段階3のみ150文字**まで許容 |
| Q-5 | `Attempt` と `AiRun`/`TutorFeedback` の関係 | **`Attempt` へ統合**（§14準拠）。`model_name`/`token_usage` を追加 |

さらに、指摘した課金リスクへの対応として
**1セッションあたりのAI実行回数に上限**（`MAX_ATTEMPTS_PER_SESSION`、既定10）を実装。

## 6. AIPPO リポジトリの実測状態（2026-08-02 時点）

| 項目 | 値 |
| --- | --- |
| 公開範囲 | public |
| 既定ブランチ | `main` |
| コミット | `Initial commit` 1件のみ |
| ファイル | `README.md`（`# AIPPO` の1行）のみ |
| CI / デプロイ設定 | なし |

## 7. 次のチャットで最初に言うとよいこと

> AIPPO の Phase 2 を進めてください。
> `docs/aippo-mvp-design.md` の §8 実装順序に従い、
> 用途選択・穴埋めフォーム・結果比較の各コンポーネントを実装してください。

`docs/aippo-mvp-design.md` に、責務分担・状態管理・API設計・データモデル・
実装順序・テスト計画（V-01〜V-15）がすべて書いてある。
`.specify/memory/constitution.md`（開発憲章）が最優先のルール。

## 8. まだ決まっていないこと

実装をブロックはしないが、いずれ決める必要がある。

| # | 項目 | 補足 |
| --- | --- | --- |
| 1 | AIプロバイダとモデル | 現状 Anthropic `claude-opus-5` で実装。コスト重視なら `claude-haiku-4-5` |
| 2 | ポーの画像6枚 | `frontend/public/poe/` に配置。規格は同ディレクトリの README。未配置でも動作する |
| 3 | ホスティング先 | Phase 6 の後で必要 |
| 4 | プライバシーポリシー・利用規約 | ユーザーの文章を保存するため公開前に必須 |
| 5 | ユーザーテストの対象者と人数 | |
| 6 | ドメイン（aippo.jp / aippo.app / getaippo.com） | 空き確認が必要 |

また、企画書のロードマップにある **フェーズ1（対面ハンズオン検証）** を
実施済みかどうかが未確認。飛ばす場合、「初心者がどこで止まるか」は
MVP のユーザーテストで初めて分かるため、Phase 6 の後に大きめの
作り直しが入る前提で見ておくのが安全。
