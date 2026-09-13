/**
 * 棚卸しが出した指摘の、出どころを1件ずつ押さえる。
 *
 * 測り方を疑う前に、測っているものを見る。
 */

import { test, type Page } from "@playwright/test";

import { openLessonById } from "./support/openLesson";
import { stubApi } from "./support/stubApi";

/** 横へはみ出している要素を、外側から順に挙げる。 */
async function widest(page: Page) {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      const over = Math.round(Math.max(box.right - limit, -box.left));
      if (over > 0) {
        out.push(
          `${el.tagName}.${String(el.className).slice(0, 40)}` +
            ` 幅${Math.round(box.width)} 左${Math.round(box.left)} 超${over}` +
            ` 「${(el.textContent ?? "").trim().slice(0, 12)}」`,
        );
      }
    }
    return { limit, out: out.slice(0, 14) };
  });
}

test("ホームの横はみ出し", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await stubApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  const start = page.getByRole("button", { name: "はじめる" }).first();
  if (await start.count()) await start.click();
  await page.getByTestId("tab-bar").waitFor();
  console.error("===== ホーム 320 =====");
  console.error(JSON.stringify(await widest(page), null, 1));
  const chain = await page.evaluate(() => {
    const first = document.querySelector("[data-testid='skill-summary']");
    const rows: string[] = [];
    for (const el of first ? [first, ...first.querySelectorAll("*")] : []) {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      rows.push(
        `└ ${el.tagName}.${String(el.className).slice(0, 30)}` +
          ` 幅${Math.round(box.width)} 中身${Math.round((el as HTMLElement).scrollWidth)}` +
          ` 最小${style.minWidth} flex=${style.flex} 表示=${style.display}`,
      );
    }
    const el = document.querySelector("[data-testid='week-summary']");
    for (let at: Element | null = el; at; at = at.parentElement) {
      const box = at.getBoundingClientRect();
      const style = getComputedStyle(at);
      rows.push(
        `${at.tagName}.${String(at.className).slice(0, 34)}` +
          ` 左${Math.round(box.left)} 幅${Math.round(box.width)}` +
          ` 中身${Math.round((at as HTMLElement).scrollWidth)}` +
          ` 最小${style.minWidth} 余白${style.paddingLeft}/${style.paddingRight}`,
      );
    }
    return rows;
  });
  console.error(chain.join("\n"));
});

test("Day2「AIへの指示」の重なり", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await stubApi(page, { result: () => "・要点1\n・要点2\n・要点3" });
  await openLessonById(page, "summarize_text");

  for (let i = 0; i < 24; i += 1) {
    const title = await page.locator("h1").first().innerText().catch(() => "");
    if (title.replace(/\s+/g, "").startsWith("AIへの指示")) break;
    const primary = page.getByTestId("primary-action").first();
    if ((await primary.getAttribute("aria-disabled")) === "true") {
      const box = page.locator("textarea:visible").first();
      if (await box.count()) await box.fill("テスト用の長めの文章です。".repeat(4));
      else await page.locator("main [aria-pressed]").first().click();
      await page.waitForTimeout(150);
    }
    await primary.click({ force: true });
    await page.waitForTimeout(400);
  }

  const report = await page.evaluate(() => {
    const pick = (text: string) =>
      [...document.querySelectorAll("main *")].find(
        (el) => el.children.length === 0 && (el.textContent ?? "").trim().startsWith(text),
      );
    const shape = (el: Element | undefined) => {
      if (!el) return null;
      const box = el.getBoundingClientRect();
      const parent = el.parentElement;
      return {
        text: (el.textContent ?? "").trim().slice(0, 16),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        left: Math.round(box.left),
        right: Math.round(box.right),
        parent: parent ? `${parent.tagName}.${String(parent.className).slice(0, 50)}` : null,
      };
    };
    return {
      a: shape(pick("出力の形")),
      b: shape(pick("くわしく見る")),
      title: document.querySelector("h1")?.textContent,
    };
  });
  console.error("===== Day2 AIへの指示 320 =====");
  console.error(JSON.stringify(report, null, 1));
});
