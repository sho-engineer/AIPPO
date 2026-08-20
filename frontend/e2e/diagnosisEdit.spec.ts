/**
 * 診断の「なおす」で、実際に答えを直せること。
 *
 * 何が起きていたか
 * ----------------
 * サマリーの「なおす」は、その質問へ戻すだけだった。戻った先には
 * 前の答えが残っているので、自動送り（選んだら次へ）が「もう答えて
 * ある」と判断して 500ms で次へ送ってしまう。押した人から見ると
 * **何も起きない**。3問とも素通りして、結果画面へ戻されていた。
 *
 * なぜ E2E なのか
 * ---------------
 * 起きていたのは「押してから500ms後」の出来事で、時計と画面の
 * 組み合わせでしか現れない。jsdom でも書けなくはないが、
 * 実際に踏んだのは本物のブラウザなので、同じ場所で見張る。
 *
 * 見るのは5つ。
 *
 *   1. 戻れる
 *   2. **戻っただけでは進まない**（ここが直したところ）
 *   3. いまの答えが選ばれた状態で見える
 *   4. 別の答えを選べば、そこからはふだんどおり自動で進む
 *   5. まとめとおすすめが、新しい答えで作り直される
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/** 診断を最後まで答えて、結果画面まで行く。 */
async function answerAll(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("lesson-diagnosis").first().click();

  // 最初の1枚は説明。そこから3問
  await page.getByTestId("primary-action").click();
  for (let asked = 0; asked < 3; asked += 1) {
    await page.locator("[aria-pressed]").first().click();
    // 自動送りを待つ
    await page.waitForTimeout(900);
  }
  await expect(
    page.getByRole("heading", { name: /おすすめ/ }),
  ).toBeVisible();
}

/** まとめを開いて、行の文字を読む。 */
async function summaryLines(page: Page): Promise<string[]> {
  const box = page.locator("details").first();
  if ((await box.getAttribute("open")) === null) {
    await box.locator("summary").click();
  }
  return (await box.locator("li").allInnerTexts()).map((line) =>
    line.replace(/\s*なおす\s*$/, "").trim(),
  );
}

test.describe("診断の「なおす」", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("戻っただけでは、勝手に次へ行かない", async ({ page }) => {
    /*
      ここが直したところ。自動送りは 500ms なので、
      それより十分に長く待って、同じ質問のままであることを見る。
    */
    await answerAll(page);
    await summaryLines(page);

    const first = page.getByRole("button", { name: "なおす" }).first();
    await first.click();

    const question = await page.locator("h1").first().innerText();
    await page.waitForTimeout(1500);

    await expect(page.locator("h1").first()).toHaveText(question);
  });

  test("いまの答えが、選ばれた状態で見える", async ({ page }) => {
    // 何を選んでいたか分からないまま選び直させない
    await answerAll(page);
    await summaryLines(page);
    await page.getByRole("button", { name: "なおす" }).first().click();
    await page.waitForTimeout(800);

    await expect(page.locator("[aria-pressed='true']")).toHaveCount(1);
  });

  test("別の答えを選べば、そこからは自動で進む", async ({ page }) => {
    /*
      直したあとにもう一度「次へ」を押させるのでは、
      直す前より手間が増える。止めるのは戻った直後だけ。
    */
    await answerAll(page);
    await summaryLines(page);
    await page.getByRole("button", { name: "なおす" }).first().click();
    await page.waitForTimeout(800);

    const question = await page.locator("h1").first().innerText();
    await page.locator("[aria-pressed='false']").first().click();
    await page.waitForTimeout(1200);

    await expect(page.locator("h1").first()).not.toHaveText(question);
  });

  test("直した答えが、まとめに出る", async ({ page }) => {
    await answerAll(page);
    const before = await summaryLines(page);

    await page.getByRole("button", { name: "なおす" }).first().click();
    await page.waitForTimeout(800);
    const picked = await page
      .locator("[aria-pressed='false']")
      .first()
      .innerText();

    await page.locator("[aria-pressed='false']").first().click();
    // 残りの質問を通って結果へ戻る
    for (let asked = 0; asked < 3; asked += 1) {
      await page.waitForTimeout(900);
      const cards = page.locator("[aria-pressed]");
      if ((await cards.count()) > 0) await cards.first().click();
    }
    await page.waitForTimeout(900);

    const after = await summaryLines(page);
    expect(after.join("\n")).toContain(picked.split("\n")[0].trim());
    expect(after).not.toEqual(before);
  });

  test("まとめに、教材の中の記号を出さない", async ({ page }) => {
    /*
      答えは `writing` `tried` のような記号で持っている。
      そのまま出すと日本語の画面に英語が並び、別の質問の
      同じ記号どうしが同じ答えに見える。
    */
    await answerAll(page);

    for (const line of await summaryLines(page)) {
      const answer = line.split("：").at(-1)?.trim() ?? "";
      expect(answer, `記号のまま出ている: ${line}`).not.toMatch(/^[a-z_]+$/);
    }
  });
});
