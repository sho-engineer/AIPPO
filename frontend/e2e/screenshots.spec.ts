import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/**
 * 画面の見た目を書き出す。検証用であってテストではない。
 *
 *   npx playwright test e2e/screenshots.spec.ts --project=desktop
 *
 * 出力先は screenshots/。UIを直すときに前後を見比べるために使う。
 */

test.skip(!process.env.CAPTURE_SCREENSHOTS, "CAPTURE_SCREENSHOTS=1 のときだけ実行する");

/**
 * 登場の動きが終わるのを待つ。
 *
 * 待たずに撮ると、遅らせて出している要素がまだ透明のままで、
 * ボタンの無い壊れた画面が書き出される。
 * ずっと続く動き（浮遊・泡）は終わらないので待たない。
 */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

async function shot(page: Page, name: string) {
  await settle(page);
  await page.screenshot({
    path: `screenshots/${test.info().project.name}-${name}.png`,
    fullPage: true,
  });
}

test("各画面を書き出す", async ({ page }) => {
  await stubApi(page);

  await page.goto("/");
  await shot(page, "01-top");

  await page.getByRole("button", { name: "はじめる" }).first().click();
  await page.locator("main section button").first().waitFor();
  await shot(page, "02-diagnosis");

  for (let i = 0; i < 3; i++) {
    const choices = page.locator("main section button");
    await choices.first().waitFor();
    await choices.first().click();
  }
  await page.getByRole("button", { name: "これを試す" }).waitFor();
  await shot(page, "03-recommendation");

  await page.getByRole("button", { name: "これを試す" }).click();
  await expect(page.getByTestId("lesson-step")).toBeVisible();
  await shot(page, "04-intro");

  await page.getByTestId("primary-action").click();
  await shot(page, "05-use-case");

  await page.getByRole("button", { name: "仕事のメール" }).click();
  await shot(page, "06-first-input");

  await page.getByRole("button", { name: "社外のお客様", exact: true }).click();
  await page.getByRole("button", { name: "ていねいに", exact: true }).click();
  await page.getByRole("button", { name: "3行くらい", exact: true }).click();
  await page.getByTestId("primary-action").click();

  await expect(page.getByTestId("result-compare")).toBeVisible();
  await shot(page, "07-review-result");

  await page.getByTestId("primary-action").click();
  await shot(page, "08-improve");

  await page.getByRole("button", { name: "もっと短くしたい" }).click();
  await expect(page.getByTestId("run-2")).toBeVisible();
  await shot(page, "09-review-2");

  await page.getByTestId("primary-action").click();
  await page.getByRole("button", { name: "自分の文章で試す" }).click();
  await shot(page, "10-real-task");

  await page.getByLabel("あなたの文章").fill("お世話になっております。例の件、いかがでしょうか。");
  await page.getByTestId("primary-action").click();
  await expect(page.getByTestId("result-compare")).toBeVisible();
  await shot(page, "11-real-task-result");

  await page.getByTestId("primary-action").click();
  await shot(page, "12-reflection");

  await page.getByTestId("primary-action").click();
  await expect(page.getByTestId("completion-view")).toBeVisible();
  await shot(page, "13-complete");
});
