/**
 * レッスンの絵。実機での見え方を確かめる。
 *
 * ここで見るのは4つ。
 *
 *   1. 縦横比が 4:3 のまま出る（引き伸ばされていない＝ポーが歪まない）
 *   2. 一覧で、絵のある行と無い行の**題の始まる位置がそろう**
 *   3. 横スクロールが出ない（iPhone の幅で）
 *   4. **絵があっても、近日公開の教材は始められない**
 *
 * 4つ目が肝心
 * -----------
 * 絵は、まだ開いていない教材のぶんも先に用意してある。公開状態は
 * 教材データの availability が決めるので、絵があることが「始められる」
 * の合図になってはいけない。ここを取り違えると、押した先に中身の無い
 * 教材が開く。
 *
 * 縦横比は jsdom では測れない（版面を持たない）ので、実機で見る。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/** iPhone の幅。ここを最優先にする。 */
const PHONE = { width: 390, height: 844 };

async function openCourseDetail(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
}

test.describe("レッスンの絵", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize(PHONE);
  });

  test("縦横比 4:3 のまま出る（引き伸ばさない）", async ({ page }) => {
    await openCourseDetail(page);

    const thumbs = page.getByTestId("lesson-thumbnail");
    await expect(thumbs.first()).toBeVisible();

    const ratios = await thumbs.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return +(r.width / r.height).toFixed(2);
      }),
    );

    expect(ratios.length).toBeGreaterThan(0);
    for (const ratio of ratios) {
      expect(ratio, "絵が引き伸ばされている（ポーが歪む）").toBeCloseTo(1.33, 1);
    }
  });

  test("絵のある行と無い行で、題の始まる位置がそろう", async ({ page }) => {
    /*
      用意できている絵は全レッスンぶんではない。何も置かずに空けると、
      そこだけ題が左へずれて、列がガタガタに見える。
    */
    await openCourseDetail(page);
    await expect(page.getByTestId("lesson-thumbnail").first()).toBeVisible();

    const lefts = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>("[data-testid^='lesson-']"),
      ).filter((el) => el.tagName === "BUTTON");
      return rows
        .map((row) => {
          // 題は行の中でいちばん大きい文字。font-bold の span を拾う
          const title = row.querySelector<HTMLElement>(".font-bold");
          return title ? Math.round(title.getBoundingClientRect().left) : null;
        })
        .filter((x): x is number => x !== null);
    });

    expect(lefts.length).toBeGreaterThan(2);
    expect(new Set(lefts).size, `題の左端がそろっていない: ${lefts}`).toBe(1);
  });

  test("iPhone の幅で、横スクロールが出ない", async ({ page }) => {
    await openCourseDetail(page);
    await expect(page.getByTestId("lesson-thumbnail").first()).toBeVisible();

    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    expect(overflows, "横に見切れている").toBe(false);
  });

  test("絵があっても、近日公開の教材は始められない", async ({ page }) => {
    /*
      公開状態を決めるのは教材データ（availability）で、絵の有無ではない。
      絵だけ先に用意してあるコースが、それだけで開いてしまわないこと。
    */
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "はじめる" }).first().click();
    await page.getByRole("button", { name: "コース" }).first().click();

    const soon = page.locator("[data-testid^='course-']");
    const count = await soon.count();

    for (let i = 0; i < count; i += 1) {
      const card = soon.nth(i);
      const button = card.locator("button").first();
      if (await button.count()) {
        await expect(
          button,
          "近日公開のコースが押せる状態になっている",
        ).toBeDisabled();
      }
    }
  });
});
