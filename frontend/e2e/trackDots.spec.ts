/**
 * 道の丸が、線の上にきれいに乗っていること。
 *
 * 何が起きていたか
 * ----------------
 * 丸は道の上へ重ねて置いてある（上へ引き上げている）。引き上げる量を
 * **全部同じ数**にしていたが、丸の直径は状態で違う——いまいるところは
 * 大きく、それ以外は小さい。同じだけ引くと中心がそろわない。
 *
 *     小さいほう … いまここが 3px 低い
 *     大きいほう … いまここ以外が 4px 高い
 *
 * ずれは数 px だが、5つ並んだ道では**1つだけ浮いて見える**。
 *
 * どう見るか
 * ----------
 * 丸の縦の中心と、線の縦の中心の差を測る。ここで「見た目」を人の目に
 * 任せない——数 px のずれは、絵を見比べても気づけないことがある
 * （実際、実機の写しで指摘されるまで気づかなかった）。
 *
 * 許容は 1px。丸め（`border-2` と奇数の直径）でそこまでは動く。
 *
 * 2つの大きさを両方見る
 * ---------------------
 * 結果の画面は小さいほう、押して開いた一枚は大きいほう。**壊れていたのは
 * それぞれ別の状態**だったので、片方だけ見ても片方が残る。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";
import { dismissLessonIntro } from "./support/lessonIntro";

/** 丸めのぶれ。 */
const SLACK = 1;

test.setTimeout(180_000);

/** 診断を最後まで答えて、結果の画面を出す。 */
async function toResult(page: Page) {
  await stubApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-diagnosis").first().click();
  await dismissLessonIntro(page);

  for (let step = 0; step < 12; step += 1) {
    if (await page.getByTestId("completion-view").count()) return;
    /*
      枠を埋める回は、枠ごとに1つ。もう選んである枠は触らない
      ——押すと取り消しになる。
    */
    const parts = page.getByTestId("assemble-part");
    const count = await parts.count();
    if (count > 0) {
      for (let at = 0; at < count; at += 1) {
        const part = parts.nth(at);
        if (await part.locator("[aria-pressed='true']").count()) continue;
        await part.getByTestId("assemble-choice").first().click();
      }
    } else {
      const card = page.locator("[aria-pressed]").first();
      if (await card.count()) await card.click();
    }
    await page.waitForTimeout(400);

    const primary = page.getByTestId("primary-action").first();
    if (!(await primary.count())) break;
    if ((await primary.getAttribute("aria-disabled")) === "true") break;
    await primary.click();
    await page.waitForTimeout(600);
  }
  await expect(page.getByTestId("completion-view")).toBeVisible();
}

/** 丸ごとの、線の中心からのずれ（px）。 */
async function drift(page: Page): Promise<{ state: string; off: number }[]> {
  return page.evaluate(() => {
    const track = document.querySelector("[data-testid='growth-track']");
    if (!track) return [];
    /*
      線は、丸を並べた `ul` の**すぐ前**にある帯。太さが変わっても
      測り方が変わらないよう、要素から直に取る。
    */
    const line = track.querySelector<HTMLElement>(".rounded-full.bg-brand-line");
    if (!line) return [];
    const mid = line.getBoundingClientRect();
    const center = mid.top + mid.height / 2;

    return [...track.querySelectorAll<HTMLElement>("[data-testid='growth-node']")].map(
      (node) => {
        const dot = node.firstElementChild as HTMLElement;
        const box = dot.getBoundingClientRect();
        return {
          state: node.dataset.state ?? "?",
          off: Math.round((box.top + box.height / 2 - center) * 10) / 10,
        };
      },
    );
  });
}

function report(rows: { state: string; off: number }[]): string {
  return rows.map((one) => `${one.state}: ${one.off}px`).join(" / ");
}

test.describe("道の丸", () => {
  test("結果の画面で、どの丸も線の中心に乗る", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "スマホの見え方だけ見る");
    await toResult(page);

    const rows = await drift(page);
    expect(rows.length, "道の丸が見つからない").toBe(5);
    for (const one of rows) {
      expect(
        Math.abs(one.off),
        `小さいほうで、丸が線の中心から外れている（${report(rows)}）`,
      ).toBeLessThanOrEqual(SLACK);
    }
  });

  test("開いた一枚でも、どの丸も線の中心に乗る", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "スマホの見え方だけ見る");
    await toResult(page);
    await page.getByTestId("diagnosis-reason-open").click();
    await expect(page.getByTestId("diagnosis-reason-sheet")).toBeVisible();
    await page.waitForTimeout(500);

    /*
      一枚の中の道を見る。背面にも同じ部品があるので、**後ろの1つ**を
      取る——`querySelector` は前から拾うので、そのままだと背面を測る。
    */
    const rows = await page.evaluate(() => {
      const tracks = [...document.querySelectorAll("[data-testid='growth-track']")];
      const track = tracks[tracks.length - 1];
      const line = track?.querySelector<HTMLElement>(".rounded-full.bg-brand-line");
      if (!track || !line) return [];
      const mid = line.getBoundingClientRect();
      const center = mid.top + mid.height / 2;
      return [...track.querySelectorAll<HTMLElement>("[data-testid='growth-node']")].map(
        (node) => {
          const dot = node.firstElementChild as HTMLElement;
          const box = dot.getBoundingClientRect();
          return {
            state: node.dataset.state ?? "?",
            off: Math.round((box.top + box.height / 2 - center) * 10) / 10,
          };
        },
      );
    });

    expect(rows.length, "一枚の中に道が無い").toBe(5);
    for (const one of rows) {
      expect(
        Math.abs(one.off),
        `大きいほうで、丸が線の中心から外れている（${report(rows)}）`,
      ).toBeLessThanOrEqual(SLACK);
    }
  });
});
