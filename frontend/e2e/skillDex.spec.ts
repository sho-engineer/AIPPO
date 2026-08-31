/**
 * AI技図鑑への行き方と、そこからの戻り方。
 *
 * 中身の出し分けは `tests/skillDex.test.tsx` が見ている。
 * ここで見るのは**導線**——開けるか、行き止まりにならないか。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

const DEX = {
  skills: [
    {
      slug: "tone",
      name: "トーン指定",
      one_line: "文章の雰囲気を指定する",
      description: "雰囲気を言葉にして渡すと、書き直しの回数が減る。",
      example: "ていねいな言い方にしてください",
      acquired: true,
      acquired_at: "2026-08-20T10:00:00+09:00",
      lessons: [
        { slug: "rewrite_text", title: "文章を分かりやすくする", course_slug: "foundation" },
      ],
    },
    {
      slug: "comparison",
      name: "比較",
      one_line: "複数の案を出して見比べる",
      description: "比べる基準を自分で決めて、並べて見る。",
      example: "費用と手間の2つで比べてください",
      acquired: false,
      acquired_at: null,
      lessons: [
        { slug: "compare_options", title: "選択肢を比較する", course_slug: "foundation" },
      ],
    },
  ],
  acquired_count: 1,
  total_count: 2,
  combos: [
    {
      skills: ["tone", "comparison"],
      name: "選べる材料",
      one_line: "並べて、確かめてから決める",
      complete: false,
    },
  ],
  xp: { total: 30, level: "AI Starter", next_level: "AI Beginner", to_next: 70 },
};

async function toHome(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
}

test.describe("AI技図鑑", () => {
  test("下タブから開ける", async ({ page }) => {
    await stubApi(page, { skillDex: DEX });
    await toHome(page);

    await page.getByRole("button", { name: "AI技" }).click();

    await expect(page.getByTestId("skill-count")).toHaveText("1 / 2");
  });

  test("まだの技から、そのレッスンへ入れる", async ({ page }) => {
    await stubApi(page, { skillDex: DEX });
    await toHome(page);

    await page.getByRole("button", { name: "AI技" }).click();
    await page.getByTestId("skill-toggle-comparison").click();
    await page.getByTestId("skill-lesson-comparison-compare_options").click();

    // 読んで終わりにしない。その場から学びに行ける
    await expect(page.getByTestId("lesson-progress")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "自分の基準で並べる",
    );
  });

  test("行き止まりにしない（ホームへ戻れる）", async ({ page }) => {
    await stubApi(page, { skillDex: DEX });
    await toHome(page);

    await page.getByRole("button", { name: "AI技" }).click();
    /*
      名前は丸ごと一致で探す。帯のロゴにも「ホームへ戻る」が付いたので、
      部分一致だと2つに当たる（ここで見たいのは下タブのほう）。
    */
    await page.getByRole("button", { name: "ホーム", exact: true }).click();

    await expect(page.getByTestId("next-up")).toBeVisible();
  });

  test("1つも覚えていない人は、ホームにこの節が出ない", async ({ page }) => {
    // 「0こ」を置いても、できることが増えていないと言われるだけになる
    await stubApi(page);
    await toHome(page);

    await expect(page.getByTestId("skill-summary")).toHaveCount(0);
  });

  test("覚えた人には、ホームから直接ひらける", async ({ page }) => {
    await stubApi(page, { skillDex: DEX });
    await page.route("**/api/v1/progress/", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          lessons: [],
          completed_count: 0,
          in_progress_count: 0,
          skills: ["tone"],
          signed_in: false,
          xp: { total: 30, level: "AI Starter", next_level: "AI Beginner", to_next: 70 },
        }),
      }),
    );
    await toHome(page);

    await page.getByTestId("skill-summary").click();

    await expect(page.getByTestId("skill-count")).toBeVisible();
  });
});
