/**
 * 代表画面を撮る。**直す前と、直したあとで同じ手順で。**
 *
 * 置き先は `SHOT_DIR`（既定 `shots/after`）。直す前を撮るときは、
 * その版を checkout して `SHOT_DIR=shots/before` で回す。
 */

import { test, type Page } from "@playwright/test";

import { openLessonById } from "./support/openLesson";
import { dismissLessonIntro } from "./support/lessonIntro";
import { stubApi } from "./support/stubApi";

const DIR = process.env.SHOT_DIR ?? "shots/after";
const SIZE = { width: 393, height: 659 };
const SMALL = { width: 320, height: 568 };

const MY_TEXT =
  "来月の全社会議について、各部門から出た意見をまとめました。" +
  "営業部は資料の共有方法を変えたいと述べ、管理部は開催時間の短縮を求めています。" +
  "企画部からは事前アンケートの実施案が出ました。次回までに方針を決める必要があります。";

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function fill(page: Page) {
  const primary = page.getByTestId("primary-action").first();
  if ((await primary.getAttribute("aria-disabled")) !== "true") return;
  const box = page.locator("textarea:visible").first();
  if (await box.count()) {
    await box.fill(MY_TEXT);
    return;
  }
  const parts = page.getByTestId("assemble-part");
  const count = await parts.count();
  if (count > 0) {
    for (let at = 0; at < count; at += 1) {
      const part = parts.nth(at);
      if (await part.locator("[aria-pressed='true']").count()) continue;
      await part.getByTestId("assemble-choice").first().click();
    }
    return;
  }
  const choice = page.locator("main [aria-pressed]").first();
  if (await choice.count()) await choice.click();
}

async function forward(page: Page) {
  await fill(page);
  await page.getByTestId("primary-action").first().click({ force: true });
  await page.waitForTimeout(450);
}

test.describe("代表画面", () => {
  test.setTimeout(240_000);

  test("ホーム（320）", async ({ page }) => {
    await page.setViewportSize(SMALL);
    await stubApi(page);
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    const start = page.getByTestId("welcome-guest");
    if (await start.count()) await start.click();
    await page.getByTestId("tab-bar").waitFor();
    await shot(page, "01-home-320");
  });

  test("診断の結果", async ({ page }) => {
    await page.setViewportSize(SIZE);
    await stubApi(page);
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    const start = page.getByTestId("welcome-guest");
    if (await start.count()) await start.click();
    await page.getByTestId("tab-bar").waitFor();
    await page.getByRole("button", { name: "コース" }).first().click();
    await page.getByTestId("current-course-open").click();
    await page.getByTestId("lesson-diagnosis").first().click();
    await dismissLessonIntro(page);

    for (let at = 0; at < 8; at += 1) {
      if (((await page.getByTestId("completion-view").count()) ||
      (await page.getByTestId("diagnosis-analyzing").count()))) break;
      await forward(page);
    }
    await shot(page, "02-diagnosis-reading");
    for (let at = 0; at < 4; at += 1) {
      const title = await page.locator("main h1").first().innerText();
      if (title.includes("おすすめ")) break;
      await forward(page);
      await shot(page, `03-diagnosis-${at + 1}`);
    }
  });

  test("Day1 の比べる画面と完了", async ({ page }) => {
    await page.setViewportSize(SIZE);
    await stubApi(page);
    await openLessonById(page, "rewrite_text");
    for (let at = 0; at < 26; at += 1) {
      const title = (await page.locator("h1").first().innerText().catch(() => "")).replace(
        /\s+/g,
        "",
      );
      if (title.startsWith("読む人で変わった")) break;
      await forward(page);
    }
    await shot(page, "04-day1-compare");
    for (let at = 0; at < 26; at += 1) {
      const title = (await page.locator("h1").first().innerText().catch(() => "")).replace(
        /\s+/g,
        "",
      );
      if (title.startsWith("ひとつだけ確認")) break;
      await forward(page);
    }
    // 選ぶ前と、選んだあと（こたえが出る）
    await shot(page, "12-day1-check");
    await page.locator("main [aria-pressed]").first().click();
    await page.waitForTimeout(400);
    await shot(page, "13-day1-check-answered");

    for (let at = 0; at < 26; at += 1) {
      if (((await page.getByTestId("completion-view").count()) ||
      (await page.getByTestId("diagnosis-analyzing").count()))) break;
      await forward(page);
    }
    await shot(page, "05-day1-completion");
  });

  test("Day2 の章扉と自分の文章", async ({ page }) => {
    await page.setViewportSize(SIZE);
    await stubApi(page, { result: () => "・要点1\n・要点2\n・要点3" });
    await openLessonById(page, "summarize_text");
    await shot(page, "06-day2-outcome");
    await forward(page);
    await shot(page, "07-day2-section");

    for (let at = 0; at < 26; at += 1) {
      if (await page.locator("textarea:visible").count()) break;
      await forward(page);
    }
    await shot(page, "08-day2-own-text");

    // キーボードが出ている高さ
    await page.setViewportSize({ width: SIZE.width, height: SIZE.height - 291 });
    await page.locator("textarea:visible").first().click();
    await shot(page, "09-day2-keyboard");
  });

  test("自分の文章（320）と、そこにキーボードが出た高さ", async ({ page }) => {
    await page.setViewportSize(SMALL);
    await stubApi(page, { result: () => "・要点1\n・要点2\n・要点3" });
    await openLessonById(page, "summarize_text");
    for (let at = 0; at < 26; at += 1) {
      if (await page.locator("textarea:visible").count()) break;
      await forward(page);
    }
    await shot(page, "10-day2-own-text-320");

    await page.setViewportSize({ width: SMALL.width, height: SMALL.height - 216 });
    await page.locator("textarea:visible").first().click();
    await shot(page, "11-day2-keyboard-320");
  });
});
