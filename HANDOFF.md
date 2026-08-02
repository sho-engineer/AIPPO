# AIPPO — 引き継ぎ

このZIPは `https://github.com/sho-engineer/AIPPO` へ入れるための一式です。
このセッションからは AIPPO へ push できなかったため（GitHub アクセスが
`sho-engineer/tripix` に固定されており、リポジトリ追加には承認が必要）、
ファイルの形でお渡しします。

**状態: MVP の完成条件を満たしたうえで、公開に向けた地固めまで済んでいます。**
残る必須作業は**ポーの正式な画像への差し替えだけ**です。

---

## 1. push する手順

```bash
git clone https://github.com/sho-engineer/AIPPO.git
cd AIPPO

unzip -o /path/to/aippo.zip -d .
rm -f HANDOFF.md          # これはリポジトリに入れなくてよい

git add -A
git commit -m "AIPPO: レッスン1本の通し体験・ポー・操作ログ・本番設定"
git push -u origin main
```

`main` へ直接入れたくない場合は `git switch -c feat/aippo-mvp` してから push してください。

---

## 2. 動かす

```bash
cp .env.docker.example .env
# .env の DJANGO_SECRET_KEY と POSTGRES_PASSWORD を埋める
#   python -c "import secrets; print(secrets.token_urlsafe(48))"

docker compose up --build
```

| | 場所 |
| --- | --- |
| 画面 | http://localhost:5173 |
| 管理画面 | http://localhost:8000/admin/ |
| 死活監視 | `/healthz`（DBを見ない） `/readyz`（DBを見る） |

管理者を作る:

```bash
docker compose exec backend python manage.py createsuperuser
```

`AI_PROVIDER=stub` のままでもレッスンは完走できるので、APIキー無しで試せます。
本物の AI を使うときだけ `.env` に `AI_PROVIDER=anthropic` と
`ANTHROPIC_API_KEY=sk-ant-...` を入れてください。

> **注意**: この環境では Docker Hub へ接続できなかったため、
> **イメージのビルドだけは実行できていません**。
> 代わりに、Dockerfile が実行するのと同じ手順
> （`collectstatic` → `migrate` → gunicorn 起動）を素の環境で通し、
> 死活監視・管理画面・静的ファイル配信・セキュリティヘッダ・API・
> 未知のホスト名の拒否まで動作を確認しています。
> CI にもイメージのビルドを入れてあるので、最初の push で検証されます。

---

## 3. 公開する前に必ず確認すること

- `DJANGO_SECRET_KEY` を50文字以上の乱数にする（開発用のままだと**起動しません**）
- `DJANGO_ALLOWED_HOSTS` に実際のドメインを入れる（未設定だと**起動しません**）
- `SECURE_SSL_REDIRECT=true` に戻す
- ロードバランサ配下に置くなら `TRUST_FORWARDED_FOR=true`
  （設定しないと、接続元単位の実行回数の上限が全員まとめて数えられます）
- **`AI_RUNS_PER_DAY` を予算に合わせる。これが最後の安全弁です**

```bash
docker compose exec backend python manage.py check --deploy   # 無警告になること
```

### AI利用料の上限（三段構え）

`learner_key` は Cookie なので、消せばセッション上限は回避できます。
そのままだと公開した瞬間に利用料が青天井になるため、三段で止めています。

| 段 | 環境変数 | 既定 | 目的 |
| --- | --- | --- | --- |
| セッション単位 | `MAX_ATTEMPTS_PER_SESSION` | 10 | 1回の練習での試行錯誤の範囲 |
| 接続元単位・1日 | `AI_RUNS_PER_IP_PER_DAY` | 100 | 1人が使いすぎるのを止める |
| 全体・1日 | `AI_RUNS_PER_DAY` | 2000 | 想定外でも請求が跳ねない |

0以下にすると「上限なし」。レッスン1本の完走に必要なAI実行は 10〜12回です。

**IPアドレスは保存していません。** `SECRET_KEY` を鍵にした HMAC だけを持ちます
（憲章 原則 VI）。上限に達してもポーは固定ヒントを返し、レッスンは止まりません。

---

## 4. テスト

```bash
cd backend  && uv run pytest        # 112 件
cd frontend && npm run test         # 86 件
cd frontend && npm run test:e2e     # 52 件（PC・スマートフォンの2画面）
```

E2E は3種類あります。

| ファイル | 何を見るか |
| --- | --- |
| `e2e/lesson.spec.ts` | 通しの導線。APIはスタブに差し替える |
| `e2e/a11y.spec.ts` | アクセシビリティ（WCAG 2.1 A/AA の自動検査） |
| `e2e/exploratory.spec.ts` | **本物のバックエンド**に当てる探索テスト |

探索テストの前には Django を起動しておいてください。
テストは全部おなじ接続元から来るので、接続元単位の上限は外します。

```bash
cd backend && AI_RUNS_PER_IP_PER_DAY=0 AI_RUNS_PER_DAY=0 \
  uv run python manage.py runserver 127.0.0.1:8000
```

`E2E_TARGET=build` を付けると、開発サーバーではなく本番と同じビルド成果物に
当たります（CI はこちら）。開発サーバーでしか見ないと、
ビルドしたときだけ壊れるものを取りこぼします。

CI（`.github/workflows/ci.yml`）は backend / frontend / e2e / deploy-config の4ジョブです。

---

## 5. 実証実験のデータを見る

`/admin/lessons/verificationsummary/` に集計を1画面でまとめてあります。

- レッスン完了率（**まず見るところ**）
- どの画面で止まっているか — 同じ画面に人が溜まっていたら、そこが迷わせている場所
- AI実行回数・失敗数・ポーが固定文で答えた回数・平均の待ち時間・使ったトークン
- アンケートの集計

学習者の本文は読み取り専用で、集計画面には出しません。

---

## 6. 確定している設計判断

| # | 論点 | 決定 |
| --- | --- | --- |
| Q-1 | 学習者の識別 | ログイン無し。HttpOnly の `learner_key` Cookie（UUID・90日） |
| Q-2 | 操作ログの中身 | **本文は保存しない**。文字数・ヒント回数・やり直し回数のみ |
| Q-3 | AI実行の上限 | 三段構え（上記） |
| Q-4 | ポーの発話量 | 通常100文字、例を出すときのみ150文字 |
| Q-5 | 実行と講評のモデル | `AiRun` と `TutorFeedback` を `Attempt` 1つに統合 |
| Q-6 | バックエンドの言語 | **Django のまま**。速度はAI待ちが支配的で、言語を替えても体感は変わらない |

憲章（`.specify/memory/constitution.md`）の原則 I・II は **交渉不可**です。

- **原則 I 迷わなさ最優先** — 1画面につき「次にやること」は必ず1つ。UIに専門用語を出さない
- **原則 II MVPの範囲を固定** — 検証6項目の外は作らない
- **原則 III 進行はアプリが持つ。ポーは助言だけ** — AI が止まってもレッスンは進む

---

## 7. 残っていること

**必須はこれだけです。**

- `frontend/public/poe/*.svg` の6枚は**仮画像**（丸に目と口だけ）。
  正式なポーの画像に差し替えてください。
  差し替え口は `frontend/src/components/PoeAvatar.tsx` の `POE_IMAGE_EXT` 1か所です。
  WebP を `neutral.webp` … の名前で同じ場所に置き、値を `"webp"` に変えるだけです。
  6枚の表情: `neutral` / `question` / `thinking` / `hint` / `warning` / `celebrate`
- `frontend/public/ogp.svg`（共有されたときの画像）も仮のものです。

**意図的に入れていないもの**（憲章 原則 II）

- ログイン、複数レッスン、学習プラン、法人向け機能
- Live2D / 音声 / 口パク / 3D / 複数キャラクター

---

## 8. 探索テストで見つけて直した不具合

スタブではなく本物の Django・DB・Cookie・ブラウザに当てたことで、
実装とユニットテストだけでは気づけない不具合が見つかりました。
すべて修正済みで、回帰テストを追加してあります。

| 症状 | 原因 |
| --- | --- |
| 自分の文章で実行したあと振り返りへ進めない | 実行成功後の行き先が固定だった |
| ポーの助言が出ない | `dispatch` 直後の古い状態を読んでいた |
| 通信がまったく届かない（画面には何も出ない） | 接続先ホストの既定が固定・CORS の許可も片方だけ |
| ポーの返事を待つ間の操作が黙って捨てられる | 二重送信の錠前が助言の通信まで覆っていた |
| 進んだ画面が後ろへ引き戻される | 再開の問い合わせが遅れて届き、現在地を上書きしていた |
| 狭い画面でポーが下のボタンのタップを奪う | 画面下部に固定していて重なっていた |
| **ブラウザからの流し込みが全部 406 で弾かれ、一度も効いていなかった** | DRF の内容交渉が `Accept: text/event-stream` を拒否。curl では通るため気づけない |
| **同時アクセスで 500（database is locked）** | 実行回数の数え上げが行を掴んだまま待つ形だった |
| **文字が薄くて読みにくい**（コントラスト 4.42 / 2.35、基準は 4.5） | 本文に薄い灰色を使っていた |
| **どこかで例外が出ると真っ白な画面になる** | エラー境界が無かった |

詳細は `docs/aippo-mvp-design.md` にあります。

---

## 9. ドキュメントの読む順

1. `README.md` — 全体像・動かし方・公開前の確認事項
2. `.specify/memory/constitution.md` — 開発憲章（最優先）
3. `docs/aippo-mvp-design.md` — 設計・影響範囲・進捗・テスト状況
4. `docs/ai-tutor-design.md` — ポーの設計・API契約・レッスン台本
5. `specs/001-handson-lesson-mvp/` — spec / plan / tasks
