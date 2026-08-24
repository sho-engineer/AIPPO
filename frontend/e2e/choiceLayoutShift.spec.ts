/**
 * 選択肢を選んでも、文字の位置がずれないこと。
 *
 * 何が起きていたか
 * ----------------
 * チェックの印を選択時にしか描画していなかった。選ぶと隣のテキスト列の
 * 実効幅が縮み、「自分がやることを知る」のような2〜3行になる札で
 * 折り返し位置が動いていた。
 *
 * なぜ E2E なのか
 * ---------------
 * 折り返しの位置は実際のフォント幅で決まるので、版面を持たない
 * jsdom では測れない。実機で、選ぶ前後の文字の位置そのものを見る。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

async function openDiagnosisQuestion(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-diagnosis").first().click();
  await page.getByTestId("primary-action").click();
}

test.describe("選択肢のレイアウト", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("選ぶ前後で、文字の位置と折り返しが変わらない", async ({ page }) => {
    await openDiagnosisQuestion(page);

    const choice = page.locator("[aria-pressed]").first();
    await expect(choice).toBeVisible();

    /*
      測る前に、入ってくる動きが終わるのを待つ。

      設問は横から差し込まれる（course/motion.ts の slide-in。
      translateX 16px → 0）。動いている最中に測ると、**選ぶ前だけが
      16px までずれた値**になり、選んだあと（動き終わり）と比べて
      「ずれた」と誤って読める。実際にそうなった——選ぶ前が
      87〜91 とばらつき、選んだあとは必ず 83 だった。

      待つのは Web Animations の終わりそのもの。時間で待つと、
      遅い環境で足りなくなる。
    */
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          /*
            終わらない動きは待たない。ポーは呼吸するようにずっと浮いて
            いる（float / twinkle。iterations は Infinity）ので、
            全部を待つとここで永久に止まる。
          */
          .filter((animation) => {
            const timing = animation.effect?.getTiming();
            return timing?.iterations !== Infinity;
          })
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );

    // 文字の列（アイコンとチェックのあいだの span）の位置を先に測る
    const label = choice.locator("span.min-w-0.flex-1");
    const before = await label.boundingBox();
    expect(before, "選択肢の文字が見つからない").not.toBeNull();

    await choice.click();
    // 選択の見た目（枠・地の色）が変わりきるのを待つ
    await expect(choice).toHaveAttribute("aria-pressed", "true");

    const after = await label.boundingBox();
    expect(after, "選択後に文字が見つからない").not.toBeNull();

    /*
      許すのは 2px まで。選ぶと文字が太字（font-bold）にもなるので、
      フォントのヒンティングでサブピクセル単位のずれは起きる
      ——直したいのはそこではない。以前の不具合は、チェックの印が
      無いところに急に現れて文字の幅が 20px 以上縮む、という
      折り返し位置そのものが変わる規模のもの。
    */
    const TOLERANCE_PX = 2;
    expect(
      Math.abs(after!.x - before!.x),
      `選ぶと文字の開始位置が動いた: ${before!.x} → ${after!.x}`,
    ).toBeLessThan(TOLERANCE_PX);
    expect(
      Math.abs(after!.width - before!.width),
      `選ぶと文字の幅が変わった: ${before!.width} → ${after!.width}`,
    ).toBeLessThan(TOLERANCE_PX);
    expect(
      after!.height,
      `選ぶと行数（高さ）が変わった: ${before!.height} → ${after!.height}`,
    ).toBe(before!.height);
  });
});
