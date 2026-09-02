/**
 * 主導線だけで終われる（Day1）。
 *
 * 前は19画面あって、**全部通らないと終われなかった**。7〜9分。
 * 仕事終わりに開ける長さではない。
 *
 * いまは9画面で1つの技が身につく（送る → 変わる → 見比べる →
 * 名前を知る）。そこで一度終われる。続けたい人だけが下へ進む。
 *
 * 見張るのは3つ。
 *
 *   1. 主導線だけで完了画面まで行けること
 *   2. **やり切った人が「途中」に見えないこと**（帯が最後まで行く）
 *   3. 深める回が**消えていない**こと（続けた人には出る）
 */

import { expect, test, type Page, type Locator } from "@playwright/test";

import { stubApi } from "./support/stubApi";

const SAMPLE = "来週の打ち合わせの件、資料の確認をお願いします。";

async function blocked(primary: Locator): Promise<boolean> {
  if (await primary.isDisabled()) return true;
  return (await primary.getAttribute("aria-disabled")) === "true";
}

async function openRewrite(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-rewrite_text").click();
  await expect(page.getByTestId("primary-action").first()).toBeVisible();
}

async function advance(page: Page): Promise<boolean> {
  const primary = page.getByTestId("primary-action").first();
  if (!(await primary.isVisible().catch(() => false))) return false;

  if (await blocked(primary)) {
    const box = page.locator("textarea:visible").first();
    if (await box.count()) {
      await box.fill(SAMPLE);
    } else {
      const choice = page
        .locator("main button:visible")
        .filter({
          hasNotText:
            /レッスン一覧へ|もどる|くわしく|変わったところ|記録|全文|送っています|飛ばす|スキップ|あとにする|次のレッスンへ/,
        })
        .first();
      if (await choice.count()) await choice.click();
    }
    await page.waitForTimeout(80);
  }
  if (await blocked(primary)) return false;

  await primary.click();
  return true;
}

/** 「自分の文章でも試す？」まで、主導線を進める。 */
async function toBranch(page: Page): Promise<number> {
  await openRewrite(page);
  let screens = 1;
  for (let i = 0; i < 15; i++) {
    if (
      await page
        .getByRole("heading", { name: "自分の文章でも試す？" })
        .isVisible()
        .catch(() => false)
    ) {
      return screens;
    }
    if (!(await advance(page))) break;
    screens += 1;
    await page.waitForTimeout(150);
  }
  throw new Error(`分かれ道まで届かなかった（${screens}画面）`);
}

test.describe("主導線だけで終われる", () => {
  test("9画面前後で分かれ道に着く", async ({ page }) => {
    await stubApi(page);

    const screens = await toBranch(page);

    // 前は分かれ道が無く、19画面を通り切るしかなかった
    expect(screens).toBeLessThanOrEqual(11);
  });

  test("「次のレッスンへ」で、そのまま完了できる", async ({ page }) => {
    await stubApi(page);
    await toBranch(page);

    await page.getByRole("button", { name: "次のレッスンへ" }).click();

    await expect(page.getByTestId("completion-view")).toBeVisible();
  });

  test("**やり切った人が「途中」に見えない**", async ({ page }) => {
    /*
      任意の回を分母に入れていると、9画面をやり切った人が
      「9 / 19」で終わる。最後まで来たのに途中でやめたように見える。
    */
    await stubApi(page);
    await toBranch(page);

    /*
      見るのは**分かれ道にいるとき**。完了画面で見ても分からない
      ——`completion` は並びの最後なので、任意の回を分母に入れていても
      「19 / 19」で釣り合ってしまう（最初そこを見ていて、壊しても
      落ちなかった）。

      分母に効いているかは、まだ主導線にいるあいだにしか見えない。

      `aria-valuetext` も見ない。あちらは区切りの名前を持っていて、
      歩数の数え方では変わらない。
    */
    const bar = page.getByTestId("lesson-progress").first();
    const current = Number(await bar.getAttribute("aria-valuenow"));
    const total = Number(await bar.getAttribute("aria-valuemax"));

    // 主導線は10画面ほど。19（任意の回を含む数）になっていないこと
    expect(total).toBeLessThan(13);
    expect(total - current).toBeLessThanOrEqual(1);
  });

  test("深める回は消えていない（続けた人には出る）", async ({ page }) => {
    /*
      位置を変えただけで、消したのではない。「自分の文章で試す」を
      選んだ人には、これまでどおり相手・トーン・反復が出る。
    */
    await stubApi(page);
    await toBranch(page);

    await page.getByTestId("primary-action").first().click();

    await expect(
      page.getByRole("heading", { name: "誰が読みますか" }),
    ).toBeVisible();
  });
});
