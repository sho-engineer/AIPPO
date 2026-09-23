/**
 * 公開範囲を止める仕組み。
 *
 * 公開を決めるのは1か所（`src/course/catalog.ts` の
 * RELEASE_COMING_SOON と、サーバー側の同名の集合）。ここで見るのは
 * 「その1か所が、画面の全部の入口に効いているか」。
 *
 * **いまの公開範囲を書かない。** 書くと、公開したときに落ちる検査に
 * なる——止める仕組みが壊れても気づけないまま、教材を1本開いた日だけ
 * 赤くなる。閉じた1本はこちらで作る（下の `WITH_A_GATED_LESSON`）。
 *
 * 入口はいくつもある——教材の行・ホームの今日の1本・診断の結果・
 * 完了画面の次・URL の直打ち。**押せるボタンが1つ残るだけで、
 * 始められないはずの教材が始まる。**
 */

import { expect, test, type Page } from "@playwright/test";

import { dismissLessonIntro } from "./support/lessonIntro";
import { stubApi } from "./support/stubApi";

/** 開いている教材。同梱データの本文がそのまま出る。 */
const OPEN = "rewrite_text";

/**
 * 準備中の代表。**こちらで閉じる。**
 *
 * 長く `summarize_text`（Day2）と書き、それが公開範囲の外に
 * あることにもたれていた。Day2・Day3・Day4 を開いた日、この検査は
 * **開いている教材を「始まらないはず」として試す**ことになって
 * 落ちた。薄さとURL直打ちの2本は、落ちずに**素通り**していた
 * ——止める仕組みを何も試さないまま緑だった。
 *
 * 公開範囲は動く。動くものに寄せると、仕組みが壊れたときではなく
 * **公開したときに**落ちる。だから閉じた1本はここで作る。
 */
const GATED = "gated_lesson";

/** 開いた1本と、閉じた1本。コースの3段を降りられる最小の形。 */
const WITH_A_GATED_LESSON = {
  courses: [
    {
      id: "first_step_7days",
      title: "7日でAIの最初の一歩",
      description: "公開範囲を確かめるためのコース",
      lessons: [
        {
          id: OPEN,
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
          id: GATED,
          number: 2,
          title: "準備中の教材",
          goal: "まだ開いていない",
          outcomes: [],
          tags: [],
          usesAi: true,
          availability: "coming_soon",
          steps: [],
        },
      ],
    },
  ],
};

async function toHome(page: Page, catalog?: unknown) {
  await stubApi(page, catalog === undefined ? {} : { catalog });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}

async function toCourse(page: Page, catalog?: unknown) {
  await toHome(page, catalog);
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
}

test.setTimeout(120_000);

test.describe("公開していない教材", () => {
  test("一覧には出るが、押しても教材は始まらない", async ({ page }) => {
    await toCourse(page, WITH_A_GATED_LESSON);

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
    await toCourse(page, WITH_A_GATED_LESSON);

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
    await stubApi(page, { catalog: WITH_A_GATED_LESSON });
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
      if (((await page.getByTestId("completion-view").count()) ||
      (await page.getByTestId("diagnosis-analyzing").count()))) break;
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

    /*
      逃げ道の一覧も、**押した先が本当に開くこと**まで見る。

      長く「入口ごと出ていない」（`toHaveCount(0)`）を見ていた。
      当時は開いているのが Day1 だけで、逃げ道が1本も無かったから
      成り立っていただけ——**混ざらないことは何も試していない。**
      Day2・Day3・Day4 を開いた日に落ちた。

      いまは開けて、先頭を押して、そのまま始まることを見る。
      準備中が混ざっていれば、ここで一言（toast）が返って止まる。
    */
    await page.getByTestId("diagnosis-also-open").click();
    await page.getByTestId("diagnosis-also-pick").first().click();
    await dismissLessonIntro(page);

    await expect(page.getByTestId("lesson-header")).toBeVisible();
    await expect(page.getByTestId("toast")).toHaveCount(0);
  });
});
