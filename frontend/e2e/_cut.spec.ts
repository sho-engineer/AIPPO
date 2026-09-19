/**
 * 切り詰められている文字と、枠に切られている中身を洗い出す。
 *
 * 「…」で終わっている札は、押す先も持ち帰るものも読めない。
 */

import { test, type Page } from "@playwright/test";

import { openLessonById } from "./support/openLesson";
import { stubApi } from "./support/stubApi";

const SIZES: [string, number, number][] = [
  ["393×659", 393, 659],
  ["393×727", 393, 727],
  ["390×664", 390, 664],
];

async function forward(page: Page, own = true) {
  const primary = page.getByTestId("primary-action").first();
  if ((await primary.getAttribute("aria-disabled")) === "true") {
    const box = page.locator("textarea:visible").first();
    if (await box.count()) {
      if (own) await box.fill("てす");
      else await page.getByRole("button", { name: "今回はスキップする" }).click();
    } else await page.locator("main [aria-pressed]").first().click();
    await page.waitForTimeout(150);
  }
  await primary.click({ force: true });
  await page.waitForTimeout(400);
}

/** 切り詰め（…）と、枠に切られた中身。 */
async function cuts(page: Page) {
  return page.evaluate(() => {
    const trimmed: string[] = [];
    const clipped: string[] = [];
    for (const node of document.querySelectorAll("main *")) {
      const el = node as HTMLElement;
      if (!el.checkVisibility()) continue;
      const style = getComputedStyle(el);
      const text = (el.textContent ?? "").trim();
      if (!text) continue;

      /* 1行で切り詰められている（truncate / text-overflow） */
      if (
        style.textOverflow === "ellipsis" &&
        el.scrollWidth > el.clientWidth + 1 &&
        el.children.length === 0
      ) {
        trimmed.push(`${text.slice(0, 16)}（幅${el.clientWidth}／中身${el.scrollWidth}）`);
      }

      /* 送れない枠に、縦で切られている */
      if (
        style.overflowY === "hidden" &&
        el.scrollHeight > el.clientHeight + 2 &&
        el.clientHeight > 0
      ) {
        clipped.push(
          `${text.slice(0, 16)}（高${el.clientHeight}／中身${el.scrollHeight}）`,
        );
      }
    }
    return {
      trimmed: [...new Set(trimmed)].slice(0, 4),
      clipped: [...new Set(clipped)].slice(0, 4),
    };
  });
}

for (const [name, width, height] of SIZES) {
  test(`飛ばしたときの完了画面（${name}）`, async ({ page }) => {
    /*
      自分の文章を飛ばすと、成果物の名札が「書き直した文章（練習）」に
      なる。実機ではここが「書き直した文章（練...」と切れていた。
    */
    await page.setViewportSize({ width, height });
    await stubApi(page);
    await openLessonById(page, "rewrite_text");

    for (let at = 0; at < 30; at += 1) {
      if (((await page.getByTestId("completion-view").count()) ||
      (await page.getByTestId("diagnosis-analyzing").count()))) break;
      const skip = page.getByRole("button", { name: "今回はスキップする" });
      if (await skip.count()) {
        await skip.click();
        await page.waitForTimeout(400);
        continue;
      }
      await forward(page);
    }
    const seen = await cuts(page);
    const label = await page
      .getByTestId("completion-view")
      .innerText()
      .catch(() => "");
    console.error(
      `${name}: 切り詰め=${seen.trimmed.join("/") || "なし"}` +
        ` / 「練習」の札=${label.includes("（練習）") ? "あり" : "なし"}`,
    );
  });

  test(`切り詰めと切れ（${name}）`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await stubApi(page);
    await openLessonById(page, "rewrite_text");

    const rows: string[] = [];
    for (let at = 0; at < 30; at += 1) {
      const title = (await page.locator("h1").first().innerText().catch(() => ""))
        .replace(/\s+/g, "")
        .slice(0, 14);
      const seen = await cuts(page);
      const bad: string[] = [];
      if (seen.trimmed.length) bad.push(`切り詰め=${seen.trimmed.join("/")}`);
      if (seen.clipped.length) bad.push(`切れ=${seen.clipped.join("/")}`);
      if (bad.length) rows.push(`${String(at).padStart(2, "0")}「${title}」 ${bad.join(" | ")}`);
      if (((await page.getByTestId("completion-view").count()) ||
      (await page.getByTestId("diagnosis-analyzing").count()))) break;
      await forward(page);
    }
    console.error(`\n===== ${name} =====`);
    console.error(rows.length ? rows.join("\n") : "（指摘なし）");
  });
}
