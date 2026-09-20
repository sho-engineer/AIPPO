/**
 * 学習マップを、実ブラウザで通す。
 *
 * 見るのは3つ。
 *
 *   - マイ学びから開けること（入口が埋もれていない）
 *   - 縦に長くても、横へはみ出さないこと
 *   - 足りない技から、そのレッスンへ入れること（行き止まりにしない）
 *
 * 中身の細かい出し分け（飛ばした段・準備中・あと何個）は
 * `tests/learningMap.test.tsx` が全部見ている。ここは**実際の幅で
 * 崩れないか**と**道が繋がっているか**だけを見る。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

async function toMap(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "マイ学び" }).click();
  await page.getByTestId("skills-open-map").click();
  await expect(page.getByTestId("map-levels")).toBeVisible();
}

test.describe("学習マップ", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("マイ学びから開ける", async ({ page }) => {
    await toMap(page);

    await expect(page.getByRole("heading", { name: "学習マップ" })).toBeVisible();
    await expect(page.getByTestId("map-here-1")).toBeVisible();
  });

  test("次の段に、あと何個かが出る", async ({ page }) => {
    await toMap(page);

    await expect(page.getByTestId("map-next-line")).toContainText(
      "必要な技があと2つです",
    );
  });

  test("足りない技から、そのレッスンへ入れる", async ({ page }) => {
    await toMap(page);

    await page.getByTestId("map-skill-prompt").click();

    /* 教材の中に着いていること。どの画面かは教材データが決める */
    await expect(page.getByTestId("map-levels")).toBeHidden();
    await expect(page.getByTestId("primary-action")).toBeVisible();
  });

  test("横へはみ出さない", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "スマホの幅だけ見る");
    await page.setViewportSize({ width: 320, height: 568 });
    await toMap(page);

    const slack = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(slack, "横スクロールが出ている").toBeLessThanOrEqual(0);
  });

  test("戻ると、マイ学びへ帰る", async ({ page }) => {
    await toMap(page);

    await page.goBack();

    await expect(page.getByTestId("skills-open-map")).toBeVisible();
  });
});
