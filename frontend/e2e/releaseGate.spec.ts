/**
 * 第1リリースの公開範囲。**Day1 だけが開いている。**
 *
 * 公開を決めるのは1か所（`src/course/catalog.ts` の
 * RELEASE_COMING_SOON と、サーバー側の同名の集合）。ここで見るのは
 * 「その1か所が、画面の全部の入口に効いているか」。
 *
 * 入口はいくつもある——教材の行・ホームの今日の1本・診断の結果・
 * 完了画面の次・URL の直打ち。**押せるボタンが1つ残るだけで、
 * 始められないはずの教材が始まる。**
 */

import { expect, test, type Page } from "@playwright/test";

import { dismissLessonIntro } from "./support/lessonIntro";
import { stubApi } from "./support/stubApi";

/** 第1リリースで開いている教材。 */
const OPEN = "rewrite_text";
/** 準備中の代表。Day2。 */
const GATED = "summarize_text";

async function toHome(page: Page) {
  await stubApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
}

async function toCourse(page: Page) {
  await toHome(page);
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
}

test.setTimeout(120_000);

test.describe("公開していない教材", () => {
  test("一覧には出るが、押しても教材は始まらない", async ({ page }) => {
    await toCourse(page);

    const soon = page.getByTestId(`lesson-${GATED}`);
    await expect(soon).toBeVisible();
    await expect(soon).toHaveAttribute("data-availability", "coming_soon");

    /*
      `force` を付ける。

      この行は `aria-disabled="true"` を持っている——読み上げには
      「いまは押せない」と伝えたいが、押下そのものは届かせたい
      （押すと一言返る）。Playwright は `aria-disabled` を見て
      「操作できない要素」と判断して待ち続けるので、そこだけ外す。
      実機では素のタップがそのまま届く。
    */
    await soon.click({ force: true });

    // 一言だけ返って、画面は変わらない
    await expect(page.getByTestId("toast")).toHaveText(
      "このLessonは現在準備中です。公開まで少しお待ちください。",
    );
    await expect(page.getByTestId("lesson-header")).toHaveCount(0);
    await expect(page.getByTestId("course-outline")).toBeVisible();
  });

  test("読めないほど薄くしない", async ({ page }) => {
    /*
      区別は付けるが、**利用不能な画面には見せない**。
      前は `opacity-55` で、文字が読めないまま8行並んでいた。
    */
    await toCourse(page);

    const opacity = await page
      .getByTestId(`lesson-${GATED}`)
      .evaluate((node) => Number(getComputedStyle(node).opacity));

    expect(opacity).toBeGreaterThanOrEqual(0.9);
  });

  test("開いている教材は、これまでどおり始まる", async ({ page }) => {
    await toCourse(page);
    await page.getByTestId(`lesson-${OPEN}`).click();
    await dismissLessonIntro(page);

    await expect(page.getByTestId("lesson-header")).toBeVisible();
    await expect(page.locator("main h1").first()).toHaveText(
      "まずはAIに頼んでみよう",
    );
  });
});

test.describe("URL を直に叩く", () => {
  test("準備中の教材は、開かずにホームへ返す", async ({ page }) => {
    /*
      覚えていた場所からの復元でも入れてしまうので、画面側でも
      止める（`App.tsx` の `openLesson`／描画側の両方）。
      最後の砦はサーバー（`apps/catalog/access.py`）。
    */
    await stubApi(page);
    await page.goto("/");
    await page.evaluate(
      (id) =>
        window.localStorage.setItem(
          "aippo:screen",
          JSON.stringify({ aippo: true, screen: "LESSON", lessonId: id }),
        ),
      GATED,
    );
    await page.goto("/");

    await expect(page.getByTestId("lesson-header")).toHaveCount(0);
    // ホームに居ること。学習の記録は消えていない
    await expect(page.getByTestId("toast")).toHaveCount(0);
  });
});

test.describe("診断の結果", () => {
  test("おすすめは、いま始められる1本だけ", async ({ page }) => {
    await toCourse(page);
    await page.getByTestId("lesson-diagnosis").first().click();
    await dismissLessonIntro(page);
    await page.getByTestId("primary-action").click();

    for (let guard = 0; guard < 8; guard += 1) {
      if (await page.getByTestId("completion-view").count()) break;
      const parts = page.getByTestId("assemble-part");
      const count = await parts.count();
      if (count > 0) {
        for (let index = 0; index < count; index += 1) {
          const part = parts.nth(index);
          if (await part.locator("[aria-pressed='true']").count()) continue;
          await part.getByTestId("assemble-choice").first().click();
        }
        await page.getByTestId("primary-action").click();
        await page.waitForTimeout(400);
        continue;
      }
      const cards = page.locator("[aria-pressed]");
      if (await cards.count()) await cards.first().click();
      await page.waitForTimeout(400);
      const primary = page.getByTestId("primary-action");
      if ((await primary.getAttribute("aria-disabled")) !== "true") {
        await primary.click();
        await page.waitForTimeout(400);
      }
    }

    /*
      結果の画面を順に押して、おすすめまで。**何画面あるかは書かない**
      ——1つ足した日に、ここだけ古い数で止まる。
    */
    for (let guard = 0; guard < 6; guard += 1) {
      if (
        (await page.locator("main h1").first().innerText()).includes("おすすめ")
      ) {
        break;
      }
      await page.getByTestId("primary-action").click();
      await page.waitForTimeout(400);
    }
    await expect(page.locator("main h1").first()).toHaveText("今のあなたにおすすめ");

    /*
      押せる1本は、必ず開いているもの。**準備中へは渡さない。**
    */
    await expect(page.getByTestId("primary-action")).toHaveText(/Day 1をはじめる/);
    // 逃げ道の一覧も、開いているものが無ければ入口ごと出さない
    await expect(page.getByTestId("diagnosis-also-open")).toHaveCount(0);
  });
});
