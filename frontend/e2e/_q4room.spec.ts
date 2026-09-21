/**
 * 調べもの用。診断の質問画面を、いちばん低い持ち方で細かく測る。
 *
 * 見たいのは4つ。
 *
 *   進み具合の行 … 帯と名前が2行に分かれていないか（⑬）
 *   Q4 の縦の刻み … 場面と札の切れ目が、そろっているか（⑦）
 *   選んだ札の差 … 選んだものと選んでいないものの見分け（⑩）
 *   下のボタン   … 大きさと重さ（⑫）
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

async function answerOne(page: Page): Promise<void> {
  const parts = page.getByTestId("assemble-part");
  const count = await parts.count();
  if (count > 0) {
    for (let index = 0; index < count; index += 1) {
      const part = parts.nth(index);
      if (await part.locator("[aria-pressed='true']").count()) continue;
      await part.getByTestId("assemble-choice").first().click();
    }
  } else {
    const cards = page.locator("[aria-pressed]");
    if (await cards.count()) await cards.first().click();
  }
  await page.waitForTimeout(500);
  const next = page.getByTestId("primary-action");
  if ((await next.getAttribute("aria-disabled")) !== "true") await next.click();
  await page.waitForTimeout(700);
}

test("Q4 の縦の刻みと、選んだ札の見分け", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "スマホの見え方だけ見る");
  await stubApi(page);
  await page.setViewportSize({ width: 402, height: 660 });
  await page.goto("/");
  await page.getByTestId("open-diagnosis").click();
  await page.getByTestId("primary-action").click();

  /* Q4 まで進む */
  for (let at = 1; at <= 3; at += 1) await answerOne(page);
  await expect(page.locator("main h1").first()).toHaveText(
    "こんなとき、AIに何を頼む？",
  );

  const before = await page.evaluate(() => {
    const parts = [...document.querySelectorAll("[data-testid='assemble-part']")];
    const rows = parts.map((part) => {
      const box = part.getBoundingClientRect();
      const label = part.querySelector("legend, [data-testid='assemble-label']");
      const first = part.querySelector("[data-testid='assemble-choice']");
      return {
        top: Math.round(box.top),
        height: Math.round(box.height),
        labelHeight: label
          ? Math.round(label.getBoundingClientRect().height)
          : 0,
        gapToChoice:
          label && first
            ? Math.round(
                first.getBoundingClientRect().top -
                  label.getBoundingClientRect().bottom,
              )
            : 0,
        choiceHeight: first
          ? Math.round(first.getBoundingClientRect().height)
          : 0,
      };
    });
    const between = rows
      .slice(1)
      .map((row, at) => row.top - (rows[at].top + rows[at].height));
    const stage = document.querySelector("[data-testid='step-stage']");
    const progress = document.querySelector("[data-testid='lesson-progress']");
    const instruction = document.querySelector("main p");
    return {
      rows,
      between,
      progressHeight: progress
        ? Math.round(progress.getBoundingClientRect().height)
        : 0,
      stageScroll: stage ? stage.scrollHeight - stage.clientHeight : 0,
      instruction: instruction?.textContent ?? "",
    };
  });
  console.log("Q4 いま:", JSON.stringify(before, null, 1));

  await page.screenshot({ path: "test-results/_q4-before.png", fullPage: true });

  /* 1つだけ選んで、選んだ札と選んでいない札の見た目を比べる */
  const first = page.getByTestId("assemble-part").first();
  await first.getByTestId("assemble-choice").first().click();
  await page.waitForTimeout(400);

  const look = await page.evaluate(() => {
    const part = document.querySelector("[data-testid='assemble-part']")!;
    const chips = [...part.querySelectorAll("[data-testid='assemble-choice']")];
    return chips.map((chip) => {
      const style = getComputedStyle(chip);
      return {
        pressed: chip.getAttribute("aria-pressed"),
        bg: style.backgroundColor,
        border: style.borderColor,
        weight: style.fontWeight,
        color: style.color,
      };
    });
  });
  console.log("選んだ札の見分け:", JSON.stringify(look, null, 1));

  await page.screenshot({ path: "test-results/_q4-picked.png", fullPage: true });
  expect(true).toBe(true);
});
