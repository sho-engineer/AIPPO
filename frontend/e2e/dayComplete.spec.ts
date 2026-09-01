/**
 * 「Day1 終了！」の瞬間。
 *
 * 何が足りなかったか
 * ------------------
 * 完了画面には「Lesson 1 完了」という文字はあったが、**Day が
 * 終わった瞬間**が無かった。できるようになったこと・成果物・
 * スタンプ・次の行き先が縦に並ぶだけで、読み終えた感じで終わる。
 *
 * ここで守るもの
 * --------------
 * 1. 完了画面の**上に重なる**（下の画面が消えない）
 * 2. **やり直しでは出ない**（祝いを安くしない）
 * 3. **演出の途中でも閉じられる**（操作不能な時間を作らない）
 * 4. 抜けた先が完了画面（行き止まりにしない）
 * 5. 動きを減らす設定でも、中身が全部そろって出る
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/** レッスンを最後まで進めて、完了画面を出す。 */
async function runToEnd(page: Page) {
  await page.getByTestId("continue-lesson").click();
  await expect(page.getByTestId("lesson-header")).toBeVisible();

  for (let step = 0; step < 30; step += 1) {
    if (await page.getByTestId("completion-view").count()) return;

    const primary = page.getByTestId("primary-action").first();
    if (!(await primary.count())) break;

    if (await primary.isDisabled().catch(() => true)) {
      const choice = page.locator("[aria-pressed]").first();
      if (await choice.count()) {
        await choice.click();
        await page.waitForTimeout(120);
        continue;
      }
      const area = page.locator("textarea").first();
      if (await area.count()) {
        await area.fill("会議の日程を確認したいです。");
        await page.waitForTimeout(120);
        continue;
      }
      break;
    }
    await primary.click();
    await page.waitForTimeout(220);
  }
  await expect(page.getByTestId("completion-view")).toBeVisible();
}

async function start(page: Page) {
  await stubApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
}

test.describe("Day を終えた瞬間", () => {
  test("完了画面の上に重なって出る", async ({ page }) => {
    await start(page);
    await runToEnd(page);

    await expect(page.getByTestId("day-complete")).toBeVisible();
    await expect(page.getByTestId("day-complete-title")).toContainText("終了");

    // 下の完了画面は消えていない（薄く沈めるだけ）
    await expect(page.getByTestId("completion-view")).toBeAttached();
  });

  test("覚えた技と、進み具合が出る", async ({ page }) => {
    await start(page);
    await runToEnd(page);

    await expect(page.getByTestId("day-complete-skill")).toBeVisible();

    /*
      進み具合は**線の伸びだけで伝えない**。動きを止めている人にも
      分かるよう、読み上げにも数を出す。
    */
    const bar = page.getByTestId("day-complete-progress");
    await expect(bar).toHaveAttribute("aria-valuenow", /\d+/);
    await expect(bar).toHaveAttribute("aria-valuemax", /\d+/);
  });

  test("演出の途中でも閉じられる", async ({ page }) => {
    /*
      **待たせない。** 全部で0.9秒あるが、0msの時点から抜けられる。
      ここを落とすと「演出が終わるまで操作不能」に戻る。
    */
    await start(page);
    await page.getByTestId("continue-lesson").click();
    await expect(page.getByTestId("lesson-header")).toBeVisible();
    await runToEndFromHere(page);

    // 出た直後（まだ段階の途中）に押す
    await page.getByTestId("day-complete-close").click();

    await expect(page.getByTestId("day-complete")).toHaveCount(0);
    await expect(page.getByTestId("completion-view")).toBeVisible();
  });

  test("Esc と背景でも抜けられる", async ({ page }) => {
    await start(page);
    await runToEnd(page);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("day-complete")).toHaveCount(0);
    await expect(page.getByTestId("completion-view")).toBeVisible();
  });

  /*
    「やり直したときは出ない」は、ここでは見ない。

    レッスン中は下タブが出ないので、同じ教材へ戻るには完了画面から
    コースの中身を経由することになり、**検査の道のりが検査したい
    ことより長くなる**。決まりそのものは「終えた記録にこの教材が
    入っているか」の1行なので、`tests/dayComplete.test.tsx` が
    そこだけを見る。
  */

  test("動きを減らす設定でも、中身がそろっている", async ({ page }) => {
    /*
      段階を飛ばして最終形をそのまま出す。粒は出さない。
      **出さないのは飾りだけ**で、文字と数は全部そろう。
    */
    await page.emulateMedia({ reducedMotion: "reduce" });
    await start(page);
    await runToEnd(page);

    await expect(page.getByTestId("day-complete-title")).toBeVisible();
    await expect(page.getByTestId("day-complete-skill")).toBeVisible();
    await expect(page.getByTestId("day-complete-progress")).toBeVisible();
    await expect(page.getByTestId("day-complete-back")).toBeVisible();
    await expect(page.getByTestId("day-complete-particles")).toHaveCount(0);
  });
});

/** すでにレッスンに入っている状態から、完了画面まで進める。 */
async function runToEndFromHere(page: Page) {
  for (let step = 0; step < 30; step += 1) {
    if (await page.getByTestId("completion-view").count()) return;
    const primary = page.getByTestId("primary-action").first();
    if (!(await primary.count())) break;
    if (await primary.isDisabled().catch(() => true)) {
      const choice = page.locator("[aria-pressed]").first();
      if (await choice.count()) {
        await choice.click();
        await page.waitForTimeout(120);
        continue;
      }
      const area = page.locator("textarea").first();
      if (await area.count()) {
        await area.fill("会議の日程を確認したいです。");
        await page.waitForTimeout(120);
        continue;
      }
      break;
    }
    await primary.click();
    await page.waitForTimeout(220);
  }
}
