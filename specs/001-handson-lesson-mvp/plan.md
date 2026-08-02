# Implementation Plan: ハンズオンレッスン1本 + AIチューター（MVP）

**Branch**: `001-handson-lesson-mvp` | **Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-handson-lesson-mvp/spec.md`

## Summary

AI初心者が一人で「文章を分かりやすくする」レッスンを完走し、
自分の文章での成果物を得るまでの体験を実装する。

技術的な要点は3つ。

1. **レッスン進行はフロントエンドの決定論的な状態機械（`useReducer`）が所有する**。
   AIは状態を進めない。遷移表に無い遷移は無視して現状態を維持する
2. **チューターの発言を「固定文」と「AI生成」に二分する**。
   固定文はフロントエンドのコンテンツデータ、AI生成は `POST /api/tutor/feedback/` 経由
3. **AIプロバイダはバックエンドのサービスクラスへ隔離する**。
   ビュー層はプロバイダを知らない。障害時は固定ヒントへフォールバックし、レッスンは止めない

## Technical Context

**Language/Version**: Python 3.12（backend） / TypeScript 5.5（frontend）

**Primary Dependencies**: Django 5 + Django REST Framework（backend） /
React 18 + Vite + Tailwind CSS（frontend）

**Storage**: PostgreSQL（本番） / SQLite（ローカル開発）

**Testing**: pytest + pytest-django（backend） / Vitest + Testing Library（frontend） /
Playwright（E2E、AIはスタブ応答）

**Target Platform**: モダンブラウザ（PC / スマートフォン）。Linux サーバーで配信

**Project Type**: Web application（backend + frontend の2プロジェクト構成）

**Performance Goals**: チューターのフィードバック応答が p95 5秒以内（SC-006）。
レッスン本体のAI実行は 30秒でタイムアウト

**Constraints**: AI障害時もレッスン完走可能（SC-005）。
チューターのメッセージは100文字以内。外部送信フィールドは最小限（FR-024）

**Scale/Scope**: MVPはレッスン1件・9ステップ・画面4種類。β利用者 数十〜数百名規模

## Constitution Check

*GATE: Phase 0 research の前に通過必須。Phase 1 design の後に再確認する。*

| 原則 | ゲート | 本計画での担保 |
| --- | --- | --- |
| I. 迷わなさ最優先 | 各状態の「次の行動」が1つに定まるか | 状態機械の各状態に `primaryAction` を1つだけ定義。コンテンツデータで管理し、レビュー時に確認 |
| II. MVPスコープ固定 | 検証項目6点に寄与しない機能が無いか | spec の Out of Scope に列挙。本計画は該当機能を一切含まない |
| III. フローはアプリ、AIは補助 | AIが状態を進めないか | 遷移は reducer のみが実行。API レスポンスの `action` はヒント表示の材料であり、遷移の実行権を持たない |
| IV. 固定文とAI生成の分離 | 文言の出所が明確か | 固定文は `frontend/src/content/lessons/*.json`。AI生成は API 経由のみ |
| V. 検証可能性 | reducer / serializer / API / E2E にテストがあるか | tasks.md で各実装タスクにテストタスクを対にする |
| VI. データ最小化 | 外部送信・ログが最小限か | プロバイダへ渡すのは組み立て済みの指示文のみ。ログに `user_input` の本文を出さない |

**判定**: 違反なし。Complexity Tracking は空。

## Project Structure

### Documentation (this feature)

```text
specs/001-handson-lesson-mvp/
├── spec.md              # 仕様
├── plan.md              # 本ファイル
├── research.md          # Phase 0 出力
├── data-model.md        # Phase 1 出力
├── quickstart.md        # Phase 1 出力
├── contracts/
│   └── tutor-feedback.md  # API 契約
└── tasks.md             # Phase 2 出力
```

### Source Code (repository root)

```text
backend/
├── config/                     # Django プロジェクト設定
│   ├── settings.py
│   └── urls.py
├── apps/
│   ├── lessons/                # レッスン定義・学習セッション・学習イベント
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   └── urls.py
│   └── tutor/                  # チューターのフィードバック
│       ├── serializers.py      # 入出力の検証（契約の実体）
│       ├── views.py            # POST /api/tutor/feedback/
│       ├── prompts.py          # ステップ別のAI指示・評価項目
│       ├── fallbacks.py        # ステップ別の固定ヒント
│       ├── urls.py
│       └── services/
│           ├── base.py         # AiProvider インターフェース
│           ├── provider.py     # 実プロバイダ実装
│           ├── stub.py         # 開発・テスト用のスタブ
│           └── feedback.py     # フィードバック生成のオーケストレーション
├── tests/
│   ├── test_tutor_api.py
│   ├── test_tutor_feedback_service.py
│   └── test_lessons_api.py
├── manage.py
└── pyproject.toml

frontend/
├── public/
│   └── tutor/                  # neutral / question / thinking / hint / warning / celebrate
├── src/
│   ├── components/
│   │   ├── PoeAvatar.tsx
│   │   ├── FillInForm.tsx
│   │   ├── ResultCompare.tsx
│   │   └── PrimaryAction.tsx
│   ├── lesson/
│   │   ├── machine.ts          # 状態・遷移表
│   │   ├── reducer.ts          # useReducer 本体
│   │   └── useLesson.ts        # reducer + API 呼び出しの結線
│   ├── api/
│   │   └── tutor.ts            # fetch + AbortController + 二重送信防止
│   ├── content/
│   │   ├── lessons/rewrite_text_001.json
│   │   └── ui.ts               # 固定文言（ボタン・エラー・案内）
│   ├── types/
│   │   └── tutor.ts            # TutorEmotion / TutorAction / TutorMessage
│   └── pages/
│       └── LessonPage.tsx
├── tests/
│   ├── PoeAvatar.test.tsx
│   └── reducer.test.ts
├── e2e/
│   └── lesson.spec.ts          # Playwright
└── package.json
```

**Structure Decision**: 憲章の Technology Constraints に従い、
`backend/`（Django REST）と `frontend/`（React + Vite）の2プロジェクト構成を採る。

理由:

- レッスン進行はクライアント側の状態機械で完結させたい（オフライン耐性とレスポンスのため）が、
  AIプロバイダの資格情報はサーバー側に置く必要がある
- 教材データ（`content/lessons/*.json`）はフロントエンドに置き、
  レッスン追加でバックエンドの変更を不要にする（憲章 Technology Constraints）
- 学習イベントの永続化はサーバー側に置き、分析用のデータをまとめて持つ

## Phase 0: Research

`research.md` で以下を確定させる。

1. AIプロバイダの選定と、構造化出力（JSON固定形式）の取得方法
2. タイムアウト・リトライ・レート制限時の扱い
3. 学習イベントの最小スキーマ（MVP検証項目6点との対応）
4. 匿名利用の識別方法（MVPで認証を簡易にするための手段）

## Phase 1: Design

1. `data-model.md` — エンティティとフィールド、状態遷移表
2. `contracts/tutor-feedback.md` — API 契約（リクエスト・レスポンス・エラー）
3. `quickstart.md` — ローカル起動手順

**Constitution 再確認**: Phase 1 完了後、上記のゲート表を再度確認する。

## Complexity Tracking

> Constitution Check に違反が無いため、記載事項なし。
