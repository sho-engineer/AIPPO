/**
 * 章扉の、出るときの動き。
 *
 * 見るのは「動いたか」ではなく、**動かしてよいものだけが動いたか**。
 *
 *   1. 絵の層に 0.3 秒の登場が1回だけ付く
 *   2. 帯・×・「つづける」は動かない
 *   3. 出た瞬間から押せる（進行を待たせない）
 *   4. 絵の読み込みで高さが変わらない
 *   5. 動きを止めている人には、動かない
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/** 章扉のあいだ、位置を測る相手。**どれも動いてはいけない。** */
const FIXED = ["lesson-header", "lesson-exit", "primary-action"] as const;

async function toDay1(page: Page) {
  await stubApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByTestId("continue-lesson").click();
  await expect(page.getByTestId("section-transition")).toBeVisible();
}

/** いま出ているものの位置を、まとめて測る。 */
async function boxes(page: Page) {
  return page.evaluate((ids) => {
    const out: Record<string, { x: number; y: number; w: number; h: number } | null> = {};
    for (const id of ids) {
      const node = document.querySelector(`[data-testid='${id}']`);
      if (!node) {
        out[id] = null;
        continue;
      }
      const box = node.getBoundingClientRect();
      out[id] = {
        x: Math.round(box.x),
        y: Math.round(box.y),
        w: Math.round(box.width),
        h: Math.round(box.height),
      };
    }
    return out;
  }, FIXED as unknown as string[]);
}

test.setTimeout(120_000);

test.describe("章扉が出るとき", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("動くのは絵の層だけ。0.3秒で1回", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "スマホの見え方だけ見る");
    await toDay1(page);

    const motion = await page.evaluate(() => {
      const node = document.querySelector("[data-testid='section-intro-content']");
      if (!node) return null;
      const style = getComputedStyle(node);
      return {
        name: style.animationName,
        duration: style.animationDuration,
        timing: style.animationTimingFunction,
        count: style.animationIterationCount,
        fill: style.animationFillMode,
      };
    });

    expect(motion, "絵の層が見つからない").not.toBeNull();
    expect(motion!.name).toContain("section-intro");
    expect(motion!.duration).toBe("0.3s");
    expect(motion!.timing).toBe("ease-out");
    expect(motion!.count, "繰り返している").toBe("1");
    expect(motion!.fill).toBe("both");
  });

  test("帯・×・「つづける」は、動きが終わっても同じ場所に居る", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "スマホの見え方だけ見る");
    await toDay1(page);

    /*
      アニメーションの**最中**と、終わったあと。どちらでも同じ場所に
      居ること。押せるものが動くと、出た瞬間に押した指が空振りする。
    */
    const during = await boxes(page);
    await page.waitForTimeout(500);
    const after = await boxes(page);

    for (const id of FIXED) {
      expect(during[id], `${id} が居ない`).not.toBeNull();
      expect(after[id], `${id} が動いた`).toEqual(during[id]);
    }
  });

  test("出た瞬間から「つづける」を押せる", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "スマホの見え方だけ見る");
    await toDay1(page);

    /*
      待たない。章扉が見えたらすぐ押す——アニメーションの途中でも
      次へ進めること。進行を待たせるための動きではない。
    */
    await page.getByTestId("primary-action").click({ timeout: 1000 });

    await expect(page.getByTestId("section-transition")).toHaveCount(0);
    await expect(page.locator("main h1").first()).toHaveText("まずはAIに頼んでみよう");
  });

  test("絵の読み込みで、画面の高さが変わらない", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "スマホの見え方だけ見る");

    /*
      絵は `flex-1` の箱に `absolute inset-0` で敷いてある。届く前も
      届いたあとも箱の高さは同じはず——そこを実測で押さえる。
    */
    await stubApi(page);
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    // 絵を遅らせて、届く前の高さを測れるようにする
    await page.route("**/assets/teaching/day1_section_*.webp", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });

    await page.getByTestId("continue-lesson").click();
    await expect(page.getByTestId("section-transition")).toBeVisible();

    const before = await page.evaluate(
      () => document.querySelector("[data-testid='section-transition']")!.getBoundingClientRect().height,
    );
    const ctaBefore = (await page.getByTestId("primary-action").boundingBox())!;

    await expect(page.locator("[data-testid='section-intro-content'] img")).toBeVisible();
    await page.waitForTimeout(500);

    const after = await page.evaluate(
      () => document.querySelector("[data-testid='section-transition']")!.getBoundingClientRect().height,
    );
    const ctaAfter = (await page.getByTestId("primary-action").boundingBox())!;

    expect(Math.round(after), "絵が届いて高さが変わった").toBe(Math.round(before));
    expect(Math.round(ctaAfter.y), "絵が届いてCTAが動いた").toBe(Math.round(ctaBefore.y));
  });

  test("動きを止めている人には、動かない", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "スマホの見え方だけ見る");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await toDay1(page);

    /*
      `src/index.css` の共通ルールが 0.01ms まで詰める。`both` と
      合わせて、終わった姿（薄くない・ずれ 0）へそのまま落ちる。

      `animation: none` にしていないのは、遅らせて出す要素が
      現れないまま消えるのを避けるため（同ファイルに註がある）。

      **終わるのを待ってから読む。**
      `both` は「始まる前」にも `from`（opacity 0）を当てるので、
      始まる前の1フレームを読むと 0 が返る。0.01ms なので目には
      見えないが、機械は掴める——実際、全件を回したときにここだけ
      1件落ちた（8回単独で回すと毎回通る、という出方をした）。
      秒数で待たず、アニメーションそのものの終わりを待つ。
    */
    const state = await page.evaluate(async () => {
      const node = document.querySelector("[data-testid='section-intro-content']")!;
      await Promise.all(
        node.getAnimations().map((one) => one.finished.catch(() => undefined)),
      );
      const style = getComputedStyle(node);
      return {
        duration: style.animationDuration,
        opacity: style.opacity,
        transform: style.transform,
      };
    });

    /*
      共通ルールは 0.01ms（＝ 0.00001 秒）。ブラウザは `1e-05s` と
      返すので、**文字ではなく数で見る**。
    */
    expect(Number.parseFloat(state.duration)).toBeLessThan(0.001);
    expect(Number(state.opacity)).toBe(1);
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(state.transform);
  });
  test("次の章扉の絵を、1枚だけ先に取っておく", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "スマホの見え方だけ見る");

    /*
      章扉は絵が画面そのもの。届くまでは何も無い画面なので、段の
      変わり目に**何も無い一拍**が入る。そこがいちばん静かに繋ぎたい
      場所なので、いちばん目立つ。

      ただし**まとめては取らない**。教材の絵を最初に全部取ると、
      レッスンが始まるのが遅くなる。いま居る場所のすぐ後ろにある
      1枚だけ（`usePreloadNextSection`）。
    */
    const seen: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("day1_section")) {
        seen.push(request.url().split("/").pop()!);
      }
    });

    await toDay1(page);
    await page.waitForTimeout(1200);

    expect(seen.some((name) => name.includes("01")), "いまの1枚").toBe(true);
    expect(seen.some((name) => name.includes("02")), "次の1枚を先に取っていない").toBe(true);
    expect(seen.some((name) => name.includes("04")), "4枚まとめて取っている").toBe(false);
  });

  test("戻ると、同じ章扉がそのまま出る", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "スマホの見え方だけ見る");
    await toDay1(page);

    const labelled = await page
      .getByTestId("section-transition")
      .getAttribute("aria-labelledby");

    await page.getByTestId("primary-action").click();
    await expect(page.locator("main h1").first()).toHaveText("まずはAIに頼んでみよう");

    await page.getByTestId("lesson-back").click();

    const cover = page.getByTestId("section-transition");
    await expect(cover).toBeVisible();
    await expect(cover).toHaveAttribute("aria-labelledby", labelled!);

    /*
      白画面を挟まない。戻った先の絵は**もう取ってある**ので、
      読み込み待ちが入らない。
    */
    await expect(
      page.locator("[data-testid='section-intro-content'] img"),
    ).toBeVisible({ timeout: 400 });

    // もう一度出る動きが走っても、押すのを妨げない短さであること
    await page.getByTestId("primary-action").click({ timeout: 800 });
    await expect(page.locator("main h1").first()).toHaveText("まずはAIに頼んでみよう");
  });
});
