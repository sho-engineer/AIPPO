# AIPPO フロントエンド（React → 静的ファイル → nginx）
#
# VITE_API_BASE_URL は **ビルド時**に埋め込まれる。
# 実行時に環境変数で差し替えることはできないので、
# 接続先が変わるならビルドし直すこと。
#
# 未指定のままにすると、表示中のホストの 8000 番へ向く
# （src/api/config.ts）。同一ホストで動かすならそれでよい。

FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
# Playwright のブラウザはこの段階では要らない
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm run build


FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
