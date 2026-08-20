# デプロイ手順（Oracle Cloud + Vercel、無料枠のみ）

フロントエンドは Vercel、バックエンド（Django + PostgreSQL）は Oracle Cloud の
Always Free VM に、`deploy/oracle/` の compose 構成でまとめて載せる。

構成:

```
Vercel（フロント）  ──HTTPS──▶  Caddy（自動でHTTPS化）  ──▶  Django  ──▶  PostgreSQL
 aippo.vercel.app                aippo-xxx.duckdns.org         同じVM内
```

Oracle の無料 VM 自体はスリープしない（Render の無料枠と違い常時起動）。
その代わり、VM の作成やドメインの用意は自分の手で行う必要がある。

---

## 1. 無料サブドメインを用意する（DuckDNS）

1. https://www.duckdns.org を開き、Google などでログイン
2. 好きなサブドメインを決めて登録する（例: `aippo-yourname` → `aippo-yourname.duckdns.org`）
3. この時点では IP は未定でよい（VM 作成後に埋める）

---

## 2. Oracle Cloud の無料 VM を作る

1. https://www.oracle.com/cloud/free/ からアカウント作成
   - クレジットカードの登録を求められるが、Always Free の範囲では課金されない
   - 本人確認があるため数分〜数時間かかることがある
2. コンソールで **Compute → Instances → Create Instance**
   - イメージ: **Ubuntu 22.04**
   - シェイプ: **VM.Standard.A1.Flex**（Ampere / ARM、Always Free 対象）
     - OCPU 2〜4、メモリ 12〜24GB あたりで組む（無料枠の上限内で自由に調整できる）
   - SSH 鍵: その場で作成してダウンロードするか、自分の公開鍵を貼る
3. 作成後、**パブリックIPを予約IP（Reserved Public IP）に変更する**
   - 動的IPのままだと、VMを止めて起動し直すたびにIPが変わり、DuckDNSの設定もやり直しになる
   - Networking → IP Management → 既存の一時IPを予約IPへ切り替え（Always Free の範囲内）
4. **ファイアウォールを両方開ける**（片方だけだと繋がらない）
   - VCN の **Security List**（またはNSG）: Ingress で `80/tcp`・`443/tcp`・`22/tcp` を許可
   - VM 内の OS ファイアウォール:
     ```bash
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```
     （Ubuntu の Oracle イメージは iptables ベース。`ufw` ではないので注意）

---

## 3. DuckDNS を VM の IP へ向ける

DuckDNS のページで、1で作ったサブドメインの IP を、2で控えた予約IPに書き換える。
予約IPなので、以後は書き換え不要。

---

## 4. VM に入って、1コマンドで準備する

```bash
ssh ubuntu@<予約IP>
curl -fsSL https://raw.githubusercontent.com/sho-engineer/AIPPO/main/deploy/oracle/bootstrap.sh | bash
```

これで Docker の導入・ファイアウォールの開放（VM 内側）・リポジトリの取得・
`.env` の雛形作成まで終わる。「Docker を入れた」と出たら、一度ログインし直すか
`newgrp docker` を実行してから続ける。

---

## 5. `.env` を埋める

```bash
cd ~/AIPPO/deploy/oracle
nano .env
```

`DJANGO_SECRET_KEY` と `POSTGRES_PASSWORD` は、この場で生成済みの値をそのまま貼ってよい
（チャットで渡された値。自分で作り直したいときだけ `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`）。

あなたが埋めるのはこの3つだけ:

- `BACKEND_DOMAIN`（例: `aippo-yourname.duckdns.org`）
- `ACME_EMAIL`（自分のメールアドレス）
- `FRONTEND_URL` / `CORS_ALLOWED_ORIGINS`（Vercel の URL。まだ無ければ
  `https://placeholder.vercel.app` などの仮値で起動し、7 で確定してから直す）

---

## 6. 起動する

```bash
docker compose up -d --build

# 初回だけ
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py seed_catalog
```

数十秒待ってから確認:

```bash
curl https://<BACKEND_DOMAIN>/health/live
# {"status": "ok"} が返ればOK
```

初回の証明書取得に失敗するときは `docker compose logs caddy` を見る。
ほぼ「80/443が塞がったまま」（手順2のファイアウォール漏れ）が原因。

---

## 7. フロントエンドを Vercel にデプロイする

1. https://vercel.com で GitHub 連携し、このリポジトリを Import
2. **Root Directory を `frontend` に設定**（プロジェクト設定画面。モノレポなので必須）
3. Environment Variables に追加:
   - `VITE_API_BASE_URL` = `https://<BACKEND_DOMAIN>`
4. Deploy

デプロイが終わると `https://<プロジェクト名>.vercel.app` が発行される。

---

## 8. バックエンドの CORS を実際の Vercel URL に直す

7 で URL が確定したら、VM 側の `.env` を実際の値に更新して再起動:

```bash
cd ~/AIPPO/deploy/oracle
nano .env   # FRONTEND_URL と CORS_ALLOWED_ORIGINS を実際の Vercel URL に
docker compose up -d
```

---

## 9. 動作確認

Vercel の URL を開き、レッスンを1本最後まで進める（`AI_PROVIDER=mock` のままで完走できる設計）。
途中で登録・ログインを試す場合、`EMAIL_BACKEND=console` のままだと確認メールは
実際には届かない（`docker compose logs backend` にメール本文が出るだけ）。

---

## あとから足すもの

- **本物のAI**: `.env` の `AI_PROVIDER` を `gemini`（既定） / `anthropic` / `openai` にして対応する鍵を入れ、`docker compose up -d`（本番でユーザーの入力を扱うなら Gemini は Paid Tier の鍵にすること）
- **実際のメール送信**: `EMAIL_BACKEND` を smtp にし、`EMAIL_HOST` 等を埋める
- **独自ドメイン**: DuckDNS のままでも動くが、いずれ own domain に変えたくなったら
  `BACKEND_DOMAIN` と Vercel 側のカスタムドメイン設定を両方直す
- **更新のしかた**:
  ```bash
  cd ~/AIPPO && git pull
  cd deploy/oracle && docker compose up -d --build
  docker compose exec backend python manage.py migrate
  ```
