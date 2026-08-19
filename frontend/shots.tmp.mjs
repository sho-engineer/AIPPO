import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "/tmp/claude-0/-home-user-AIPPO/fc91755b-6662-5f95-88f0-eede8d2791e3/scratchpad/now";
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();

await p.route("**/api/v1/ai/generate/", (r) =>
  r.fulfill({ json: {
    result: "AIを使えば、情報整理や文章作成、アイデア出しがぐっと楽になります。まずは小さく試して、少しずつ日々の業務に取り入れていきましょう。",
    tutor: { message: "できました。", emotion: "celebrate", action: "next" },
    usage: {}, extras: {} } }));
await p.route("**/api/learning-events/", (r) => r.fulfill({ json: {} }));
await p.route("**/api/v1/accounts/me/", (r) => r.fulfill({ json: { authenticated: false } }));
await p.route("**/api/v1/accounts/csrf/", (r) => r.fulfill({ json: { ok: true } }));
await p.route("**/api/v1/catalog/", (r) => r.fulfill({ json: { courses: [] } }));
await p.route("**/api/v1/progress/", (r) => r.fulfill({ json: {
  lessons: [], completed_count: 0, in_progress_count: 0, skills: [], signed_in: false } }));

let n = 0;
const shot = async (name) => {
  n += 1;
  await p.screenshot({ path: `${OUT}/${String(n).padStart(2, "0")}-${name}.png`, fullPage: true });
  const h = await p.locator("h1, h2").allInnerTexts();
  console.log(`${n} ${name} :: ${h.slice(0, 3).join(" | ").replace(/\n/g, " ")}`);
};

await p.goto("http://127.0.0.1:4319/");
await p.waitForTimeout(1200);
await shot("top");
await p.getByRole("button", { name: "はじめる" }).first().click();
await p.waitForTimeout(800);
await shot("home");

// 診断
await p.getByRole("button", { name: /AI活用診断/ }).first().click();
await p.waitForTimeout(900);
await shot("diagnosis-intro");
await p.getByTestId("primary-action").first().click();
await p.waitForTimeout(700);
await shot("diagnosis-q1");

// レッスン本体
await p.evaluate(() => window.localStorage.clear());
await p.goto("http://127.0.0.1:4319/");
await p.waitForTimeout(1000);
const start = p.getByRole("button", { name: "はじめる" }).first();
if (await start.count() && await start.isVisible()) { await start.click(); await p.waitForTimeout(600); }
await p.getByRole("button", { name: "教材一覧" }).click();
await p.waitForTimeout(700);
await shot("course-list");
await p.getByTestId("lesson-rewrite_text").click();
await p.waitForTimeout(1000);
await shot("lesson-intro");

const primary = () => p.getByTestId("primary-action").first();
for (let i = 0; i < 26; i += 1) {
  const text = await p.locator("body").innerText();
  const label = text.includes("スキルを身につけました") ? "completion" : `step-${i}`;
  await shot(label);
  if (label === "completion") break;

  try { await primary().waitFor({ state: "visible", timeout: 6000 }); } catch { break; }
  if (await primary().isDisabled()) {
    const ta = p.locator("textarea:visible").first();
    if (await ta.count()) await ta.fill("お疲れ様です。先日ご依頼いただいた資料について、現時点での進捗をご報告します。全体の構成は完了し、データの収集中です。");
    else {
      const opt = p.locator("main button:visible")
        .filter({ hasNotText: /レッスン一覧へ|もどる|くわしく|送っています|飛ばす|スキップ/ }).first();
      if (await opt.count()) await opt.click();
    }
    await p.waitForTimeout(300);
  }
  if (await primary().isDisabled()) break;
  await primary().click();
  await p.waitForTimeout(900);
}

await b.close();
