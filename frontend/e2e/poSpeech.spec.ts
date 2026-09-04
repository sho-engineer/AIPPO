/**
 * ポーと吹き出しが、隣り合っていること。
 *
 * 何が起きていたか
 * ----------------
 * `PoHero` はポーを絶対配置で右上に、吹き出しを見出しブロックの下の
 * 通常フローに置いていた。構造の上でつながっていないので、390px で
 * 実測すると**いちばん近い角どうしで 138px**離れていた。
 * ポーは右上、吹き出しは左下——画面の対角にいる。
 *
 * その距離だと、吹き出しは「ポーが言っていること」ではなく
 * 「画面に置かれた別のUI」に見える。
 *
 * 枠ではなく、見えている体から測る
 * --------------------------------
 * 絵の台紙（512×512）には透明の余白が入っている。neutral の絵は
 * 台紙の幅の 59% しか使っていないので、**枠の縁から測ると 20% ずれる**。
 * `PO_BOX` の値を使って、見えている体の縁を出してから測る。
 *
 * なぜ E2E なのか
 * ---------------
 * 距離は本物の版面にしかない。jsdom の getBoundingClientRect は
 * すべて 0 を返すので、単体テストでは何も確かめられない。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";
import { dismissLessonIntro, passSkillStamp } from "./support/lessonIntro";

/** 台紙に対する neutral の幅（`PO_BOX.neutral.width`）。 */
const VISIBLE_WIDTH_RATIO = 0.59;

/** 見えている体から、吹き出しまでの目安（`po/PoSpeech.tsx` の GAP）。 */
const GAP = 12;

/**
 * 8〜16px に収める、という決まりのぶんだけ許す。
 *
 * 丸めと小数で 1px ほど動くので、上下に少し余裕を持たせる。
 */
const MIN = 6;
const MAX = 18;

async function start(page: Page) {
  await stubApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByTestId("continue-lesson").click();
  await dismissLessonIntro(page);
  await expect(page.getByTestId("lesson-header")).toBeVisible();
}

/** 吹き出しの右端から、見えているポーの左端までの距離（px）。 */
async function gapToBody(page: Page): Promise<number> {
  const bubble = await page.getByTestId("po-hero-message").first().boundingBox();
  const frame = await page.locator("[data-po-frame]").first().boundingBox();
  if (!bubble || !frame) throw new Error("ポーか吹き出しが見つからない");

  /*
    枠の中で、絵が実際に写っている左端。

    ポーは ±1.2° 傾きながら浮いているので、boundingBox は少しだけ
    大きく出る。距離の目安（8〜16px）に対しては 1px 未満の差なので、
    ここではそのまま使う。
  */
  const inset = (frame.width * (1 - VISIBLE_WIDTH_RATIO)) / 2;
  const bodyLeft = frame.x + inset;
  return bodyLeft - (bubble.x + bubble.width);
}

test.describe("ポーと吹き出し", () => {
  test("見えている体のすぐ隣にいる", async ({ page }) => {
    await start(page);

    const gap = await gapToBody(page);
    expect(gap, `見える体から ${gap.toFixed(0)}px 離れている（目安 ${GAP}px）`)
      .toBeGreaterThanOrEqual(MIN);
    expect(gap, `見える体から ${gap.toFixed(0)}px 離れている（目安 ${GAP}px）`)
      .toBeLessThanOrEqual(MAX);
  });

  test("縦にもずれていない（同じ行にいる）", async ({ page }) => {
    /*
      前はポーが上、吹き出しが下で 15px ずれていた。横だけ詰めても
      斜めに離れていては「隣で話している」に見えない。
      下端をそろえているので、底が近いことを見る。
    */
    await start(page);

    const bubble = await page.getByTestId("po-hero-message").first().boundingBox();
    const frame = await page.locator("[data-po-frame]").first().boundingBox();
    expect(bubble).not.toBeNull();
    expect(frame).not.toBeNull();

    const bubbleBottom = bubble!.y + bubble!.height;
    const frameBottom = frame!.y + frame!.height;
    expect(
      Math.abs(bubbleBottom - frameBottom),
      "吹き出しとポーの下端が離れている",
    ).toBeLessThanOrEqual(24);
  });

  test("しっぽがポーのほうを向いている", async ({ page }) => {
    await start(page);

    const tail = await page.getByTestId("po-tail").first().boundingBox();
    const bubble = await page.getByTestId("po-hero-message").first().boundingBox();
    expect(tail, "しっぽが無い").not.toBeNull();
    expect(bubble).not.toBeNull();

    // 吹き出しの右の縁に付いている（ポーは右にいる）
    const bubbleRight = bubble!.x + bubble!.width;
    expect(Math.abs(tail!.x + tail!.width / 2 - bubbleRight)).toBeLessThanOrEqual(8);
  });

  test("進んでも離れない", async ({ page }) => {
    /*
      1画面だけ詰めても意味が無い。ポーが出るどの画面でも隣にいること。
    */
    await start(page);
    const seen: number[] = [];

    for (let step = 0; step < 10; step += 1) {
      /*
        技を受け取る回で「覚えた」を押すと、スタンプ台紙が1枚挟まる。
        閉じずに下のボタンを押そうとすると、背景（閉じるための面）が
        受け取ってしまう。
      */
      if (await passSkillStamp(page)) continue;

      if (await page.getByTestId("po-hero-message").first().count()) {
        seen.push(await gapToBody(page));
      }

      const primary = page.getByTestId("primary-action").first();
      if (!(await primary.count())) break;
      if (await primary.isDisabled().catch(() => true)) {
        const choice = page.locator("[aria-pressed]").first();
        if (await choice.count()) {
          await choice.click();
          await page.waitForTimeout(150);
          continue;
        }
        const area = page.locator("textarea").first();
        if (await area.count()) {
          await area.fill("会議の日程を確認したいです。");
          await page.waitForTimeout(150);
          continue;
        }
        break;
      }
      await primary.click();
      await page.waitForTimeout(400);
    }

    expect(seen.length, "ポーが話す画面を1つも通らなかった").toBeGreaterThan(1);
    for (const gap of seen) {
      expect(gap, `${gap.toFixed(0)}px 離れている画面がある`).toBeGreaterThanOrEqual(MIN);
      expect(gap, `${gap.toFixed(0)}px 離れている画面がある`).toBeLessThanOrEqual(MAX);
    }
  });
});
