/**
 * コースのスタンプラリー。
 *
 * ここで見るのは3つ。
 *
 *   1. ホームに、いまの進み具合が丸で出る
 *   2. 節目に届いた回に、Po が反応する
 *   3. コースを完走した回に、専用の締めくくりが出て、
 *      「次のコースを見る」で本当にコース一覧へ移る
 *
 * 端末に完了記録を仕込んでから開く
 * --------------------------------
 * 節目（3個目）やコース完走（9個目）を見るには、その手前まで
 * 終えている必要がある。9本ぶんを毎回ステップから歩かせると
 * 検査が重くなりすぎるので、直前まで済んだ状態を localStorage に
 * 仕込み、最後の1本だけを本物の画面操作で終える。
 * `useCompletedLessons`（course/progress.ts）は端末の記録を
 * そのまま使うので、これは実際の使われ方と同じ経路になる。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

const SAMPLE = "来週の打ち合わせの件、資料の確認をお願いします。";

/** 指定したレッスンぶん、端末の完了記録を先に仕込む。 */
async function seedCompleted(page: Page, lessonIds: string[]): Promise<void> {
  await page.goto("/");
  await page.evaluate((ids) => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "aippo:completed",
      JSON.stringify({ lessons: ids, updatedAt: Date.now() }),
    );
  }, lessonIds);
  await page.reload();
}

async function openRewriteLesson(page: Page): Promise<void> {
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-rewrite_text").click();
}

/** 完了画面まで、機械的に押し進める（教材の種類ごとの分岐を持たない）。 */
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

test.describe("ホームのスタンプ", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("いまの進み具合が丸で出る", async ({ page }) => {
    await seedCompleted(page, ["diagnosis"]);
    await page.getByRole("button", { name: "はじめる" }).first().click();

    await expect(
      page.getByRole("img", { name: "9個中1個のスタンプが埋まっています" }),
    ).toBeVisible();
    await expect(page.getByTestId("next-milestone-hint")).toContainText("あと2レッスンで");
  });
});

test.describe("節目に届いた回", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("Poが反応する", async ({ page }) => {
    // 2本すでに終えている。rewrite_text を終えると3本目＝節目
    await seedCompleted(page, ["diagnosis", "explain_topic"]);
    await openRewriteLesson(page);
    await runToCompletion(page);

    const card = page.getByTestId("milestone-reached");
    await expect(card).toBeVisible();
    await expect(card).toContainText("3個目のスタンプ");
    await expect(card).toContainText("近日公開");

    /*
      「近日公開」は、獲得済みでないことを言う唯一の言葉。
      吹き出しは2行で切れる作りなので、ここだけは
      **文字として存在すること**では足りない——見えている必要がある。

      `toContainText` は DOM の文字を見るだけで、CSS の
      `overflow: hidden` で切れて見えなくなっていても通ってしまう。
      実際に一度、この言葉だけが切れて見えなくなっていた
      （実機のスクリーンショットで見つけた）。scrollHeight が
      clientHeight に収まっているかで、切れていないことを確かめる。
    */
    const clipped = await card.evaluate((el) => {
      const bubble = el.querySelector("p");
      if (!bubble) return true;
      return bubble.scrollHeight > bubble.clientHeight + 1;
    });
    expect(clipped, "吹き出しの文字が、枠からはみ出て隠れている").toBe(false);
  });
});

test.describe("コースを完走した回", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("専用の締めくくりが出て、次のコースへ本当に移れる", async ({ page }) => {
    // rewrite_text 以外の8本を、先に終えたことにしておく
    await seedCompleted(page, [
      "diagnosis",
      "summarize_text",
      "explain_topic",
      "compare_options",
      "make_plan",
      "improve_answer",
      "use_ai_safely",
      "final_challenge",
    ]);
    await openRewriteLesson(page);
    await runToCompletion(page);

    const card = page.getByTestId("course-complete");
    await expect(card).toBeVisible();
    await expect(card).toContainText("COURSE COMPLETE");

    // 押した先が、本当にコース一覧であること
    await page.getByTestId("course-complete-next").click();
    await expect(page.getByRole("heading", { name: "コース" })).toBeVisible();

    /*
      押しただけで終わっていないか——完了は記録されているか。

      実際に一度、これが壊れていた。「次のコースを見る」は
      「完了する」ボタンとは別の出口なので、そちらにだけ記録の処理を
      結びつけていると、この道から出た人の最後の1本が
      端末にもサーバーにも残らない（LessonRunner.tsx 参照）。
    */
    await expect(page.getByTestId("current-course-first_step_7days")).toContainText(
      "9 / 9",
    );
  });
});
