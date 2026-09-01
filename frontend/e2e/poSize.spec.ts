/**
 * ポーの大きさが、画面をまたいで揃っていること。
 *
 * 何が起きていたか
 * ----------------
 * 画面ごとに違う部品が、その場で決めた幅を直書きしていた。
 * 390px で実際に測ると、見えている背丈がこうなっていた。
 *
 *     コース一覧    35px
 *     ホーム        46px
 *     レッスン     104px   ← コース一覧の 3倍
 *     同じレッスン   81px   ← 進むだけで 22% 縮む
 *
 * 最後の1行の原因は `StepShell` の `compact={!eyebrow}` で、
 * **小さな前置きが有るか無いかという、ポーとは何の関係もない条件**で
 * 背丈が変わっていた。「同じ子がいる」ではなく「画面ごとに別の画像を
 * 置いている」ように見えるのは、ここが直接の原因だった。
 *
 * なぜ E2E なのか
 * ---------------
 * 見たいのは**実際に画面へ出た大きさ**で、それは本物のブラウザにしか
 * ない。jsdom の getBoundingClientRect はすべて 0 を返すので、
 * 単体テストでは「揃っている」と書いても何も確かめられない。
 * 通ってしまう検査は、無い検査より悪い。
 *
 * 枠ではなく、見える背丈で測る
 * ----------------------------
 * 絵の台紙（512×512）には透明の余白が入っていて、枠の大きさと
 * 見えるポーの大きさは一致しない。neutral の絵は台紙の 72.3% の
 * 高さしか使っていないので、**枠 × 0.723 が見える背丈**になる。
 * 絵を差し替えて余白が変わったら、この係数も測り直すこと
 * （`src/po/assets.ts` の PO_BOX）。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/** 台紙に対する neutral の背丈（`PO_BOX.neutral.height`）。 */
const VISIBLE_RATIO = 0.723;

/** 段ごとの、見えてほしい背丈（`src/po/sizes.ts`）。 */
const EXPECTED = { sm: 56, md: 96, lg: 112, celebration: 132 } as const;

/** 丸めと小数のぶれ。これ以上ずれたら理由がある。 */
const TOLERANCE = 2;

/**
 * 測る先は**絵の枠**（`[data-po-frame]`）。`po-avatar` ではない。
 *
 * `po-avatar` は部品によって指すものが違う。`PoGreeting` は顔だけを
 * 指すが、`PoAvatar` は顔と吹き出しを囲む `aside` を指すので、
 * **吹き出しが2行になった画面では吹き出しの高さを測ってしまう**
 * （実際それで 56px のはずが 64px と出て、この検査が最初に落ちた）。
 *
 * 枠はどの部品でも「絵1枚ぶん」なので、比べる先として揺れない。
 *
 * `boundingBox()` は使わない
 * --------------------------
 * ポーはふだん `animate-float` で ±1.2° 傾きながら浮いている。
 * 傾いた要素の外接矩形は元より大きくなるので、155px の枠が 158px と
 * 出る（実際それでこの検査が落ちた）。**見たいのは枠の寸法**なので、
 * 変形の影響を受けない `offsetWidth` を読む。
 */
async function visibleHeight(page: Page): Promise<number> {
  const frame = await page
    .locator("[data-po-frame]")
    .first()
    .evaluate((element) => (element as HTMLElement).offsetWidth);
  if (!frame) throw new Error("ポーが見つからない");
  return frame * VISIBLE_RATIO;
}

async function expectSize(page: Page, size: keyof typeof EXPECTED, where: string) {
  const actual = await visibleHeight(page);
  expect(
    Math.abs(actual - EXPECTED[size]),
    `${where}: 見える背丈が ${actual.toFixed(0)}px（${size} は ${EXPECTED[size]}px のはず）`,
  ).toBeLessThanOrEqual(TOLERANCE);
}

async function start(page: Page) {
  await stubApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
}

test.describe("ポーの大きさ", () => {
  test("一覧まわりは、どこでも同じ背丈", async ({ page }) => {
    await start(page);
    await expectSize(page, "sm", "ホーム");

    await page.getByRole("button", { name: "コース", exact: true }).first().click();
    await expect(page.locator("[data-po-frame]").first()).toBeVisible();
    await expectSize(page, "sm", "コース一覧");

    await page.getByTestId("current-course-open").click();
    await expect(page.getByTestId("course-outline")).toBeVisible();
    await expectSize(page, "sm", "コースの中身");
  });

  test("レッスンの中で、進んでも背丈が変わらない", async ({ page }) => {
    /*
      **この検査がこの回の中心。** `compact={!eyebrow}` が戻ると、
      前置きの無い画面だけ 22% 縮んでここで落ちる。
    */
    await start(page);
    await page.getByTestId("continue-lesson").click();
    await expect(page.getByTestId("lesson-header")).toBeVisible();

    // 入りの画面（完成イメージ）だけ、ひとまわり大きい
    await expectSize(page, "lg", "レッスンの入り");

    const seen: number[] = [];
    for (let step = 0; step < 12; step += 1) {
      const primary = page.getByTestId("primary-action").first();
      if (!(await primary.count())) break;

      if (await primary.isDisabled().catch(() => true)) {
        const choice = page.locator("[aria-pressed]").first();
        if (await choice.count()) {
          await choice.click();
          await page.waitForTimeout(150);
          continue;
        }
        const area = page.locator("textarea").first();
        if (await area.count()) {
          await area.fill("会議の日程を確認したいです。");
          await page.waitForTimeout(150);
          continue;
        }
        break;
      }

      await primary.click();
      await page.waitForTimeout(400);

      // ポーが居ない画面は飛ばす（居ないこと自体は poPresence の担当）
      if (!(await page.locator("[data-po-frame]").first().count())) continue;
      seen.push(await visibleHeight(page));
    }

    expect(seen.length, "ポーの出る画面を1つも通らなかった").toBeGreaterThan(1);
    for (const height of seen) {
      expect(
        Math.abs(height - EXPECTED.md),
        `レッスン中に ${height.toFixed(0)}px（md は ${EXPECTED.md}px のはず）`,
      ).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  test("画面ごとに幅を直書きしていない", async ({ page }) => {
    /*
      段は4つしか無いので、**画面に出るポーの背丈も4通りしかない**。
      直書きが1つでも戻れば、5通り目が現れてここで落ちる。

      名前で見張るのではなく、出た値そのものを見る。新しい画面が
      増えても、そこが勝手な幅を書けばやはり落ちる。
    */
    await start(page);
    const allowed = Object.values(EXPECTED);

    for (const open of [
      async () => {
        await page.getByRole("button", { name: "コース", exact: true }).first().click();
      },
      async () => {
        await page.getByTestId("current-course-open").click();
      },
    ]) {
      await open();
      await page.waitForTimeout(300);
      if (!(await page.locator("[data-po-frame]").first().count())) continue;
      const height = await visibleHeight(page);
      const near = allowed.some((value) => Math.abs(height - value) <= TOLERANCE);
      expect(near, `段に無い背丈 ${height.toFixed(0)}px が出ている`).toBe(true);
    }
  });
});
