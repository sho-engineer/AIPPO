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

import { openRecord } from "./support/openRecord";
import { stubApi } from "./support/stubApi";
import { dismissLessonIntro, passSkillStamp } from "./support/lessonIntro";

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
  await dismissLessonIntro(page);
}

/** 完了画面まで、機械的に押し進める。 */
async function runToCompletion(page: Page): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    /*
      技を受け取る回で「覚えた」を押すと、スタンプ台紙が1枚挟まる。
      閉じずに下のボタンを押そうとすると、背景（閉じるための面）が
      受け取ってしまう。
    */
    if (await passSkillStamp(page)) continue;

    /*
      `return` にしない。**この輪の後ろにある一手が実行されなくなる**
      ——完了画面まで来たら「このレッスンの記録」を開く必要がある
      （`support/openRecord.ts`）。前に同じ形で 24件が落ちた。
    */
    if (await page.getByTestId("completion-view").isVisible().catch(() => false)) break;

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
            hasNotText:
            /レッスン一覧へ|もどる|くわしく|変わったところ|記録|全文|送っています|飛ばす|スキップ|あとにする/,
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
  // 進み具合・応用例・アンケートは「このレッスンの記録」の一枚の中
  await openRecord(page);
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

  test("説明から、直前のレッスンへ戻れる", async ({ page }) => {
    await openRewriteLesson(page);
    await runToCompletion(page);

    await page
      .getByTestId("applied-tip-open-clear_writing_for_email")
      .click();
    await page.getByTestId("recipe-back").click();

    // 上の戻るもブラウザバックも、実際に開いた1つ前のレッスンへ戻る。
    await expect(page.getByTestId("lesson-header")).toBeVisible();
  });
});
