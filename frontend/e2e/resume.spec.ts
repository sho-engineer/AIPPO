/**
 * 途中まで進めた教材を、もう一度ひらいたとき。
 *
 * 診断とレッスンの**両方**で、同じ3つの道を確かめる。
 *
 *     つづきから      … 前の答え・入力・結果が戻っている
 *     最初からやり直す … その教材の途中だけが消えている
 *     あとで          … 控えは触らず、来た画面へ戻る
 *
 * いちばん重いのは**出ないこと**の側。まだ始めていない人・終えた人・
 * 中で「次へ」を押した人に出ると、学びの前に押す作業が1枚増える。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";
import { openLessonById } from "./support/openLesson";

const sheet = (page: Page) => page.getByTestId("resume-sheet");

/** ホームから、そのレッスンをもう一度ひらく。 */
async function reopen(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
  await page.getByRole("button", { name }).first().click();
}

/**
 * 診断を、いくつか答えたところまで進める。
 *
 * 数を決め打ちにしない。**答えられる形の回だけ答えて**、次に答えの
 * 要る回で止める——問いの並びが変わった日に、ここだけ古い数で折れる
 * のを避ける。
 */
async function answerSome(page: Page): Promise<void> {
  await stubApi(page);
  await openLessonById(page, "diagnosis");
  // 開始説明の1枚を抜ける
  await page.getByTestId("primary-action").first().click({ force: true });
  await page.waitForTimeout(300);

  for (let at = 0; at < 2; at += 1) {
    const choice = page.locator("main [aria-pressed]").first();
    if (!(await choice.count())) break;
    await choice.click();
    await page.getByTestId("primary-action").first().click({ force: true });
    await page.waitForTimeout(300);
  }
}

test.describe("診断", () => {
  test("3問答えて閉じると、次にひらいたとき続きを聞かれる", async ({ page }) => {
    await answerSome(page);
    await page.reload();

    await expect(sheet(page)).toBeVisible();
    await expect(page.getByTestId("resume-headline")).toHaveText("AI活用診断");
    /*
      数は教材データから。**書き写していない**ことは
      `tests/resume.test.ts` が見張る。ここでは画面に出ることを見る。
    */
    const lines = await page.getByTestId("resume-line").allInnerTexts();
    expect(lines.join(" / ")).toMatch(/全\d+問中、\d+問回答済み/);
    expect(lines.join(" / ")).toMatch(/質問\d+から再開できます/);
  });

  test("「つづきから」で、答えた分が残っている", async ({ page }) => {
    await answerSome(page);
    const before = await page.locator("main h1").first().innerText();
    await page.reload();
    await page.getByTestId("resume-continue").click();

    await expect(sheet(page)).toHaveCount(0);
    // 閉じたところと同じ問いに戻る
    await expect(page.locator("main h1").first()).toHaveText(before);

    // 戻れば、前の答えが選ばれたまま見える
    await page.getByRole("button", { name: "前のステップへ戻る" }).click();
    await expect(page.locator("main [aria-pressed='true']").first()).toBeVisible();
  });

  test("「最初からやり直す」で、1問目に戻る", async ({ page }) => {
    await answerSome(page);
    await page.reload();
    await page.getByTestId("resume-restart").click();

    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator("main h1").first()).toContainText(
      "今のAIの使い方をチェック",
    );
    // 答えは消えている。進んでも、選ばれたものが無い
    await page.getByTestId("primary-action").first().click({ force: true });
    await expect(page.locator("main [aria-pressed='true']")).toHaveCount(0);
  });

  test("消えるものを、押す前に書いてある", async ({ page }) => {
    await answerSome(page);
    await page.reload();

    const note = page.getByTestId("resume-reset-note");
    await expect(note).toContainText("今回の途中の回答・入力はリセットされます");
    await expect(note).toContainText("獲得済みのスキルや完了記録は残ります");
  });

  test("「あとで」で、控えを触らずに元の画面へ戻る", async ({ page }) => {
    await answerSome(page);
    const at = await page.locator("main h1").first().innerText();
    await page.reload();
    await page.getByTestId("resume-later").click();

    // 教材の外へ出ている
    await expect(page.getByTestId("lesson-header")).toHaveCount(0);
    // 閉じた直後に、同じ問いがもう一度出てこない
    await expect(sheet(page)).toHaveCount(0);

    // 控えは残っている。もう一度ひらけば、同じところから聞かれる
    await reopen(page, /AI活用診断/);
    await expect(sheet(page)).toBeVisible();
    await page.getByTestId("resume-continue").click();
    await expect(page.locator("main h1").first()).toHaveText(at);
  });
});

test.describe("レッスン", () => {
  test("入力と結果ごと、続きが戻る", async ({ page }) => {
    await stubApi(page);
    await openLessonById(page, "rewrite_text");
    // 1回送って、結果が出たところまで進む
    for (let at = 0; at < 3; at += 1) {
      await page.getByTestId("primary-action").first().click({ force: true });
      await page.waitForTimeout(400);
    }
    const here = await page.locator("main h1").first().innerText();

    await page.reload();
    await expect(sheet(page)).toBeVisible();
    await expect(page.getByTestId("resume-headline")).toContainText("Day1");
    await page.getByTestId("resume-continue").click();

    // 画面番号だけでなく、AI が返したものも戻っている
    await expect(page.locator("main h1").first()).toHaveText(here);
    await expect(page.getByTestId("result-preview").or(page.getByTestId("change-pairs")))
      .toBeVisible();
  });

  test("開き直しただけでは、AIをもう一度呼ばない", async ({ page }) => {
    /*
      **再開だけを理由に、持ち分を使わない。** 送った回数を数える。
    */
    const handle = await stubApi(page);
    await openLessonById(page, "rewrite_text");
    for (let at = 0; at < 3; at += 1) {
      await page.getByTestId("primary-action").first().click({ force: true });
      await page.waitForTimeout(400);
    }
    const sent = handle.calls.length;
    expect(sent).toBeGreaterThan(0);

    await page.reload();
    await page.getByTestId("resume-continue").click();
    await page.waitForTimeout(800);

    expect(handle.calls.length).toBe(sent);
  });

  test("「最初からやり直す」は、そのレッスンの途中だけを消す", async ({ page }) => {
    await stubApi(page);
    await openLessonById(page, "rewrite_text");
    for (let at = 0; at < 3; at += 1) {
      await page.getByTestId("primary-action").first().click({ force: true });
      await page.waitForTimeout(400);
    }
    // 別のレッスンにも途中を作っておく
    await page.evaluate(() => {
      window.localStorage.setItem(
        "aippo:draft:summarize_text",
        JSON.stringify({
          version: 3,
          lessonId: "summarize_text",
          stepId: "own_text",
          values: { original_text: "のこす" },
          updatedAt: Date.now(),
        }),
      );
    });

    await page.reload();
    await page.getByTestId("resume-restart").click();
    await page.waitForTimeout(400);

    const other = await page.evaluate(() =>
      window.localStorage.getItem("aippo:draft:summarize_text"),
    );
    expect(other).toContain("のこす");
  });
});

test.describe("出さない場面", () => {
  test("まだ始めていなければ、そのまま始まる", async ({ page }) => {
    await stubApi(page);
    await openLessonById(page, "rewrite_text");

    await expect(sheet(page)).toHaveCount(0);
  });

  test("中の「次へ」「戻る」では出ない", async ({ page }) => {
    await stubApi(page);
    await openLessonById(page, "rewrite_text");
    for (let at = 0; at < 3; at += 1) {
      await page.getByTestId("primary-action").first().click({ force: true });
      await page.waitForTimeout(300);
      await expect(sheet(page)).toHaveCount(0);
    }
    await page.getByRole("button", { name: "前のステップへ戻る" }).click();

    await expect(sheet(page)).toHaveCount(0);
  });

  test("終えた教材では出ない", async ({ page }) => {
    await stubApi(page);
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.setItem(
        "aippo:completed",
        JSON.stringify({ lessons: ["rewrite_text"], updatedAt: Date.now() }),
      );
      window.localStorage.setItem(
        "aippo:draft:rewrite_text",
        JSON.stringify({
          version: 3,
          lessonId: "rewrite_text",
          stepId: "find_change",
          values: {},
          updatedAt: Date.now(),
        }),
      );
    });
    await page.reload();
    await reopen(page, /文章を分かりやすくする/);

    await expect(page.getByTestId("lesson-header")).toBeVisible();
    await expect(sheet(page)).toHaveCount(0);
  });

  test("別のアカウントの途中は、見せも使いもしない", async ({ page }) => {
    await stubApi(page, { signedIn: true });
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.setItem(
        "aippo:draft:rewrite_text",
        JSON.stringify({
          version: 3,
          lessonId: "rewrite_text",
          stepId: "find_change",
          values: { original_text: "ほかのひとのぶん" },
          owner: "だれか別のひと",
          updatedAt: Date.now(),
        }),
      );
    });
    await page.reload();
    await reopen(page, /文章を分かりやすくする/);

    await expect(page.getByTestId("lesson-header")).toBeVisible();
    await expect(sheet(page)).toHaveCount(0);
    // 中身も引き継がない
    await expect(page.locator("main")).not.toContainText("ほかのひとのぶん");
  });
});

test.describe("教材が更新されたとき", () => {
  test("復元できないのに「つづきから」を出さない", async ({ page }) => {
    await stubApi(page);
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.setItem(
        "aippo:draft:rewrite_text",
        JSON.stringify({
          version: 3,
          lessonId: "rewrite_text",
          stepId: "find_change",
          values: {},
          revision: "むかしの版",
          updatedAt: Date.now(),
        }),
      );
    });
    await page.reload();
    await reopen(page, /文章を分かりやすくする/);

    await expect(sheet(page)).toBeVisible();
    await expect(page.getByTestId("resume-continue")).toHaveCount(0);
    await expect(page.getByTestId("resume-blocked")).toContainText("最初から");
    // 最初から始める道は残っている
    await page.getByTestId("resume-restart").click();
    await expect(sheet(page)).toHaveCount(0);
  });
});

test.describe("どの持ち方でも読める", () => {
  for (const [name, width, height] of [
    ["320×568", 320, 568],
    ["375×667", 375, 667],
    ["390×844", 390, 844],
  ] as const) {
    test(name, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await answerSome(page);
      await page.reload();
      await expect(sheet(page)).toBeVisible();
      // 出てくる動きが終わってから測る（`scale` 中は縮んで読める）
      await page.waitForTimeout(400);

      const seen = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>(
          "[data-testid='resume-sheet'] [role='dialog']",
        )!;
        const later = document.querySelector<HTMLElement>(
          "[data-testid='resume-later']",
        )!;
        const start = document.querySelector<HTMLElement>(
          "[data-testid='resume-continue']",
        )!;
        return {
          over: panel.scrollHeight - panel.clientHeight,
          laterBottom: later.getBoundingClientRect().bottom,
          startHeight: start.offsetHeight,
          laterHeight: later.offsetHeight,
          viewport: window.innerHeight,
        };
      });

      expect(seen.over, `${name}: 一枚が ${seen.over}px あふれた`).toBe(0);
      expect(seen.laterBottom).toBeLessThanOrEqual(seen.viewport);
      expect(seen.startHeight).toBeGreaterThanOrEqual(44);
      expect(seen.laterHeight).toBeGreaterThanOrEqual(44);
    });
  }
});
