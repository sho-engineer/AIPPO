/**
 * 上の帯の中央が、**画面の中央**であること。
 *
 * なぜ検査が要るか
 * ----------------
 * ロゴは帯の中で唯一の縦の基準になる。そこが少しずれると、
 * 左右のボタンは同じ場所にあるのに帯全体が傾いて見える。
 * そして「傾いて見える」は、目で見て気づくまで誰も直さない。
 *
 * 実際に起きた。`centered` は左（←、40px）と右（鈴＋似顔絵、80px）に
 * 挟まれた**残りの幅**の真ん中へロゴを置いていて、ロゴは 22px 左へ
 * ずれていた。左右の重さが違えば残りの幅の中心は画面の中心ではない、
 * という当たり前のことが、書いたときには見えていなかった。
 *
 * なぜ E2E なのか
 * ---------------
 * ここで見たいのは**位置**で、位置は本物のブラウザにしか無い。
 * jsdom（vitest）の getBoundingClientRect はすべて 0 を返すので、
 * 単体テストでは「中央にある」を書いても何も確かめられない。
 * 通ってしまう検査は、無い検査より悪い。
 *
 * 幅を3つ見るのは、片側の欄の幅が固定で、もう片方が可変のとき、
 * 1つの幅でだけ揃うことがあるため。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/** ずれの許容。四捨五入で1px動くことはあるが、それ以上は理由がある。 */
const TOLERANCE = 1;

async function logoOffset(page: Page): Promise<number> {
  const logo = await page.getByTestId("brand-logo").first().boundingBox();
  if (!logo) throw new Error("ロゴが見つからない");

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("画面の幅が取れない");

  return logo.x + logo.width / 2 - viewport.width / 2;
}

async function openSettings(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "その他" }).first().click();
  await expect(page.getByRole("heading", { name: "設定" })).toBeVisible();
}

test.describe("上の帯", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  for (const width of [375, 390, 430]) {
    test(`幅${width}で、ロゴが画面の中央にある`, async ({ page }) => {
      await page.setViewportSize({ width, height: 850 });
      await openSettings(page);

      expect(Math.abs(await logoOffset(page))).toBeLessThanOrEqual(TOLERANCE);
    });
  }

  test("戻るボタンは、ロゴに重ならない", async ({ page }) => {
    /*
      中央のロゴは flex の並びから外してある（絶対配置）。外した以上、
      左右の部品と重ならないことは自動では保証されない。
      狭いほうの幅で確かめる。
    */
    await page.setViewportSize({ width: 375, height: 850 });
    await openSettings(page);

    const back = await page.getByRole("button", { name: "前の画面へ戻る" }).boundingBox();
    const logo = await page.getByTestId("brand-logo").first().boundingBox();

    expect(back).not.toBeNull();
    expect(logo).not.toBeNull();
    expect(back!.x + back!.width).toBeLessThanOrEqual(logo!.x);
  });

  test("戻るボタンは、ロゴの下敷きになっても押せる", async ({ page }) => {
    /*
      絶対配置は、重なった相手の操作を奪う。

      ロゴは**押せる**（ホームへ戻る）ので、以前のように pointer-events を
      切って逃げる手は使えない。重ならないことでしか守れない。
      幅が狭いほうで確かめる。
    */
    await page.setViewportSize({ width: 375, height: 850 });
    await openSettings(page);

    await page.getByRole("button", { name: "前の画面へ戻る" }).click();

    await expect(page.getByTestId("tab-bar")).toBeVisible();
    await expect(page.getByRole("heading", { name: "設定" })).toHaveCount(0);
  });

  test("ロゴを左に置く画面では、左のまま", async ({ page }) => {
    // 中央寄せは戻れる画面だけ。ホームは左揃えで、そこは変えていない
    await page.setViewportSize({ width: 390, height: 850 });
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "はじめる" }).first().click();
    await expect(page.getByTestId("tab-bar")).toBeVisible();

    expect(await logoOffset(page)).toBeLessThan(-50);
  });
});
