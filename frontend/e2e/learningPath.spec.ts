/**
 * コースの道のり（縦一本の並び）。実機で見ないと分からないところ。
 *
 *   1. Day・節・題の**始まる位置が全行でそろう**（桁が崩れていない）
 *   2. 上下をつなぐ線が**途切れない**（1本の道に見える）
 *   3. 進む口が出るのは、いまの1本だけ
 *   4. 終えた回・いまの回・これからの回が、見た目で区別できる
 *   5. iPhone の幅で横に見切れない
 *
 * 1 と 2 は版面を持たないと測れないので、ここで見る。
 * 状態の決まり方そのものは tests/lessonTimeline.test.tsx が受け持つ。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";
import { dismissLessonIntro } from "./support/lessonIntro";

const PHONE = { width: 390, height: 844 };

/** 指定したレッスンぶん、端末の完了記録を先に仕込む。 */
async function seedCompleted(page: Page, lessonIds: string[]): Promise<void> {
  await page.goto("/");
  await page.evaluate((ids) => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "aippo:completed",
      JSON.stringify({ lessons: ids, updatedAt: Date.now() }),
    );
  }, lessonIds);
  await page.reload();
}

async function openPath(page: Page): Promise<void> {
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("next-up")).toBeVisible();
  await page.getByTestId("open-path").click();
  await expect(page.getByTestId("course-outline")).toBeVisible();
}

/** 行ごとの、Day・節・題の左端。 */
async function columns(page: Page) {
  return page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        "[data-testid='course-outline'] button[data-testid^='lesson-']",
      ),
    );
    return rows.map((row) => {
      const at = (index: number) =>
        Math.round(row.children[index].getBoundingClientRect().left);
      return {
        id: row.dataset.testid,
        status: row.dataset.status,
        day: at(0),
        node: at(1),
        title: at(2),
      };
    });
  });
}

test.describe("コースの道のり", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize(PHONE);
  });

  test("Day・節・題の始まる位置が、全行でそろう", async ({ page }) => {
    /*
      幅を固定しないと、題の長さで Day の位置が動き、縦に読み下せない。
      9行あるので、ここが崩れると一気に読みにくくなる。
    */
    await seedCompleted(page, ["diagnosis", "rewrite_text"]);
    await openPath(page);

    const rows = await columns(page);
    expect(rows.length).toBeGreaterThan(3);

    for (const key of ["day", "node", "title"] as const) {
      const distinct = new Set(rows.map((row) => row[key]));
      expect(
        distinct.size,
        `${key} の左端がそろっていない: ${[...distinct].join(", ")}`,
      ).toBe(1);
    }
  });

  test("上下をつなぐ線が、行の切れ目で途切れない", async ({ page }) => {
    /*
      1行ずつ内側で閉じると、行の余白のぶんだけ線が切れて
      「1本の道」に見えなくなる。行をまたいで続いていることを見る。
    */
    await seedCompleted(page, ["diagnosis"]);
    await openPath(page);

    const gaps = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-testid='course-outline'] button[data-testid^='lesson-']",
        ),
      );
      // 線は節の列の中で、幅1pxの span として引いている
      const segments = rows.flatMap((row) =>
        Array.from(row.children[1].querySelectorAll<HTMLElement>(":scope > span"))
          .map((span) => span.getBoundingClientRect())
          .filter((r) => r.width < 4)
          .map((r) => ({ top: r.top, bottom: r.bottom })),
      );

      segments.sort((a, b) => a.top - b.top);

      const found: number[] = [];
      for (let i = 0; i < segments.length - 1; i += 1) {
        const gap = segments[i + 1].top - segments[i].bottom;
        // 節（丸）のぶんは空く。それ以外の隙間だけを数える
        if (gap > 0.5 && gap < 20) found.push(Math.round(gap));
      }
      return found;
    });

    expect(gaps, `線が途切れている: ${gaps.join(", ")}`).toEqual([]);
  });

  test("進む口が出るのは、いまの1本だけ", async ({ page }) => {
    await seedCompleted(page, ["diagnosis", "rewrite_text"]);
    await openPath(page);

    const timeline = page.getByTestId("course-outline");
    await expect(timeline.getByText("はじめる", { exact: true })).toHaveCount(1);

    const current = timeline.locator("[data-status='current']");
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute("aria-current", "step");
    await expect(current.getByText("はじめる", { exact: true })).toBeVisible();
  });

  test("終えた回・いまの回・これからの回が、見分けられる", async ({ page }) => {
    await seedCompleted(page, ["diagnosis", "rewrite_text"]);
    await openPath(page);

    const timeline = page.getByTestId("course-outline");
    await expect(timeline.locator("[data-status='completed']")).toHaveCount(2);
    await expect(timeline.locator("[data-status='current']")).toHaveCount(1);
    expect(
      await timeline.locator("[data-status='available']").count(),
    ).toBeGreaterThan(0);

    // 状態を色だけで言わない。終えた回には文字も添える
    await expect(
      timeline.locator("[data-status='completed']").first(),
    ).toContainText("完了");
  });

  test("押した行のレッスンが開く", async ({ page }) => {
    // 押せる場所を1つに絞った結果、他の行から入れなくなっていないこと
    await seedCompleted(page, ["diagnosis"]);
    await openPath(page);

    await page.getByTestId("lesson-summarize_text").click();
    await dismissLessonIntro(page);
    await expect(page.getByTestId("lesson-header")).toBeVisible();
  });

  test("iPhone の幅で、横に見切れない", async ({ page }) => {
    await seedCompleted(page, ["diagnosis", "rewrite_text"]);
    await openPath(page);

    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    expect(overflows, "横に見切れている").toBe(false);
  });
});
