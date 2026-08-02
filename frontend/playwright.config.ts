import { defineConfig, devices } from "@playwright/test";

/**
 * E2E は AI API を呼ばない。
 * バックエンドの応答は page.route() でスタブへ差し替える（§18 Phase 6）。
 * そのため起動するのはフロントエンドの dev サーバーだけでよい。
 */
/**
 * 実行環境に Chromium が用意済みの場合はそれを使う。
 * PLAYWRIGHT_CHROMIUM_PATH を設定すると、ブラウザを追加ダウンロードせずに済む。
 */
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const channel = chromiumPath
  ? { launchOptions: { executablePath: chromiumPath } }
  : {};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...channel } },
    { name: "mobile", use: { ...devices["Pixel 5"], ...channel } },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
