/**
 * ホームから移したものが、**移した先で使える**こと。
 *
 * ホームを4つに絞ったとき、下に積んであった3つを持ち主の画面へ返した。
 *
 *     そろそろもう一度・飛ばした解説 → マイ学び
 *     学習の道のり                   → コース
 *     ほかにも見る                   → コース（一覧そのもの）
 *
 * **消したのではなく、移した。** ここが無いと、次に触る人には「機能が
 * 減った」ようにしか見えず、同じものをホームへ積み直すことになる。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

async function openHome(page: Page): Promise<void> {
  await stubApi(page);
  await page.goto("/");
  await expect(page.getByTestId("tab-bar")).toBeVisible();
}

test("学習の道のりは、コースから1回で開ける", async ({ page }) => {
  await openHome(page);

  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();

  // 道のり（Day の並びと現在地）が出る
  await expect(page.getByTestId("open-path").or(page.getByTestId("path-progress")))
    .toBeVisible();
});

test("ほかのコースは、コースの一覧から探せる", async ({ page }) => {
  await openHome(page);

  await page.getByRole("button", { name: "コース" }).first().click();

  await expect(page.getByTestId("current-course-open")).toBeVisible();
});

test("見返しの節は、マイ学びが受け取っている", async ({ page }) => {
  /*
    「そろそろもう一度」はサーバーが返したときだけ出る。ここでは
    **出る形で仕込んで**、マイ学びに出ることを見る（ホームではなく）。
  */
  await stubApi(page);
  await page.route("**/api/lessons/review/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [{ lesson_id: "rewrite_text", due: true, last_completed_at: null }],
      }),
    });
  });
  await page.goto("/");
  await expect(page.getByTestId("tab-bar")).toBeVisible();

  // ホームには出ない
  await expect(page.getByTestId("review-prompt")).toHaveCount(0);

  await page.getByRole("button", { name: "マイ学び" }).first().click();

  await expect(page.getByTestId("review-prompt")).toBeVisible();
});

test("診断は、ホームの細い1行から後で始められる", async ({ page }) => {
  /*
    入口の案内を飛ばした人の、次の入口。**大きな面は置かない**ので、
    行1本であることも一緒に見る。
  */
  await openHome(page);

  const link = page.getByTestId("open-diagnosis");
  await expect(link).toBeVisible();
  const box = await link.boundingBox();
  // 面ではなく行。高さは指で押せる分だけ
  expect(box!.height).toBeLessThanOrEqual(56);
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await link.click();
  await expect(page.getByTestId("lesson-header")).toBeVisible();
});
