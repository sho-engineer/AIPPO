/**
 * ③ 結果の画面が、回答によって縦に送れるか。
 *
 * 前に測ったのは1通りの答えだけだった。**特徴が2行出る答え**では
 * 背が伸びる。低い持ち方では1行に絞ってあるが、高い持ち方（700px 以上）
 * では2行とも出るので、そちらで伸びる。
 *
 * 答えの組み合わせを変えて、4サイズで通す。
 *
 * ついでに①の詰め——320で送られたのは**アプリか、検査の道具か**。
 * Playwright の `click()` は押す前に要素を画面内へ送るので、送らずに
 * 押して確かめる。
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

/** 答えの型。どの札を選ぶかで、結果の長さが変わる */
const PATTERNS = [
  { name: "全部ひかえめ", usage: 0, style: 0, part: 0, want: 0 },
  { name: "全部つよめ", usage: 4, style: 4, part: 0, want: 0 },
  { name: "まんなか", usage: 2, style: 2, part: 1, want: 1 },
];

async function run(page: Page, pick: (typeof PATTERNS)[number]) {
  await stubApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-diagnosis").first().click();
  await dismissLessonIntro(page);
  await page.getByTestId("primary-action").click();

  const order = [pick.usage, pick.style, 0, 0, pick.want];
  for (let q = 0; q < 5; q += 1) {
    const parts = page.getByTestId("assemble-part");
    const n = await parts.count();
    if (n > 0) {
      for (let i = 0; i < n; i += 1) {
        const chips = parts.nth(i).getByTestId("assemble-choice");
        const at = Math.min(pick.part, (await chips.count()) - 1);
        await chips.nth(at).click();
      }
    } else {
      const cards = page.locator("main [aria-pressed]");
      const at = Math.min(order[q], (await cards.count()) - 1);
      await cards.nth(at).click();
    }
    await page.waitForTimeout(350);
    const cta = page.getByTestId("primary-action");
    if (!(await cta.count())) break;
    await cta.click();
    await page.waitForTimeout(550);
  }
}

async function overflow(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector('[data-testid="step-stage"]');
    return {
      over: stage ? stage.scrollHeight - stage.clientHeight : -1,
      page: document.documentElement.scrollHeight - window.innerHeight,
      heading: (document.querySelector("main h1")?.textContent ?? "").trim(),
      traits: document.querySelectorAll(
        '[data-testid="diagnosis-traits"] > li:not(.hidden)',
      ).length,
    };
  });
}

for (const size of SIZES) {
  for (const pick of PATTERNS) {
    test(`③ 結果が送れるか（${size.name} / ${pick.name}）`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await run(page, pick);

      const lines: string[] = [`\n[${size.name} / ${pick.name}]`];
      /* 整理中を過ぎるまで待つ */
      await page.waitForFunction(
        () =>
          (document.querySelector("main h1")?.textContent ?? "").includes(
            "現在地",
          ),
        undefined,
        { timeout: 12000 },
      );

      for (let screen = 0; screen < 3; screen += 1) {
        await page.waitForTimeout(1000);
        const m = await overflow(page);
        lines.push(
          `  ${m.heading.padEnd(12)} あふれ ${String(m.over).padStart(4)}px` +
            `（ページ ${m.page}）${m.traits ? ` 特徴${m.traits}行` : ""}`,
        );
        const cta = page.getByTestId("primary-action");
        if (!(await cta.count())) break;
        await cta.click();
        await page.waitForTimeout(600);
      }
      console.error(lines.join("\n"));
    });
  }
}

test("① 320で、送らずに押したら画面は動くか", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await stubApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-diagnosis").first().click();
  await dismissLessonIntro(page);
  await page.getByTestId("primary-action").click();
  /* 質問3まで */
  for (let q = 0; q < 2; q += 1) {
    await page.locator("main [aria-pressed]").first().click();
    await page.waitForTimeout(300);
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(500);
  }

  const out: string[] = ["\n════ ① 320で送らずに押す ════"];
  /* 画面内に見えている札だけを、送らずに押す */
  for (let round = 0; round < 3; round += 1) {
    const result = await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="step-stage"]')!;
      const before = stage.scrollTop;
      const chips = [
        ...document.querySelectorAll<HTMLElement>('[data-testid="assemble-choice"]'),
      ];
      /* いま完全に見えている札 */
      const seen = chips.find((c) => {
        const r = c.getBoundingClientRect();
        const s = stage.getBoundingClientRect();
        return r.top >= s.top && r.bottom <= s.bottom;
      });
      if (!seen) return null;
      const label = seen.textContent?.trim() ?? "";
      seen.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return { label, before, after: stage.scrollTop };
    });
    await page.waitForTimeout(400);
    const now = await page.evaluate(
      () => document.querySelector('[data-testid="step-stage"]')!.scrollTop,
    );
    out.push(
      result
        ? `  「${result.label}」を押す → 送り ${result.before} → ${now}` +
          (result.before === now ? "（動かない）" : "  ★動いた")
        : "  見えている札が無い",
    );
  }
  console.error(out.join("\n"));
});
