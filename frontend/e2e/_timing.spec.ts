/**
 * 通すのに何回押して、どれだけかかるか。
 *
 * **AI の待ち時間は入っていない**（スタブが即返す）。ここで測るのは
 * UI 側の待ち時間と操作数だけ——要件は「AI応答時間とUI側の待ち時間を
 * 分けて計測する」なので、混ぜない。
 */

import { test, type Page } from "@playwright/test";

import { openLessonById } from "./support/openLesson";
import { dismissLessonIntro } from "./support/lessonIntro";
import { stubApi } from "./support/stubApi";

const MY_TEXT =
  "来月の全社会議について、各部門から出た意見をまとめました。" +
  "営業部は資料の共有方法を変えたいと述べ、管理部は開催時間の短縮を求めています。" +
  "企画部からは事前アンケートの実施案が出ました。次回までに方針を決める必要があります。";

interface Tally {
  taps: number;
  screens: number;
  ms: number;
}

async function fill(page: Page, tally: Tally) {
  const primary = page.getByTestId("primary-action").first();
  if ((await primary.getAttribute("aria-disabled")) !== "true") return;
  const box = page.locator("textarea:visible").first();
  if (await box.count()) {
    await box.fill(MY_TEXT);
    tally.taps += 1;
    return;
  }
  const parts = page.getByTestId("assemble-part");
  const count = await parts.count();
  if (count > 0) {
    for (let at = 0; at < count; at += 1) {
      const part = parts.nth(at);
      if (await part.locator("[aria-pressed='true']").count()) continue;
      await part.getByTestId("assemble-choice").first().click();
      tally.taps += 1;
    }
    return;
  }
  const choice = page.locator("main [aria-pressed]").first();
  if (await choice.count()) {
    await choice.click();
    tally.taps += 1;
  }
}

/**
 * 最後まで押し切る。
 *
 * 押したあとの待ちは**画面が入れ替わるまで**にする。固定の
 * `waitForTimeout` を置くと、測っているのが自分の待ちになる。
 */
async function run(page: Page, done: () => Promise<boolean>): Promise<Tally> {
  const tally: Tally = { taps: 0, screens: 0, ms: 0 };
  const started = Date.now();
  for (let at = 0; at < 40; at += 1) {
    tally.screens += 1;
    if (await done()) break;
    await fill(page, tally);
    const before = await page.locator("main h1").first().innerText().catch(() => "");
    await page.getByTestId("primary-action").first().click({ force: true });
    tally.taps += 1;
    await page
      .waitForFunction(
        (was) => (document.querySelector("main h1")?.textContent ?? "") !== was,
        before,
        { timeout: 8000 },
      )
      .catch(() => {});
  }
  tally.ms = Date.now() - started;
  return tally;
}

test.describe("操作数と所要時間", () => {
  test.setTimeout(240_000);

  test("診断・Day1・Day2 を通す", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await stubApi(page);
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    const start = page.getByRole("button", { name: "はじめる" }).first();
    if (await start.count()) await start.click();
    await page.getByTestId("tab-bar").waitFor();
    await page.getByRole("button", { name: "コース" }).first().click();
    await page.getByTestId("current-course-open").click();
    await page.getByTestId("lesson-diagnosis").first().click();
    await dismissLessonIntro(page);
    const diagnosis = await run(page, async () =>
      (await page.locator("main h1").first().innerText()).includes("おすすめ"),
    );
    console.error(
      `診断: 押した回数 ${diagnosis.taps} / 画面 ${diagnosis.screens} / ${Math.round(diagnosis.ms / 100) / 10}秒`,
    );

  });

  for (const id of ["rewrite_text", "summarize_text"]) {
    test(`${id} を通す`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await stubApi(page);
      await openLessonById(page, id);
      const tally = await run(
        page,
        async () => (await page.getByTestId("completion-view").count()) > 0,
      );
      console.error(
        `${id}: 押した回数 ${tally.taps} / 画面 ${tally.screens} / ${Math.round(tally.ms / 100) / 10}秒`,
      );
    });
  }
});
