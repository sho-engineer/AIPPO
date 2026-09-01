/**
 * 作ったものを取っておく導線。
 *
 * 中身の出し分けは `tests/keptArtifacts.test.tsx` が見ている。
 * ここで見るのは**導線**——完了画面から取っておけるか、
 * マイ成果物に出てくるか、ゲストに理由が返るか。
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";
import { dismissDayComplete } from "./support/dismissDayComplete";

/**
 * 進めない状態か。
 *
 * `disabled` だけを見ない。答えが足りないときのボタンは、押せる形のまま
 * `aria-disabled` で「まだ進めない」を表している。
 */
async function blocked(primary: Locator): Promise<boolean> {
  if (await primary.isDisabled()) return true;
  return (await primary.getAttribute("aria-disabled")) === "true";
}

/** レッスンを1本、最後まで通す。 */
async function finishALesson(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await page.getByRole("button", { name: "コース" }).click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-rewrite_text").click();

  const primary = page.getByTestId("primary-action").first();
  for (let i = 0; i < 40; i++) {
    if (await page.getByTestId("completion-view").isVisible().catch(() => false)) break;
    if (await blocked(primary)) {
      const box = page.locator("textarea:visible").first();
      if (await box.count()) await box.fill("来週の打ち合わせの件、資料の確認をお願いします。");
      else {
        const choice = page
          .locator("main button:visible")
          .filter({
            hasNotText:
              /レッスン一覧へ|もどる|くわしく|送っています|飛ばす|スキップ|あとにする|取っておく|コピー/,
          })
          .first();
        if (await choice.count()) await choice.click();
      }
      await page.waitForTimeout(80);
    }
    if (await blocked(primary)) break;
    await primary.click();
    await page.waitForTimeout(120);
  }

  await expect(page.getByTestId("completion-view")).toBeVisible();
  // 初回は「Day1 終了！」が上に重なる。閉じないと下のボタンを押せない
  await dismissDayComplete(page);
}

test.describe("作ったものを取っておく", () => {
  test("登録した人は、完了画面から取っておける", async ({ page }) => {
    const api = await stubApi(page, { signedIn: true });
    await finishALesson(page);

    await page.getByTestId("keep-artifact").first().click();

    await expect(page.getByTestId("keep-artifact").first()).toContainText(
      "取っておきました",
    );
    expect(api.saved).toHaveLength(1);
  });

  test("取っておいたものが、マイ成果物に出る", async ({ page }) => {
    await stubApi(page, { signedIn: true });
    await finishALesson(page);

    await page.getByTestId("keep-artifact").first().click();
    await expect(page.getByTestId("keep-artifact").first()).toContainText(
      "取っておきました",
    );

    // レッスンの中には下タブが無い。閉じてから移る
    await page.getByRole("button", { name: "レッスンを閉じる" }).click();
    await page.getByRole("button", { name: "マイ成果物" }).click();

    await expect(page.getByTestId("kept-list")).toBeVisible();
  });

  test("ゲストには、押したその場で理由を返す", async ({ page }) => {
    /*
      ボタン自体は出しておく。先に消すと、取っておける場所がある
      こと自体が伝わらない。
    */
    await stubApi(page);
    await finishALesson(page);

    await page.getByTestId("keep-artifact").first().click();

    await expect(page.getByTestId("keep-artifact-note").first()).toContainText(
      "登録すると",
    );
  });

  test("ゲストのマイ成果物に、消し方の分からない行を残さない", async ({ page }) => {
    await stubApi(page);
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "はじめる" }).first().click();
    await page.getByRole("button", { name: "マイ成果物" }).click();

    await expect(page.getByTestId("kept-list")).toHaveCount(0);
    await expect(page.getByText("取っておいたもの")).toHaveCount(0);
  });
});
