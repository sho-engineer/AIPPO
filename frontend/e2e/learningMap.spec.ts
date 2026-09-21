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

  test("挑戦がまだのうちは、押せない", async ({ page }) => {
    /*
      押せるのに何も起きないより、押せないと分かるほうがよい。
      何をすれば開くかは、字で出ている。
    */
    await toMap(page);

    const node = page.getByTestId("map-challenge-2");
    await expect(node).toHaveAttribute("data-open", "false");
    await expect(node).toHaveJSProperty("tagName", "DIV");
  });

  test("技がそろうと、挑戦を開いて段が上がる", async ({ page }) => {
    /*
      **上がるのは2つそろったときだけ。** ここは画面の道すじを見る
      （技がそろっている状態を配り、挑戦を通す）。条件そのものは
      サーバー側が決めていて、backend の検査が見張っている。
    */
    const ready = {
      number: 2,
      name: "頼む",
      description: "目的を伝えて、基本的な仕事をAIに頼める",
      status: "locked",
      skipped: false,
      remaining: 0,
      has_challenge: true,
      challenge_open: true,
      skills: [
        {
          slug: "prompt",
          name: "プロンプト",
          one_line: "してほしいことをAIに伝える",
          status: "earned",
          lessons: ["rewrite_text"],
        },
      ],
    };
    await stubApi(page, {
      levelMap: {
        current_level: 1,
        reached_by: "diagnosis",
        levels: [
          {
            number: 1,
            name: "試す",
            description: "AIに質問したり、簡単な文章生成を試せる",
            status: "current",
            skipped: false,
            skills: [],
            remaining: 0,
            has_challenge: false,
            challenge_open: false,
          },
          ready,
        ],
        next: ready,
      },
    });
    await page.route("**/api/v1/rewards/challenge/2/", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            passed: true,
            missing: [],
            missing_labels: [],
            level_up: true,
            current_level: 2,
            remaining_skills: 0,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          level: 2,
          title: "目的を伝えて、頼んでみる",
          scenario: "先週の打ち合わせのメモが、そのままでは長くて読めません。",
          estimated_minutes: 2,
          check_labels: ["目的"],
          open: true,
          remaining: 0,
        }),
      });
    });

    await toMap(page);
    await page.getByTestId("map-challenge-2").click();

    await expect(page.getByTestId("challenge-scenario")).toBeVisible();
    await page
      .getByTestId("challenge-answer")
      .fill("来週の会議で共有するために、この議事録の要点をまとめてください。");
    await page.getByTestId("challenge-send").click();

    await expect(page.getByTestId("challenge-levelup")).toContainText(
      "Lv.2 になりました",
    );
  });

  test("戻ると、マイ学びへ帰る", async ({ page }) => {
    await toMap(page);

    await page.goBack();

    await expect(page.getByTestId("skills-open-map")).toBeVisible();
  });
});
