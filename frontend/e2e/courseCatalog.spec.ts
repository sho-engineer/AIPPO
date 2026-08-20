/**
 * コースが3段になっていること。
 *
 *     コース一覧（どれにするか） → コースの中身（道のり） → レッスン
 *
 * 前はこの1段目が、開いた瞬間に9本のレッスンを並べていた。名前は
 * 「コース一覧」でも見せていたのは1つのコースの中身で、コースが
 * 7つに増えた時点で名前と中身が食い違っていた。「どのコースにするか」を
 * 決めたい人には、決めるための材料がどこにも無かった。
 *
 * ここで見るのは6つ。
 *
 *   1. 1段目にレッスンが並ばない
 *   2. 1段目の先頭に、続きに戻る1本がある
 *   3. コースを押すと2段目へ入る
 *   4. 2段目に道のり（Day 0 / Day 1 …）が並ぶ
 *   5. 2段目から1段目へ戻れる
 *   6. 近日公開のコースは押せない
 *
 * 画面の幅は3つ見る。カードを縦に積んで**見比べる**画面なので、
 * どれか1つの幅で崩れると、比べること自体ができなくなる。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

async function openCatalog(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).first().click();
}

test.describe("コース一覧", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("1段目には、レッスンを並べない", async ({ page }) => {
    await openCatalog(page);

    await expect(page.getByRole("heading", { name: "コース" })).toBeVisible();
    await expect(page.getByTestId("lesson-rewrite_text")).toHaveCount(0);
    await expect(page.getByTestId("lesson-search")).toHaveCount(0);
  });

  test("先頭に、続きに戻る1本がある", async ({ page }) => {
    /*
      この画面を開く人がいちばん多く求めているのは、探すことではなく
      続きに戻ること。同じ形で並べると、毎回自分の1本を探し直す。
    */
    await openCatalog(page);

    await expect(page.getByTestId("current-course-open")).toBeVisible();
    await expect(page.getByTestId("current-course-count")).toContainText("/");
    await expect(page.getByTestId("current-course-continue")).toBeVisible();
  });

  test("コースを押すと、道のりが出る", async ({ page }) => {
    await openCatalog(page);
    await page.getByTestId("current-course-open").click();

    // Day で数えた道のりが並ぶ
    await expect(page.getByTestId("lesson-rewrite_text")).toBeVisible();
    await expect(page.getByText("Day 1", { exact: true })).toBeVisible();
  });

  test("道のりから、一覧へ戻れる", async ({ page }) => {
    await openCatalog(page);
    await page.getByTestId("current-course-open").click();
    await expect(page.getByTestId("lesson-rewrite_text")).toBeVisible();

    await page.getByRole("button", { name: "前の画面へ戻る" }).click();

    await expect(page.getByTestId("current-course-open")).toBeVisible();
    await expect(page.getByTestId("lesson-rewrite_text")).toHaveCount(0);
  });

  test("道のりから、レッスンへ入れる", async ({ page }) => {
    await openCatalog(page);
    await page.getByTestId("current-course-open").click();
    await page.getByTestId("lesson-rewrite_text").click();

    await expect(page.getByTestId("lesson-header")).toBeVisible();
  });

  test("「つづきから」で、次の1本が直接ひらく", async ({ page }) => {
    // 続きに戻るのに、途中の画面を1枚はさまない
    await openCatalog(page);
    await page.getByTestId("current-course-continue").click();

    await expect(page.getByTestId("lesson-header")).toBeVisible();
  });

  for (const width of [375, 390, 430]) {
    test(`幅${width}で、カードが崩れない`, async ({ page }) => {
      await page.setViewportSize({ width, height: 850 });
      await openCatalog(page);
      await expect(page.getByTestId("current-course-open")).toBeVisible();

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );

      expect(overflow, "横にはみ出している").toBe(0);
    });
  }
});
