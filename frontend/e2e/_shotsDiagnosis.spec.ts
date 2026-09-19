/**
 * 直したあとの診断を、4サイズで写し取る。
 *
 * 録画は取れない環境なので、**押した先ごとの静止画**を並べる。
 * 開始 → 質問（選ぶ前 / 選んだ後）→ 整理中 → 現在地 → 4つの力 →
 * おすすめ。
 *
 *     QA=1 npx playwright test e2e/_shotsDiagnosis.spec.ts --project=mobile
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

async function answerOne(page: Page): Promise<boolean> {
  if (await page.getByTestId("completion-view").count()) return false;
  const parts = page.getByTestId("assemble-part");
  const n = await parts.count();
  if (n > 0) {
    for (let i = 0; i < n; i += 1) {
      const part = parts.nth(i);
      if (await part.locator("[aria-pressed='true']").count()) continue;
      await part.getByTestId("assemble-choice").first().click();
    }
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(600);
    return true;
  }
  const cards = page.locator("[aria-pressed]");
  if (await cards.count()) await cards.first().click();
  await page.waitForTimeout(700);
  const primary = page.getByTestId("primary-action");
  if (
    (await primary.count()) &&
    (await primary.getAttribute("aria-disabled")) !== "true"
  ) {
    await primary.click();
    await page.waitForTimeout(600);
  }
  return true;
}

for (const size of SIZES) {
  test(`診断の写し（${size.name}）`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const dir = `shots/diagnosis/${size.name}`;
    const shot = (name: string) =>
      page.screenshot({ path: `${dir}/${name}.png` });

    await stubApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "コース" }).first().click();
    await page.getByTestId("current-course-open").click();
    await page.getByTestId("lesson-diagnosis").first().click();
    await dismissLessonIntro(page);
    await page.waitForTimeout(600);
    await shot("1-開始");

    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(500);
    await shot("2-質問1-選ぶ前");

    /* 選んだ直後。**ここで位置が動かないこと**が今回の眼目 */
    await page.locator("[aria-pressed]").first().click();
    await page.waitForTimeout(500);
    await shot("3-質問1-選んだ後");

    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(600);
    await shot("4-質問2");
    await answerOne(page);

    await shot("5-質問3-枠を埋める");
    await answerOne(page);
    await shot("6-質問4-対応づけ");
    await answerOne(page);
    await shot("7-質問5");

    /* 5問目を押した直後＝整理中。1.2秒しか出ない */
    const cards = page.locator("[aria-pressed]");
    if (await cards.count()) await cards.first().click();
    await page.waitForTimeout(300);
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(450);
    await shot("8-整理中");

    await page.waitForTimeout(1800);
    await shot("9-現在地");

    await page.getByTestId("primary-action").click();
    /* ひし形が開ききるのを待ってから写す */
    await page.waitForTimeout(1200);
    await shot("10-4つの力");

    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(700);
    await shot("11-おすすめ");
  });
}
