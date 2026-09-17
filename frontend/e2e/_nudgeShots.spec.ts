/**
 * 診断の案内を、代表的な持ち方で撮る。
 *
 * 置き先は `shots/nudge`。`QA=1` のときだけ走る。
 */

import { test, type Page } from "@playwright/test";

import { stubApi, type StubOptions } from "./support/stubApi";

const DIR = process.env.SHOT_DIR ?? "shots/nudge";

const SIZES = [
  { name: "320x568", width: 320, height: 568 },
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "1280x800", width: 1280, height: 800 },
];

async function openHome(page: Page, options: StubOptions = {}): Promise<void> {
  await stubApi(page, { diagnosisNudge: true, ...options });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await page.getByTestId("tab-bar").waitFor();
}

test.describe("案内の見た目", () => {
  test.setTimeout(180_000);

  for (const size of SIZES) {
    test(`${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openHome(page);
      await page.getByTestId("diagnosis-nudge-sheet").waitFor();
      // 出てくる動きが終わってから撮る
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/${size.name}.png` });
    });
  }

  test("閉じたあとのホーム（常設の入口が残る）", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHome(page);
    await page.getByTestId("diagnosis-nudge-later").click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/after-close-home.png` });
  });

  test("押した先（診断の1問目）", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHome(page);
    await page.getByTestId("diagnosis-nudge-start").click();
    await page.getByTestId("lesson-header").waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/first-question.png` });
  });
});
