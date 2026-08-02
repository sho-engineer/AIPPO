import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/**
 * アクセシビリティの自動検査。
 *
 * 目視では気づけないもの（コントラスト不足、名前の無いボタン、
 * 見出しの飛び、読み上げに届かない更新）を機械に拾わせる。
 *
 * 対象は WCAG 2.1 の A / AA。市場に出すなら最低限ここは満たす。
 * 自動検査で拾えるのは全体の一部だが、拾えるものを見逃さないための土台。
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(TAGS).analyze();
}

/** 違反を読める形にする。件数だけでは直せない。 */
function describe(violations: Awaited<ReturnType<typeof scan>>["violations"]) {
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help}\n` +
        v.nodes
          .map(
            (n) =>
              `    ${n.target.join(" ")}\n` +
              `      ${(n.failureSummary ?? "").replace(/\n/g, "\n      ")}`,
          )
          .join("\n"),
    )
    .join("\n");
}

async function openLesson(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "はじめる" }).click();
  for (let i = 0; i < 3; i++) {
    const choices = page.locator("main section button");
    await choices.first().waitFor();
    await choices.first().click();
  }
  await page.getByRole("button", { name: "これを試す" }).click();
  await expect(page.getByTestId("lesson-step")).toBeVisible();
}

test.describe("アクセシビリティ", () => {
  test("トップ画面", async ({ page }) => {
    await stubApi(page);
    await page.goto("/");

    const { violations } = await scan(page);
    expect(describe(violations)).toBe("");
  });

  test("診断画面", async ({ page }) => {
    await stubApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "はじめる" }).click();
    await page.locator("main section button").first().waitFor();

    const { violations } = await scan(page);
    expect(describe(violations)).toBe("");
  });

  test("レッスンの入力画面", async ({ page }) => {
    await stubApi(page);
    await openLesson(page);
    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "仕事のメール" }).click();

    const { violations } = await scan(page);
    expect(describe(violations)).toBe("");
  });

  test("結果の比較画面", async ({ page }) => {
    await stubApi(page);
    await openLesson(page);
    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "仕事のメール" }).click();
    await page.getByRole("button", { name: "社外のお客様", exact: true }).click();
    await page.getByRole("button", { name: "ていねいに", exact: true }).click();
    await page.getByRole("button", { name: "3行くらい", exact: true }).click();
    await page.getByTestId("primary-action").click();
    await expect(page.getByTestId("result-compare")).toBeVisible();

    const { violations } = await scan(page);
    expect(describe(violations)).toBe("");
  });

  test("キーボードだけでレッスンを始められる", async ({ page }) => {
    // マウスを使えない人が最初の一歩で詰まらないこと
    await stubApi(page);
    await page.goto("/");

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const label = await page.evaluate(
        () => document.activeElement?.textContent?.trim() ?? "",
      );
      if (label === "はじめる") break;
    }

    const focused = await page.evaluate(
      () => document.activeElement?.textContent?.trim() ?? "",
    );
    expect(focused, "「はじめる」までタブで到達できない").toBe("はじめる");

    await page.keyboard.press("Enter");
    await expect(page.locator("main section button").first()).toBeVisible();
  });

  test("読み上げの邪魔をしない", async ({ page }) => {
    // 書きかけの文章を読み上げに割り込ませると、
    // スクリーンリーダーの利用者は最後まで聞けない。
    await stubApi(page, { streamChunkSize: 3 });
    await openLesson(page);
    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "仕事のメール" }).click();

    const live = page.locator("[aria-live]");
    await expect(live).toHaveCount(1); // ポーの吹き出しだけ
    await expect(live).toHaveAttribute("aria-live", "polite");
  });
});
