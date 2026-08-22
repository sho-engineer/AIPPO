/**
 * 完了画面の「こんな使い方もできます」。
 *
 * レッスンは1つの技術だけを教える。ここで実際の仕事の場面に
 * 結びつけて、「練習した」で終わらせない。
 *
 * ここで見るのは4つ。
 *
 *   1. 完了画面に節が出る
 *   2. 足りない技があれば、押すとそのレッスンへ実際に入れる
 *      （deep link が本当に動くこと）
 *   3. いま終えたばかりの技を、「学ぶ」とは案内しない
 *      （端末の完了記録がまだ更新されていない一瞬を、
 *        素通しすると起きていた）
 *   4. 押せない「試す」ボタンを置かない
 *      （複数レッスンを1つの流れで実行する画面はまだ無い）
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

const SAMPLE =
  "先月の売上について報告がありました。前年同月比で110%となり、新規顧客からの受注が伸びています。";

async function openLesson(page: Page, lessonId: string): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId(`lesson-${lessonId}`).click();
}

/** 完了画面まで、機械的に押し進める。 */
async function runToCompletion(page: Page): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    if (await page.getByTestId("completion-view").isVisible().catch(() => false)) return;

    const primary = page.getByTestId("primary-action").first();
    if (!(await primary.isVisible().catch(() => false))) break;

    const blocked = (await primary.isDisabled()) ||
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

test.describe("こんな使い方もできます", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("完了画面に節が出る", async ({ page }) => {
    await openLesson(page, "summarize_text");
    await runToCompletion(page);

    await expect(page.getByTestId("applied-tips")).toBeVisible();
  });

  test("いま終えたばかりの技を、学ぶよう案内しない", async ({ page }) => {
    /*
      実際に一度この形で出た。端末の完了記録は、この画面を出している
      時点ではまだ更新されていない。素通しすると「たったいま終えた
      ばかりの技を学んでください」という、変な案内になる。
    */
    await openLesson(page, "summarize_text");
    await runToCompletion(page);

    const solo = page.getByTestId("applied-tip-meeting_summary_only");
    await expect(solo).toContainText("いまの技で使えます");
    await expect(
      page.getByTestId("applied-tip-learn-meeting_summary_only"),
    ).toHaveCount(0);
  });

  test("足りない技を学ぶボタンは、実際にそのレッスンへ入る", async ({ page }) => {
    await openLesson(page, "summarize_text");
    await runToCompletion(page);

    // 「summarize_text + rewrite_text」の組み合わせ。rewrite_text が足りない
    await page.getByTestId("applied-tip-learn-meeting_notes_share").click();

    // レッスンが本当に開いたことを見る（帯にレッスン名が出る）
    await expect(page.getByTestId("lesson-header")).toBeVisible();
    await expect(page.getByTestId("lesson-header")).toContainText(
      "文章を分かりやすくする",
    );
  });

  test("技がそろっていても、押した先がちゃんとある", async ({ page }) => {
    /*
      前はここで「ボタンを1つも置かない」ことを見ていた。
      複数レッスンを1つの流れとして実行する画面が無く、置けば
      **押しても何も起きないボタン**になるためだった。

      いまは行き先がある（pages/RecipePage.tsx）。なので見るものを
      変える——ボタンが無いことではなく、**押した先が本当にある**こと。
      守りたいことは同じで、行き止まりを作らない（憲章 原則 I）。
    */
    await openLesson(page, "summarize_text");
    await runToCompletion(page);

    const solo = page.getByTestId("applied-tip-meeting_summary_only");
    // 技はそろっているので、学ぶボタンは出ない
    await expect(
      page.getByTestId("applied-tip-learn-meeting_summary_only"),
    ).toHaveCount(0);

    // 出ているボタンは、押すと本当に開く
    await solo.getByTestId("applied-tip-open-meeting_summary_only").click();
    await expect(page.getByTestId("recipe-title")).toBeVisible();
  });
});
