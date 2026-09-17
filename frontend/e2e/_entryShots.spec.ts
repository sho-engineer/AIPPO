/**
 * 入口の3枚を撮る。`QA=1` のときだけ走る。
 *
 * 置き先は `shots/entry`。
 */

import { test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

const DIR = process.env.SHOT_DIR ?? "shots/entry";

const SIZES = [
  { name: "320x568", width: 320, height: 568 },
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "1280x800", width: 1280, height: 800 },
];

async function openFresh(page: Page): Promise<void> {
  await stubApi(page, { showEntry: true });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}

test.describe("入口の3枚", () => {
  test.setTimeout(240_000);

  for (const size of SIZES) {
    test(size.name, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openFresh(page);

      await page.getByTestId("welcome-page").waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/${size.name}-1-welcome.png` });

      await page.getByTestId("welcome-guest").click();
      await page.getByTestId("diagnosis-intro-page").waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/${size.name}-2-diagnosis.png` });

      await page.getByTestId("diagnosis-intro-later").click();
      await page.getByTestId("next-up").waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/${size.name}-3-home.png` });
    });
  }

  test("登録の一枚（ようこそから開く）", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFresh(page);
    await page.getByTestId("welcome-signup").click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/390x844-4-signup.png` });
  });
});
