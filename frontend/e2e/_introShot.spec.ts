/**
 * 開始画面の、いまの姿を数える。
 *
 *   ・帯が出ていないか
 *   ・5段階の名前が、カードの中に収まっているか
 *   ・メタと道のあいだが空きすぎていないか
 *   ・余りが、本文と下のボタンのあいだに来ているか
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

async function open(page: Page) {
  await stubApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-diagnosis").first().click();
  await dismissLessonIntro(page);
  await page.waitForTimeout(500);
}

for (const size of SIZES) {
  test(`開始画面（${size.name}）`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await open(page);

    const m = await page.evaluate(() => {
      const q = (s: string) => document.querySelector(s);
      const box = (s: string) => {
        const n = q(s);
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
      };
      const card = q('[data-testid="growth-track"]')?.closest("section");
      const cardBox = card?.getBoundingClientRect();
      const labels = [...document.querySelectorAll('[data-testid="growth-node"]')].map(
        (n) => {
          const span = n.lastElementChild as HTMLElement;
          return {
            text: span.textContent ?? "",
            bottom: Math.round(span.getBoundingClientRect().bottom),
          };
        },
      );
      const stage = q('[data-testid="step-stage"]');
      return {
        bar: !!q('[data-testid="lesson-progress"]'),
        meta: box('[data-testid="diagnosis-meta"]'),
        track: box('[data-testid="growth-track"]'),
        card: cardBox
          ? { top: Math.round(cardBox.top), bottom: Math.round(cardBox.bottom) }
          : null,
        labels,
        intro: box('[data-testid="diagnosis-intro"]'),
        cta: box('[data-testid="primary-action"]'),
        po: (q('[data-po-scene]')?.textContent ?? "").trim().slice(0, 30),
        over: stage ? stage.scrollHeight - stage.clientHeight : -1,
        pageOver: document.documentElement.scrollHeight - window.innerHeight,
      };
    });

    const spill = m.labels.filter((l) => m.card && l.bottom > m.card.bottom);
    console.error(
      `\n[${size.name}]\n` +
        `  帯          : ${m.bar ? "★出ている" : "出ていない"}\n` +
        `  メタ下端    : ${m.meta?.bottom}\n` +
        `  カード      : ${m.card?.top} → ${m.card?.bottom}\n` +
        `  メタ〜カード: ${(m.card?.top ?? 0) - (m.meta?.bottom ?? 0)}px\n` +
        `  名前のはみ出し: ${spill.length === 0 ? "無し" : spill.map((s) => `${s.text}(${s.bottom})`).join(" ")}\n` +
        `  中身の下端  : ${m.intro?.bottom}\n` +
        `  CTAの上端   : ${m.cta?.top}\n` +
        `  本文〜CTA   : ${(m.cta?.top ?? 0) - (m.intro?.bottom ?? 0)}px\n` +
        `  あふれ      : ${m.over} / ページ ${m.pageOver}\n` +
        `  ポー        : 「${m.po}」`,
    );
  });
}
