/**
 * 「こんな使い方もできます」から、やり方の説明へ。
 *
 * ここで見るのは3つ。
 *
 *   1. 完了画面から、くわしい説明へ本当に移れる
 *   2. 説明から、足りない技のレッスンへ入れる
 *   3. **説明へ出ても、完了の記録が残る**
 *
 * 3つ目が肝心
 * -----------
 * 完了画面には出口が複数ある（「完了する」「次のコースを見る」
 * 「やり方をくわしく見る」）。記録の処理を1つの出口にしか
 * 結びつけていないと、別の道から出た人のぶんだけ完了が残らない。
 *
 * これは想像ではなく、実際に「次のコースを見る」で起きた
 * （LessonRunner.tsx 参照）。出口を足すたびに、ここで確かめる。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

const SAMPLE = "来週の打ち合わせの件、資料の確認をお願いします。";

async function openRewriteLesson(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-rewrite_text").click();
}

/** 完了画面まで、機械的に押し進める。 */
async function runToCompletion(page: Page): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    if (await page.getByTestId("completion-view").isVisible().catch(() => false)) return;

    const primary = page.getByTestId("primary-action").first();
    if (!(await primary.isVisible().catch(() => false))) break;

    const blocked =
      (await primary.isDisabled()) ||
      (await primary.getAttribute("aria-disabled")) === "true";
    if (blocked) {
      const box = page.locator("textarea:visible").first();
      if (await box.count()) await box.fill(SAMPLE);
      else {
        const choice = page
          .locator("main button:visible")
          .filter({
            hasNotText: /レッスン一覧へ|もどる|くわしく|送っています|飛ばす|スキップ|あとにする/,
          })
          .first();
        if (await choice.count()) await choice.click();
      }
      await page.waitForTimeout(120);
    }

    await primary.click();
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId("completion-view")).toBeVisible();
}

test.describe("やり方のくわしい説明", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("完了画面から、説明へ移れる", async ({ page }) => {
    await openRewriteLesson(page);
    await runToCompletion(page);

    await page
      .getByTestId("applied-tip-open-clear_writing_for_email")
      .click();

    await expect(page.getByTestId("recipe-title")).toBeVisible();
    await expect(page.getByTestId("recipe-skills")).toBeVisible();
  });

  test("説明から、足りない技のレッスンへ入れる", async ({ page }) => {
    await openRewriteLesson(page);
    await runToCompletion(page);

    // 2つの技が要る組み合わせ。片方（要約）はまだ終えていない
    await page.getByTestId("applied-tip-open-meeting_notes_share").click();
    await expect(page.getByTestId("recipe-title")).toBeVisible();

    await page.getByTestId("recipe-skill-learn-summarize_text").click();

    // そのレッスンが実際に開くこと
    await expect(page.getByTestId("primary-action").first()).toBeVisible();
  });

  test("説明へ出ても、完了の記録が残る", async ({ page }) => {
    await openRewriteLesson(page);
    await runToCompletion(page);

    await page
      .getByTestId("applied-tip-open-clear_writing_for_email")
      .click();
    await expect(page.getByTestId("recipe-title")).toBeVisible();

    /*
      完了画面から出る道が増えるたびに、ここが壊れうる。
      押しただけで終わっていないか——端末に記録されているかを見る。
    */
    const saved = await page.evaluate(() =>
      window.localStorage.getItem("aippo:completed"),
    );
    expect(saved, "完了が端末に残っていない").toBeTruthy();
    expect(saved).toContain("rewrite_text");
  });

  test("説明から、直前の完了画面へ戻れる", async ({ page }) => {
    await openRewriteLesson(page);
    await runToCompletion(page);

    await page
      .getByTestId("applied-tip-open-clear_writing_for_email")
      .click();
    await page.getByTestId("recipe-back").click();

    // 上の戻るもブラウザバックも、実際に開いた1つ前へ戻る。
    await expect(page.getByTestId("completion-view")).toBeVisible();
  });
});
