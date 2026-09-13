/**
 * AI技図鑑への行き方と、そこからの戻り方。
 *
 * 中身の出し分けは `tests/skillDex.test.tsx` が見ている。
 * ここで見るのは**導線**——開けるか、行き止まりにならないか。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";
import { serveOpenCatalog } from "./support/openLessons";
import { dismissLessonIntro } from "./support/lessonIntro";

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

    await page.getByRole("button", { name: "マイ学び" }).click();

    await expect(page.getByTestId("skill-count")).toHaveText("1 / 2");
  });

  test("まだの技から、そのレッスンへ入れる", async ({ page }) => {
    await stubApi(page, { skillDex: DEX });
    /*
      `compare_options`（Day5）は第1リリースでは準備中。ここで見たいのは
      「図鑑から、その技を learn できるレッスンへ入れること」で、
      公開範囲の話ではないので、検査のあいだだけ開ける。

      置き場所は2つとも守ること。**`stubApi` のあと**——Playwright は
      最後に登録した経路から照合するので、先に呼ぶと `stubApi` の空の
      教材に上書きされる。そして**画面を開く前**——教材は起動時に1回
      だけ聞くので、開いたあとに差し替えても届かない。
    */
    await serveOpenCatalog(page);
    await toHome(page);

    await page.getByRole("button", { name: "マイ学び" }).click();
    await page.getByTestId("skill-toggle-comparison").click();
    await page.getByTestId("skill-lesson-comparison-compare_options").click();
    /*
      レッスンは章扉（絵1枚）から始まる。章扉は `StepShell` の外なので、
      通り抜けるまで帯は出ない。
    */
    await dismissLessonIntro(page);

    // 読んで終わりにしない。その場から学びに行ける
    await expect(page.getByTestId("lesson-progress")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "自分の基準で並べる",
    );
  });

  test("行き止まりにしない（ホームへ戻れる）", async ({ page }) => {
    await stubApi(page, { skillDex: DEX });
    await toHome(page);

    await page.getByRole("button", { name: "マイ学び" }).click();
    /*
      名前は丸ごと一致で探す。帯のロゴにも「ホームへ戻る」が付いたので、
      部分一致だと2つに当たる（ここで見たいのは下タブのほう）。
    */
    await page.getByRole("button", { name: "ホーム", exact: true }).click();

    await expect(page.getByTestId("next-up")).toBeVisible();
  });

  test("1つも覚えていなくても、数え始めの 0 として出す", async ({ page }) => {
    /*
      前は隠していた。いまは「今週の学習」と横に並ぶので、片方だけ
      消すと器が欠ける。0 は始まりの姿であって、できていないという
      指摘ではない——だから「0こ 覚えました」とは書かない。
    */
    await stubApi(page);
    await toHome(page);

    const card = page.getByTestId("skill-summary");
    await expect(card).toBeVisible();
    await expect(card).toContainText("身についたこと");
    await expect(card).not.toContainText("AI技");
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
