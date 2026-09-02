/**
 * 動きが、実際に動いていること。
 *
 * なぜ E2E でしか見られないのか
 * -----------------------------
 * jsdom（vitest）は CSS を動かさない。transition も animation も走らない。
 * だから単体テストで書けるのは「その属性が付いたか」までで、
 * **画面が動いたか**は見られない。
 *
 * それで実際に取り逃した。ステップの入れ替えは `data-direction` を
 * 正しく付け替えていて、検査は通っていた。だが1コマも動いていなかった
 * （`useEffect` がブラウザの描画の**あと**に走るため。詳しくは
 * StepTransition の説明）。**通る検査があるのに、目には何も映らない**
 * という、いちばん見つけにくい形だった。
 *
 * コマを数えないことにした理由
 * ----------------------------
 * 最初は毎コマ透明度を記録して「途中の姿があるか」を見ていた。
 * それだと**壊れた版でも通った**。壊れ方が時間まかせで、機械が遅いと
 * 隠れた状態がたまたま1コマ描かれてしまう。手元では3回中3回動かず、
 * 検査の中では動く、という状態だった。通ったり落ちたりする検査は、
 * 無い検査より悪い。
 *
 * そこで、時間に左右されないものを見る。**中身が入れ替わったその瞬間に、
 * 箱が隠れた状態になっているか**。これが `useLayoutEffect` の保証そのもの
 * で、`useEffect` では成り立たない（描画のあとに走るので、入れ替わった
 * 瞬間の箱はまだ完成形のまま）。
 *
 * MutationObserver の呼び出しは、DOM が変わった直後・描画の前に走る。
 * layout effect はそれより前、effect はそれより後。だから、ここで
 * 読める透明度が両者を分ける。ただし読むのは**指定値**にする——
 * 計算値は transition の最中だと補間された途中の数を返すので、
 * 「これから0へ向かう」と「1のまま」が見分けられない。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";
import { dismissLessonIntro } from "./support/lessonIntro";

/**
 * 中身が入れ替わった瞬間の透明度を、1回だけ記録する。
 *
 * 描画の前に読むので、機械の速さに左右されない。
 */
async function watchHandoff(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __atSwap: number | null };
    w.__atSwap = null;

    const box = document.querySelector("[data-testid='step-transition']");
    if (!box) throw new Error("入れ替え箱が無い");

    const observer = new MutationObserver(() => {
      if (w.__atSwap === null) {
        /*
          読むのは**指定値**（inline style）で、計算値ではない。
          計算値は transition の最中だと補間された途中の数を返すので、
          「これから0へ向かう」と「1のまま」が見分けられない。
          React が書いた値なら、隠したのかどうかがそのまま出る。
        */
        w.__atSwap = Number((box as HTMLElement).style.opacity);
        observer.disconnect();
      }
    });
    observer.observe(box, { childList: true, subtree: true, attributes: true });
  });
}

async function opacityAtSwap(page: Page): Promise<number | null> {
  return page.evaluate(
    () => (window as unknown as { __atSwap: number | null }).__atSwap,
  );
}

/** 毎コマ透明度を記録する（動きを減らす設定の確認だけに使う）。 */
async function watchFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[] };
    w.__frames = [];
    const tick = () => {
      const el = document.querySelector("[data-testid='step-transition']");
      if (el) w.__frames.push(Number(getComputedStyle(el).opacity));
      if (w.__frames.length < 40) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function frames(page: Page): Promise<number[]> {
  return page.evaluate(
    () => (window as unknown as { __frames: number[] }).__frames,
  );
}

async function openLesson(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).first().click();
  // コースは3段（一覧 → 中身 → レッスン）。レッスンが並ぶのは2段目
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-rewrite_text").first().click();
  await dismissLessonIntro(page);
  await expect(page.getByTestId("step-transition")).toBeVisible();
}

test.describe("ステップの入れ替え", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("入れ替わった瞬間、箱は隠れている（動く先がある）", async ({ page }) => {
    /*
      隠れた状態から始まらなければ、transition には動く先が無い。
      完成形のまま置き換わって、何も起きずに終わる。
    */
    await openLesson(page);
    await watchHandoff(page);

    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(400);

    const atSwap = await opacityAtSwap(page);

    expect(atSwap, "入れ替わりを1度も観測できていない").not.toBeNull();
    expect(
      atSwap!,
      `入れ替わった時点で完成形（透明度${atSwap}）。動く先が無い`,
    ).toBeLessThan(0.5);
  });

  test("動きを減らす設定では、途中を作らない", async ({ page }) => {
    /*
      止めている人に、消えかけの文字を見せない。
      index.css が秒数をほぼ0にするので、途中の姿は現れない。
    */
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openLesson(page);
    await watchFrames(page);

    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(600);

    const midway = (await frames(page)).filter((v) => v > 0.05 && v < 0.95);

    expect(midway.length).toBe(0);
  });

  test("戻ると、向きが変わる", async ({ page }) => {
    // 向きが固定だと、戻ったのに進んだように見えて迷子になる
    await openLesson(page);
    await page.getByTestId("primary-action").click();
    await expect(page.getByTestId("step-transition")).toHaveAttribute(
      "data-direction",
      "forward",
    );

    await page.getByRole("button", { name: "前のステップへ戻る" }).click();

    await expect(page.getByTestId("step-transition")).toHaveAttribute(
      "data-direction",
      "back",
    );
  });
});
