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
// ログイン状態は「ゲスト」に固定する。登録の誘いが出た状態も検査したい
await p.route("**/api/v1/accounts/me/", (r) =>
  r.fulfill({ json: { authenticated: false } }));
await p.route("**/api/v1/accounts/csrf/", (r) => r.fulfill({ json: { ok: true } }));
// 教材はサーバーから来る。ここでは同梱の分で検査したいので空を返す
await p.route("**/api/v1/catalog/", (r) => r.fulfill({ json: { courses: [] } }));
await p.route("**/api/v1/progress/", (r) =>
  r.fulfill({
    json: {
      lessons: [], completed_count: 0, in_progress_count: 0,
      skills: [], signed_in: false,
    },
  }));
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

await p.getByRole("button", { name: "コース" }).click();
await p.waitForTimeout(700);
await scan("教材一覧");

// 設定と、その下位画面
await p.getByRole("button", { name: "その他" }).click();
await p.waitForTimeout(700);
await scan("設定");
// 一覧に並ぶのは、開ける行だけ（まだ無いものは載せていない）。
// ここは全部たどる——1つでも欠けると、その画面だけ検査されなくなる
for (const name of ["アカウント設定", "AI利用状況", "通知", "音", "学習データ・プライバシー", "規約とポリシー"]) {
  await p.getByRole("button", { name: new RegExp(name) }).click();
  await p.waitForTimeout(500);
  await scan(`設定 ${name}`);
  // 登録・ログインの1枚は、アカウント設定の中からしか開かない
  if (name === "アカウント設定") {
    await p.getByTestId("account-open-auth").click();
    await p.waitForTimeout(400);
    await scan("登録・ログイン");
    await p.getByRole("button", { name: "あとにする" }).click();
    await p.waitForTimeout(300);
  }
  // 規約は一覧から本文へもう1段潜る
  if (name === "規約とポリシー") {
    await p.getByTestId("legal-open-terms").click();
    await p.waitForTimeout(400);
    await scan("規約 利用規約");
    await p.getByRole("button", { name: "前の画面へ戻る" }).click();
    await p.waitForTimeout(300);
  }
  await p.getByRole("button", { name: "前の画面へ戻る" }).click();
  await p.waitForTimeout(400);
}
await p.getByRole("button", { name: "コース" }).click();
await p.waitForTimeout(600);
await scan("コース一覧");

// コースは3段。レッスンが並ぶのは2段目
await p.getByTestId("current-course-open").click();
await p.waitForTimeout(700);
await scan("コースの中身");

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
  const blocked = async () =>
    (await primary.isDisabled()) ||
    (await primary.getAttribute("aria-disabled")) === "true";

  if (await blocked()) {
    const ta = p.locator("textarea:visible").first();
    if (await ta.count()) await ta.fill("来週の打ち合わせの件、資料の確認をお願いします。");
    else {
      const opt = p.locator("main button:visible")
        .filter({ hasNotText: /レッスン一覧へ|もどる|くわしく|送っています|飛ばす|スキップ/ }).first();
      if (await opt.count()) await opt.click();
    }
    await p.waitForTimeout(300);
  }
  if (await blocked()) break;
  await primary.click();
  await p.waitForTimeout(800);
}

await b.close();
console.log(failed === 0 ? "\n違反なし" : `\n違反 ${failed} 件`);
process.exit(failed === 0 ? 0 : 1);
