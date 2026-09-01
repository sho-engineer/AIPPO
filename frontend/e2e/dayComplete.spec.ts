/**
 * Day を終えた画面。
 *
 * 何が足りなかったか
 * ------------------
 * 完了画面には「Lesson 1 完了」という文字はあったが、**Day が
 * 終わった瞬間**が無かった。できるようになったこと・成果物・
 * スタンプ・次の行き先が縦に並ぶだけで、読み終えた感じで終わる。
 *
 * 最初は完了画面の上へ重ねたが、それだと祝いの下に縦積みが透けて、
 * **1日やり切った瞬間が長い前置き**になった。いまは
 *
 *     最後のステップ → できるようになりました → [完了する] → この画面
 *
 * と、流れの終点を1画面まるごと持つ。
 *
 * ここで守るもの
 * --------------
 * 1. 「完了する」の押した先が、この画面であること
 * 2. **スマホで縦スクロールが出ない**（1画面で完結する）
 * 3. **演出の途中でも押せる**（操作不能な時間を作らない）
 * 4. 帯の「←」で完了画面へ戻れる（行き止まりにしない）
 * 5. 動きを減らす設定でも、中身が全部そろって出る
 *
 * 2 は実寸の話なので、ここでしか確かめられない。jsdom の高さは
 * すべて 0 なので、単体テストで書いても何も見ていないことになる。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/** すでにレッスンに入っている状態から、完了画面まで進める。 */
async function runToCompletion(page: Page) {
  for (let step = 0; step < 30; step += 1) {
    if (await page.getByTestId("completion-view").count()) return;

    const primary = page.getByTestId("primary-action").first();
    if (!(await primary.count())) break;

    if (await primary.isDisabled().catch(() => true)) {
      const choice = page.locator("[aria-pressed]").first();
      if (await choice.count()) {
        await choice.click();
        await page.waitForTimeout(120);
        continue;
      }
      const area = page.locator("textarea").first();
      if (await area.count()) {
        await area.fill("会議の日程を確認したいです。");
        await page.waitForTimeout(120);
        continue;
      }
      break;
    }
    await primary.click();
    await page.waitForTimeout(220);
  }
}

async function start(page: Page) {
  await stubApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByTestId("continue-lesson").click();
  await expect(page.getByTestId("lesson-header")).toBeVisible();
}

/** 完了画面まで進めて、「完了する」を押す。 */
async function finishLesson(page: Page) {
  await runToCompletion(page);
  await expect(page.getByTestId("completion-view")).toBeVisible();
  await page.getByTestId("primary-action").first().click();
  await expect(page.getByTestId("day-complete")).toBeVisible();
}

test.describe("Day を終えた画面", () => {
  test("「完了する」を押した先にある", async ({ page }) => {
    await start(page);
    await runToCompletion(page);

    // 完了画面には重ねない。押すまでは出ない
    await expect(page.getByTestId("completion-view")).toBeVisible();
    await expect(page.getByTestId("day-complete")).toHaveCount(0);

    await page.getByTestId("primary-action").first().click();

    await expect(page.getByTestId("day-complete-title")).toContainText("終了");
    // 完了画面は残さない。別の画面へ移る（重ねているのではない）
    await expect(page.getByTestId("completion-view")).toHaveCount(0);
  });

  test("覚えた技と、次の日が出る", async ({ page }) => {
    await start(page);
    await finishLesson(page);

    await expect(page.getByTestId("day-complete-skill")).toContainText("AI技 GET");

    /*
      進み具合は**線の伸びだけで伝えない**。動きを止めている人にも
      分かるよう、どちらの丸にも日付の文字を添える。
    */
    const progress = page.getByTestId("day-complete-progress");
    await expect(progress).toContainText("Day1");
    await expect(progress).toContainText("Day2");
  });

  test("スマホで、縦スクロールが出ない", async ({ page }, testInfo) => {
    /*
      **この検査がこの回の中心。** 1画面で完結させると決めたので、
      中身が1つ増えるたびに、ここで気づけるようにしておく。

      `min-h` で組んであるので、はみ出しても切れずにスクロールが
      生えるだけ——目では気づきにくい。数で見る。
    */
    await start(page);
    await finishLesson(page);
    // 段取り（0.8秒）が終わって、全部出そろってから測る
    await expect(page.getByTestId("day-complete-back")).toBeVisible();
    await page.waitForTimeout(1000);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );

    expect(
      overflow,
      `${testInfo.project.name}: ${overflow}px はみ出している`,
    ).toBeLessThanOrEqual(1);
  });

  test("粒は、散って消える", async ({ page }) => {
    /*
      **画面を見て見つけた抜け。**

      粒の動き（`confetti`）は tailwind.config.js の `keyframes` に
      書いてあったが、`animation` の側に無かった。Tailwind は
      どのユーティリティからも使われていない `@keyframes` を出力
      しないので、**定義そのものが CSS に無かった**——粒は出た場所へ
      固まったまま、ポーの頭の上に居座っていた。

      「出た」だけを見る検査では通ってしまう。消えるところまで見る。
    */
    await start(page);
    await finishLesson(page);

    const particles = page.getByTestId("day-complete-particles");
    await expect(particles).toBeVisible();

    // 0.8秒 ＋ 1片ずつの遅れ（最大 0.2秒）。余裕を見て待つ
    await page.waitForTimeout(1600);

    const opacities = await particles
      .locator("span")
      .evaluateAll((nodes) =>
        nodes.map((node) => getComputedStyle(node).opacity),
      );

    expect(opacities.length, "粒が1つも無い").toBeGreaterThan(0);
    for (const opacity of opacities) {
      expect(Number(opacity), "粒が消えずに残っている").toBe(0);
    }
  });

  test("演出の途中でも押せる", async ({ page }) => {
    /*
      **待たせない。** 全部で0.8秒あるが、0msの時点から押せる。
      ここを落とすと「演出が終わるまで操作不能」に戻る。
    */
    await start(page);
    await runToCompletion(page);
    await page.getByTestId("primary-action").first().click();

    // 出た直後（まだ段階の途中）に押す
    await page.getByTestId("day-complete-back").click();

    await expect(page.getByTestId("day-complete")).toHaveCount(0);
    await expect(page.getByTestId("course-outline")).toBeVisible();
  });

  test("帯の「←」で、完了画面へ戻れる", async ({ page }) => {
    /*
      成果物を写し忘れた・アンケートに答えたい、はここでしか戻れない。
      祝って行き止まり、にはしない。
    */
    await start(page);
    await finishLesson(page);

    await page.getByTestId("lesson-back").click();

    await expect(page.getByTestId("completion-view")).toBeVisible();
    await expect(page.getByTestId("day-complete")).toHaveCount(0);
  });

  test("「次のレッスンへ」で、次の1本に入れる", async ({ page }) => {
    await start(page);
    await finishLesson(page);

    await page.getByTestId("day-complete-next").click();

    await expect(page.getByTestId("day-complete")).toHaveCount(0);
    await expect(page.getByTestId("primary-action").first()).toBeVisible();
  });

  test("動きを減らす設定でも、中身がそろっている", async ({ page }) => {
    /*
      段階を飛ばして最終形をそのまま出す。粒は出さない。
      **出さないのは飾りだけ**で、文字は全部そろう。
    */
    await page.emulateMedia({ reducedMotion: "reduce" });
    await start(page);
    await finishLesson(page);

    await expect(page.getByTestId("day-complete-title")).toBeVisible();
    await expect(page.getByTestId("day-complete-outcome")).toBeVisible();
    await expect(page.getByTestId("day-complete-skill")).toBeVisible();
    await expect(page.getByTestId("day-complete-progress")).toBeVisible();
    await expect(page.getByTestId("day-complete-back")).toBeVisible();
    await expect(page.getByTestId("day-complete-particles")).toHaveCount(0);
  });
});
