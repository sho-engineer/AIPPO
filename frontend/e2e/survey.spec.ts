/**
 * 完了時のアンケート（AIPPO 開発概要 §11）。
 *
 * なぜ通しで見張るか
 * ------------------
 * このアンケートは、一度**画面から落ちたことがある**。
 * モデルも API も残ったまま、成果物ファーストへ作り直したときに
 * 完了画面から外れ、誰も気づかないまま実験の判定材料が消えていた。
 *
 * 落ちても、他のどのテストも赤くならない。アンケートは無くても
 * レッスンは最後まで進むからで、そこが厄介なところ。
 * 「完了画面まで行くと、確かに出る」をここで押さえる。
 *
 * 「有料テストの申込率」は、フェーズ2→3 の判定にある2つの条件のうち、
 * 記録から出せないほうの1つ（`docs/roadmap.md`）。ここが唯一の入口。
 */

import { expect, test, type Page, type Locator } from "@playwright/test";

import { openRecord } from "./support/openRecord";
import { stubApi, type StubHandle } from "./support/stubApi";

/**
 * 進めない状態か。
 *
 * `disabled` だけを見ない。答えが足りないときのボタンは、押せる形のまま
 * `aria-disabled` で「まだ進めない」を表している（押した人に理由を返すため）。
 * 属性だけで見分けると、押しても進まないボタンを押し続けることになる。
 */
async function blocked(primary: Locator): Promise<boolean> {
  if (await primary.isDisabled()) return true;
  return (await primary.getAttribute("aria-disabled")) === "true";
}

const SAMPLE = "来週の打ち合わせの件、資料の確認をお願いします。";

/** 完了画面まで進める。（lesson.spec.ts と同じ考え方） */
async function runToCompletion(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await page.getByRole("button", { name: "コース" }).click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-rewrite_text").click();

  for (let i = 0; i < 40; i++) {
    if (await page.getByTestId("completion-view").isVisible().catch(() => false)) break;
    const primary = page.getByTestId("primary-action").first();
    if (!(await primary.isVisible().catch(() => false))) break;

    if (await blocked(primary)) {
      const box = page.locator("textarea:visible").first();
      if (await box.count()) {
        await box.fill(SAMPLE);
      } else {
        const choice = page
          .locator("main button:visible")
          .filter({
            hasNotText:
            /レッスン一覧へ|もどる|くわしく|変わったところ|記録|全文|送っています|飛ばす|スキップ|あとにする/,
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
  // 進み具合・応用例・アンケートは「このレッスンの記録」の一枚の中
  await openRecord(page);
}

test.describe("完了時のアンケート", () => {
  let api: StubHandle;

  test.beforeEach(async ({ page }) => {
    api = await stubApi(page);
  });

  test("完了画面まで進むと出る", async ({ page }) => {
    await runToCompletion(page);

    await expect(page.getByTestId("survey")).toBeVisible();
  });

  test("答えると、選んだ内容がそのまま送られる", async ({ page }) => {
    await runToCompletion(page);

    // 3問とも、いちばん左を選ぶ
    for (const label of ["すぐ使えそう", "使うと思う", "試したい"]) {
      await page.locator('[data-testid="survey"] label', { hasText: label }).first().click();
    }
    await page.getByTestId("survey-submit").click();

    await expect(page.getByTestId("survey-done")).toBeVisible();

    expect(api.surveys).toHaveLength(1);
    expect(api.surveys[0].lessonId).toBe("rewrite_text");

    /*
      有料の意向は、記録からは出せない唯一の数字。
      質問文がそのまま集計の見出しになるので、鍵ごと確かめる。
    */
    expect(api.surveys[0].answers).toEqual({
      仕事で使えそうですか: "すぐ使えそう",
      "7日以内に自分の仕事で使ってみますか": "使うと思う",
      もっと詳しい内容が有料であったら試したいですか: "試したい",
    });
  });

  test("答えなくても、行き止まりにならない", async ({ page }) => {
    await runToCompletion(page);

    await page.getByTestId("survey-skip").click();

    await expect(page.getByTestId("survey")).toBeHidden();
    // 完了画面そのものは残る。次の教材へ進める
    await expect(page.getByTestId("completion-view")).toBeVisible();
    expect(api.surveys).toHaveLength(0);
  });
});
