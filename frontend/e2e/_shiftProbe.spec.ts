/**
 * 選んだ瞬間に、画面のどこが動くか。
 *
 * 「質問3・4・5で本文・選択肢・CTAが動く」と報告があった。**絵から
 * 原因を決めない。** 押す前と押したあとで、同じ要素の位置と外寸を
 * 実際に測って、動いたものだけを名指しする。
 *
 * 測るのは4つ。見出し・選択肢の入れ物・押せる札のひとつひとつ・CTA。
 */

import { test, type Page } from "@playwright/test";

import { dismissLessonIntro } from "./support/lessonIntro";
import { stubApi } from "./support/stubApi";

const SIZES = [
  { name: "320x568", width: 320, height: 568 },
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
];

/** いま画面に出ているものの、位置と外寸をまとめて取る。 */
async function snapshot(page: Page) {
  return page.evaluate(() => {
    const box = (node: Element) => {
      const r = node.getBoundingClientRect();
      return {
        x: Math.round(r.x * 10) / 10,
        y: Math.round(r.y * 10) / 10,
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
      };
    };
    const one = (sel: string) => {
      const node = document.querySelector(sel);
      return node ? box(node) : null;
    };
    const many = (sel: string) =>
      [...document.querySelectorAll(sel)].map((node) => ({
        text: (node.textContent ?? "").trim().slice(0, 12),
        ...box(node),
      }));

    return {
      title: one("main h1"),
      stage: one('[data-testid="step-stage"]'),
      cta: one('[data-testid="primary-action"]'),
      hint: one('[data-testid="step-hint"]'),
      done: one('[data-testid="step-done-inline"]'),
      choices: many(
        '[data-testid="assemble-choice"], [data-testid="choice-tiles"] button, [data-testid="choice"]',
      ),
      scrollTop: document.querySelector('[data-testid="step-stage"]')?.scrollTop ?? 0,
    };
  });
}

type Shot = Awaited<ReturnType<typeof snapshot>>;

/** 2つの写しを比べて、動いたものだけを並べる。 */
function diff(before: Shot, after: Shot): string[] {
  const moved: string[] = [];
  const cmp = (name: string, a: Shot["title"], b: Shot["title"]) => {
    if (!a || !b) {
      if (a !== b) moved.push(`${name}: ${a ? "消えた" : "現れた"}`);
      return;
    }
    const parts: string[] = [];
    if (a.y !== b.y) parts.push(`y ${a.y}→${b.y}`);
    if (a.x !== b.x) parts.push(`x ${a.x}→${b.x}`);
    if (a.w !== b.w) parts.push(`w ${a.w}→${b.w}`);
    if (a.h !== b.h) parts.push(`h ${a.h}→${b.h}`);
    if (parts.length) moved.push(`${name}: ${parts.join(" / ")}`);
  };

  cmp("見出し", before.title, after.title);
  cmp("入れ物", before.stage, after.stage);
  cmp("CTA", before.cta, after.cta);
  cmp("ヒント", before.hint, after.hint);
  cmp("受取", before.done, after.done);
  if (before.scrollTop !== after.scrollTop) {
    moved.push(`勝手に送った: ${before.scrollTop}→${after.scrollTop}`);
  }

  before.choices.forEach((a, at) => {
    const b = after.choices[at];
    if (!b) return moved.push(`札${at}「${a.text}」: 消えた`);
    const parts: string[] = [];
    if (a.y !== b.y) parts.push(`y ${a.y}→${b.y}`);
    if (a.x !== b.x) parts.push(`x ${a.x}→${b.x}`);
    if (a.w !== b.w) parts.push(`w ${a.w}→${b.w}`);
    if (a.h !== b.h) parts.push(`h ${a.h}→${b.h}`);
    if (parts.length) moved.push(`札${at}「${a.text}」: ${parts.join(" / ")}`);
  });

  return moved;
}

for (const size of SIZES) {
  test(`選んだときに動くもの（${size.name}）`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await stubApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "コース" }).first().click();
    await page.getByTestId("current-course-open").click();
    await page.getByTestId("lesson-diagnosis").first().click();
    await dismissLessonIntro(page);
    await page.getByTestId("primary-action").click(); // 開始画面を抜ける

    const report: string[] = [`\n\n════════ ${size.name} ════════`];

    for (let q = 1; q <= 5; q += 1) {
      const heading = (await page.locator("main h1").first().innerText()).trim();
      report.push(`\n── 質問${q}「${heading}」`);

      const parts = page.getByTestId("assemble-part");
      const partCount = await parts.count();

      if (partCount > 0) {
        /* 枠が複数ある回（Q3・Q4）。枠を1つずつ埋めながら測る */
        for (let at = 0; at < partCount; at += 1) {
          const before = await snapshot(page);
          await parts.nth(at).getByTestId("assemble-choice").first().click();
          await page.waitForTimeout(350);
          const after = await snapshot(page);
          const moved = diff(before, after);
          report.push(
            `  枠${at + 1}を選ぶ → ${moved.length === 0 ? "動かない" : ""}`,
          );
          moved.forEach((line) => report.push(`      ${line}`));
        }
        /* 選び直し */
        const before = await snapshot(page);
        await parts.nth(0).getByTestId("assemble-choice").last().click();
        await page.waitForTimeout(350);
        const moved = diff(before, await snapshot(page));
        report.push(`  枠1を選び直す → ${moved.length === 0 ? "動かない" : ""}`);
        moved.forEach((line) => report.push(`      ${line}`));
      } else {
        const choices = page.locator(
          '[data-testid="choice-tiles"] button, main [aria-pressed]',
        );
        const count = await choices.count();
        if (count === 0) {
          report.push("  （選ぶものが無い）");
        } else {
          const before = await snapshot(page);
          await choices.first().click();
          await page.waitForTimeout(350);
          let moved = diff(before, await snapshot(page));
          report.push(`  1つ目を選ぶ → ${moved.length === 0 ? "動かない" : ""}`);
          moved.forEach((line) => report.push(`      ${line}`));

          if (count > 1) {
            const mid = await snapshot(page);
            await choices.nth(count - 1).click();
            await page.waitForTimeout(350);
            moved = diff(mid, await snapshot(page));
            report.push(`  選び直す → ${moved.length === 0 ? "動かない" : ""}`);
            moved.forEach((line) => report.push(`      ${line}`));
          }
        }
      }

      const next = page.getByTestId("primary-action");
      if (!(await next.count())) break;
      await next.click();
      await page.waitForTimeout(400);
      if (await page.getByTestId("completion-view").count()) break;
    }

    console.error(report.join("\n"));
  });
}
