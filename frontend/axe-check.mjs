/**
 * 新しい配色で、読めなくなった場所が無いかを機械に調べさせる。
 *
 * E2E 一式は成果物ファーストの流れに追随できておらず別途作り直しが要るので、
 * ここでは「配色を変えて壊れていないか」だけを、今の画面に対して確かめる。
 */
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH });
const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
const p = await ctx.newPage();

await p.route("**/api/v1/ai/generate/", (r) =>
  r.fulfill({
    json: {
      result: "明日の打ち合わせ資料について、修正箇所をご確認ください。",
      tutor: { message: "できました。", emotion: "celebrate", action: "next" },
      usage: {}, extras: {},
    },
  }));
await p.route("**/api/learning-events/", (r) => r.fulfill({ json: {} }));
await p.route("**/api/v1/ai/models/", (r) =>
  r.fulfill({
    json: {
      models: [
        { id: "gpt-5-nano", label: "標準", note: "速くて費用が低い", provider: "openai", recommended: true },
        { id: "gpt-5-mini", label: "じっくり", note: "長い文章の整理が得意", provider: "openai", recommended: false },
      ],
      default: "gpt-5-nano",
    },
  }));

let failed = 0;
const scan = async (name) => {
  const { violations } = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  if (violations.length === 0) { console.log(`OK   ${name}`); return; }
  failed += violations.length;
  console.log(`NG   ${name}`);
  for (const v of violations) {
    console.log(`  [${v.impact}] ${v.id}: ${v.help}`);
    for (const n of v.nodes.slice(0, 4)) {
      console.log(`     ${n.target.join(" ")}`);
      console.log(`       ${(n.failureSummary ?? "").replace(/\n/g, "\n       ")}`);
    }
  }
};

await p.goto("http://127.0.0.1:4319/");
await p.waitForTimeout(1200);
await scan("タイトル");

await p.getByRole("button", { name: "はじめる" }).first().click();
await p.waitForTimeout(900);
await scan("ホーム");

await p.getByRole("button", { name: "教材一覧" }).click();
await p.waitForTimeout(700);
await scan("教材一覧");

// 設定と、その下位画面
await p.getByRole("button", { name: "設定" }).click();
await p.waitForTimeout(700);
await scan("設定");
for (const name of ["AI設定", "学習設定", "通知設定", "言語設定", "学習データ・プライバシー"]) {
  await p.getByRole("button", { name: new RegExp(name) }).click();
  await p.waitForTimeout(500);
  await scan(`設定 ${name}`);
  await p.getByRole("button", { name: "前の画面へ戻る" }).click();
  await p.waitForTimeout(400);
}
await p.getByRole("button", { name: "教材一覧" }).click();
await p.waitForTimeout(600);

await p.getByTestId("lesson-rewrite_text").click();
await p.waitForTimeout(900);
await scan("レッスン 完成イメージ");

await p.getByTestId("primary-action").first().click();
await p.waitForTimeout(700);
await scan("レッスン お試し");

await p.getByRole("button", { name: "上司" }).click();
await p.getByTestId("primary-action").first().click();
await p.waitForTimeout(1800);
await scan("レッスン 観察");

/*
  残りのステップを最後まで進め、新しく作った画面も検査する。
  条件を選ぶ画面と完了画面は、ここでしか通らない。
*/
const primary = p.getByTestId("primary-action").first();
const seen = new Set();
for (let i = 0; i < 30; i++) {
  const text = await p.locator("body").innerText();
  if (text.includes("条件を一つ足して") && !seen.has("cond")) {
    seen.add("cond"); await scan("レッスン 条件を足す");
  }
  if (text.includes("変わり方を見比べる") && !seen.has("cmp")) {
    seen.add("cmp"); await scan("レッスン 3つを比べる");
  }
  if (text.includes("スキルを身につけました")) { await scan("レッスン 完了"); break; }

  try { await primary.waitFor({ state: "visible", timeout: 8000 }); } catch { break; }
  if (await primary.isDisabled()) {
    const ta = p.locator("textarea:visible").first();
    if (await ta.count()) await ta.fill("来週の打ち合わせの件、資料の確認をお願いします。");
    else {
      const opt = p.locator("main button:visible")
        .filter({ hasNotText: /レッスン一覧へ|もどる|くわしく|送っています|飛ばす|スキップ/ }).first();
      if (await opt.count()) await opt.click();
    }
    await p.waitForTimeout(300);
  }
  if (await primary.isDisabled()) break;
  await primary.click();
  await p.waitForTimeout(800);
}

await b.close();
console.log(failed === 0 ? "\n違反なし" : `\n違反 ${failed} 件`);
process.exit(failed === 0 ? 0 : 1);
