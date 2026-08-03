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
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await shot(page, "01-top");

  const next = () => page.getByTestId("primary-action").click();
  const choose = (label: string) =>
    page.getByRole("button", { name: label, exact: true }).click();

  await page.getByRole("button", { name: "はじめる" }).first().click();
  await shot(page, "02-course");

  // Lesson 0: 診断
  await page.getByTestId("lesson-diagnosis").click();
  await next();
  await choose("文章を書くことが多い");
  await next();
  await choose("使ったことがない");
  await next();
  await choose("文章を書く・直す");
  await next();
  await shot(page, "03-recommendation");
  await next();

  // Lesson 1: 文章を分かりやすくする
  await page.getByTestId("lesson-rewrite_text").click();
  await shot(page, "04-intro");
  await next();
  await shot(page, "05-use-case");
  await choose("仕事のメール");
  await next();
  await page.getByRole("button", { name: "用意された例文を使う" }).click();
  await shot(page, "06-source-text");
  await next();
  await choose("社外のお客様");
  await next();
  await choose("ていねいに");
  await next();
  await choose("3行くらい");
  await next();
  await shot(page, "07-prompt-preview");

  await next();
  await expect(page.getByTestId("result-compare")).toBeVisible();
  await shot(page, "08-result");

  await next();
  await shot(page, "09-improve");
  await choose("もっと短く");
  await next();
  await shot(page, "10-improve-result");

  await next();
  await shot(page, "11-safety-check");
  await next();
  await shot(page, "12-real-task");

  await page.getByRole("textbox").fill("お世話になっております。例の件、いかがでしょうか。");
  await next();
  await expect(page.getByTestId("result-compare")).toBeVisible();
  await next();
  await shot(page, "13-reflection");
  await next();
  await shot(page, "14-complete");
  await next();
  await shot(page, "15-progress");
});
