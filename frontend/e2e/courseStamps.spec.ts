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

import { openRecord } from "./support/openRecord";
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

test.describe("ホームのスタンプ", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("いまの進み具合が丸で出る", async ({ page }) => {
    await seedCompleted(page, ["diagnosis"]);
    await page.getByRole("button", { name: "はじめる" }).first().click();

    /*
      本数は決め打ちにしない。ここは通信を差し替えて動かすので、
      並ぶのは同梱の控えぶん——**サーバーが配る本数とは違う**。
      見たいのは「終えた数が丸に出ること」なので、そこだけを見る。
    */
    await expect(
      page.getByRole("img", { name: /\d+個中1個のスタンプが埋まっています/ }),
    ).toBeVisible();
    await expect(page.getByTestId("next-milestone-hint")).toContainText("あと2レッスンで");
  });
});

test.describe("節目に届いた回", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("ここまでで何ができるようになったかが出る", async ({ page }) => {
    // 2本すでに終えている。rewrite_text を終えると3本目＝節目
    await seedCompleted(page, ["diagnosis", "explain_topic"]);
    await openRewriteLesson(page);
    await runToCompletion(page);

    const card = page.getByTestId("course-checkpoint");
    await expect(card).toBeVisible();
    await expect(card).toContainText("3個目のスタンプ");
    await expect(card).toContainText("近日公開");

    // 数と特典の話だけで終わらせない。積み上がったことを出す
    await expect(page.getByTestId("checkpoint-outcomes")).toContainText(
      "読む相手を伝えて、説明のしかたを変えられる",
    );

    /*
      「近日公開」は、獲得済みでないことを言う唯一の言葉。

      `toContainText` は DOM の文字を見るだけで、CSS の
      `overflow: hidden` で切れて見えなくなっていても通ってしまう。
      実際に一度、この言葉だけが切れて見えなくなっていた
      （実機のスクリーンショットで見つけた）。scrollHeight が
      clientHeight に収まっているかで、切れていないことを確かめる。

      いまは吹き出しの外の1行に置いてあるが、**置き場所が変わっても
      切れていないこと**を見張り続ける。
    */
    const clipped = await card.evaluate((el) => {
      const line = [...el.querySelectorAll("p")].find((node) =>
        (node.textContent ?? "").includes("近日公開"),
      );
      if (!line) return true;
      return line.scrollHeight > line.clientHeight + 1;
    });
    expect(clipped, "「近日公開」が、枠からはみ出て隠れている").toBe(false);
  });
});

test.describe("コースを完走した回", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("専用の締めくくりが出て、次のコースへ本当に移れる", async ({ page }) => {
    /*
      rewrite_text 以外を、先に終えたことにしておく。

      並ぶのは同梱の控えぶん（通信を差し替えているため）。
      「AIへの頼み方」「計画を立てる」はコースの見直しで
      AI活用コースへ移したので、ここには入らない。
    */
    await seedCompleted(page, [
      "diagnosis",
      "summarize_text",
      "explain_topic",
      "compare_options",
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
    // 本数は決め打ちにしない（同梱の控えぶんが並ぶ）。
    // 見るのは「分母と分子が同じ＝最後の1本が残っている」ことだけ
    await expect(page.getByTestId("current-course-first_step_7days")).toContainText(
      /(\d+) \/ \1/,
    );
  });
});
