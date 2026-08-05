#!/usr/bin/env bash
# Oracle Cloud の VM で、SSH した直後に一度だけ実行するスクリプト。
#
#   curl -fsSL https://raw.githubusercontent.com/sho-engineer/AIPPO/main/deploy/oracle/bootstrap.sh | bash
#
# これで Docker の導入・ファイアウォールの開放・リポジトリの取得までが終わり、
# 残るのは `.env` に値を埋めて `docker compose up -d --build` するだけになる。
#
# 何度実行しても壊れないようにしてある（Docker が入っていれば飛ばす、
# リポジトリがあれば pull するだけ、など）。

set -euo pipefail

echo "==> Docker を確認"
if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "$USER"
    echo "    入れた。一度ログインし直すか、次のコマンドを実行してから続けること:"
    echo "      newgrp docker"
fi

echo "==> ファイアウォールを開ける（80/443）"
# Oracle の Ubuntu イメージは ufw ではなく iptables ベース。
# Security List（クラウド側）は別途コンソールで開ける必要がある——
# こちらはあくまで VM 内の話。
sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || \
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || \
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
if command -v netfilter-persistent >/dev/null 2>&1; then
    sudo netfilter-persistent save
else
    sudo mkdir -p /etc/iptables
    sudo sh -c 'iptables-save > /etc/iptables/rules.v4'
fi

echo "==> リポジトリを取得"
if [ -d "$HOME/AIPPO/.git" ]; then
    (cd "$HOME/AIPPO" && git pull)
else
    git clone https://github.com/sho-engineer/AIPPO.git "$HOME/AIPPO"
fi

cd "$HOME/AIPPO/deploy/oracle"
if [ ! -f .env ]; then
    cp .env.example .env
    echo
    echo "==> .env を作った。あと埋めるのはこれだけ:"
    echo "      BACKEND_DOMAIN   例）aippo-yourname.duckdns.org"
    echo "      ACME_EMAIL       あなたのメールアドレス"
    echo "      FRONTEND_URL / CORS_ALLOWED_ORIGINS   Vercel の URL"
    echo "    （DJANGO_SECRET_KEY と POSTGRES_PASSWORD は AIPPO 側で生成済みの値を貼るだけでよい）"
fi

echo
echo "==> 準備完了。次は:"
echo "      cd ~/AIPPO/deploy/oracle && nano .env"
echo "      docker compose up -d --build"
echo "      docker compose exec backend python manage.py migrate"
echo "      docker compose exec backend python manage.py seed_catalog"
