/**
 * 近日公開の教材。
 *
 * 教材9本の中身が揃ったので、取り込みの既定は全部が始められるに変えた。
 * それでも止める仕組みは残す（未完成の教材を足すとき、問題が見つかって
 * 一時的に閉じるとき）。ここではその仕組みを、サーバーから近日公開として
 * 届いた場合の画面の振る舞いで確かめる。
 *
 * 近日公開は一覧に**出すが始められない**。
 * 一覧から消すと、続きがあることが伝わらない。
 *
 * 押せなくするのは画面の仕事だが、最後の砦はサーバー
 * （`backend/apps/catalog/access.py`）。ここでは画面側だけを見る。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/** サーバーが配る教材。1本だけ開いていて、1本は近日公開。 */
const CATALOG = {
  courses: [
    {
      id: "first_step_7days",
      title: "7日でAIの最初の一歩",
      description: "テスト用のコース",
      lessons: [
        {
          id: "rewrite_text",
          number: 1,
          title: "文章を分かりやすくする",
          goal: "伝わる文章にする",
          outcomes: [],
          tags: [],
          usesAi: true,
          availability: "available",
          steps: [
            { id: "intro", type: "intro", title: "はじめに", instruction: "始めます" },
          ],
        },
        {
          id: "summarize_text",
          number: 2,
          title: "長い文章を短くまとめる",
          goal: "要点だけ取り出す",
          outcomes: [],
          tags: [],
          usesAi: true,
          availability: "coming_soon",
          comingSoonMessage: "2026年9月ごろ公開予定です。",
          steps: [],
        },
      ],
    },
  ],
};

async function toCourse(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).click();
  // コースは3段（一覧 → 中身 → レッスン）。近日公開の教材が並ぶのは2段目
  await page.getByTestId("current-course-open").click();
}

test.describe("近日公開", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page, { catalog: CATALOG });
  });

  test("一覧には出る", async ({ page }) => {
    await toCourse(page);

    await expect(page.getByTestId("lesson-summarize_text")).toBeVisible();
  });

  test("押せない", async ({ page }) => {
    await toCourse(page);

    await expect(page.getByTestId("lesson-summarize_text")).toBeDisabled();
  });

  test("いつ頃かが分かる", async ({ page }) => {
    await toCourse(page);

    await expect(page.getByTestId("lesson-summarize_text")).toContainText("2026年9月");
  });

  test("開いている教材は押せる", async ({ page }) => {
    await toCourse(page);

    await expect(page.getByTestId("lesson-rewrite_text")).toBeEnabled();
  });
});

test.describe("サーバーの教材が届かないとき", () => {
  test("同梱の教材で動く（真っ白にしない）", async ({ page }) => {
    await stubApi(page);
    // 届かない状態を作る
    await page.route("**/api/v1/catalog/", (route) => route.abort());

    await toCourse(page);

    // 教材が1本も無い画面は「壊れている」のと見分けがつかない
    await expect(page.getByTestId("lesson-rewrite_text")).toBeVisible();
  });
});
