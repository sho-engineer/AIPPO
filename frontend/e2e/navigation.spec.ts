/**
 * 下タブの行き先。
 *
 * 役割の違う3つが「学習履歴」1枚に混ざっていたので分けた。
 *
 *     学習記録   … 何を学んだか
 *     マイ学び   … 何ができるか
 *     マイ成果物 … 何を作ったか
 *
 * 下タブに出すのは後ろの2つ。外した2つ（学習記録・あとで見る）は
 * その他とホームから開ける。**タブから消すのと、行き先ごと消すのは
 * 別のこと**——ここが切れると、押せない機能ができる。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

async function toHome(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
}

test.describe("下タブ", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("5つとも、行き先がある", async ({ page }) => {
    /*
      6つ目を足すと、375px で1つあたり 62px を切る。字が折り返し、
      帯の高さが行き先ごとに変わる。増やすときは何かを外す。
    */
    await toHome(page);

    const tabs = page.getByTestId("tab-bar").getByRole("button");
    await expect(tabs).toHaveCount(5);
    await expect(tabs).toHaveText(["ホーム", "コース", "マイ学び", "マイ成果物", "その他"]);
  });

  test("マイ学びとマイ成果物へ、1回で行ける", async ({ page }) => {
    await toHome(page);

    await page.getByRole("button", { name: "マイ学び" }).click();
    await expect(page.getByRole("heading", { name: "マイ学び" })).toBeVisible();

    await page.getByRole("button", { name: "マイ成果物" }).click();
    await expect(page.getByRole("heading", { name: "マイ成果物" })).toBeVisible();
  });

  test("外した2つも、その他から開ける", async ({ page }) => {
    await toHome(page);
    await page.getByRole("button", { name: "その他" }).click();

    await page.getByRole("button", { name: /学習記録/ }).click();
    await expect(page.getByRole("heading", { name: "学習記録" })).toBeVisible();

    await page.getByRole("button", { name: "その他" }).click();
    await page.getByRole("button", { name: /あとで見る/ }).click();
    await expect(page.getByTestId("saved-page")).toBeVisible();
  });

  test("学習記録から、隣の2つへ移れる", async ({ page }) => {
    // 分けたせいで「前はここにあったもの」が行方不明にならないこと
    await toHome(page);
    await page.getByRole("button", { name: "その他" }).click();
    await page.getByRole("button", { name: /学習記録/ }).click();

    await page.getByTestId("record-open-works").click();
    await expect(page.getByRole("heading", { name: "マイ成果物" })).toBeVisible();
  });
});
