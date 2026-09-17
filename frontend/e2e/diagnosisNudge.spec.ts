/**
 * ホームで1度だけ出す、「まずは診断を」の案内。
 *
 * 見張るのは4つ。**下のほうが重い。**
 *
 *   1. 初めて来た人に、1度は出る
 *   2. 押した先が、診断の1問目であること（説明を2回読ませない）
 *   3. 閉じられて、閉じたあとのホームが普通に使えること
 *   4. **二度目が出ないこと**
 *
 * 4つ目がいちばん重い。案内は出しそこねてもホームの常設の入口から
 * 辿れるが、二度目が出ると「閉じたのに戻ってきた」になる。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi, type StubOptions } from "./support/stubApi";

/** 初めて来たゲストとして、ホームを開く。 */
async function openHome(page: Page, options: StubOptions = {}): Promise<void> {
  await stubApi(page, { diagnosisNudge: true, ...options });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
}

const nudge = (page: Page) => page.getByTestId("diagnosis-nudge-sheet");

/**
 * ホームへ出るまで、端末の「戻る」を押す。
 *
 * レッスンの中では「戻る」が**回を1つ戻す**（`components/course/BackStack.tsx`）。
 * 1回で出られると決め打ちにすると、教材の回数が変わった日にここが折れる。
 */
async function backToHome(page: Page): Promise<void> {
  for (let at = 0; at < 6; at += 1) {
    if (await page.getByTestId("next-up").count()) return;
    await page.goBack();
    await page.waitForTimeout(250);
  }
  await expect(page.getByTestId("next-up")).toBeVisible();
}

test.describe("初めての人への案内", () => {
  test("ホームを開くと出る", async ({ page }) => {
    await openHome(page);

    await expect(nudge(page)).toBeVisible();
    await expect(page.getByTestId("diagnosis-nudge-meta")).toContainText("全5問");
  });

  test("出す前に、一瞬出して消す挙動が無い", async ({ page }) => {
    /*
      ログイン状態と進み具合が届く前に決めると、出してから消えるか、
      出すべき人に出ないかのどちらかになる。**ちらつきは、出ないより
      悪い**——何かが起きたことだけが残って、何だったのかは分からない。

      出てから 1.5 秒のあいだ、一度も消えないことを見る。
    */
    await openHome(page);
    await expect(nudge(page)).toBeVisible();

    for (let at = 0; at < 6; at += 1) {
      await page.waitForTimeout(250);
      await expect(nudge(page)).toBeVisible();
    }
  });

  test("後ろのホームは、押しても動かない", async ({ page }) => {
    /*
      案内の裏でレッスンが始まると、閉じた先が別の画面になる。
      背景そのものでも閉じない——指が外れただけで消えると、
      読む前に無くなった人には二度と出ない。
    */
    await openHome(page);
    await expect(nudge(page)).toBeVisible();

    await page.getByTestId("diagnosis-nudge-scrim").click({ force: true });

    await expect(nudge(page)).toBeVisible();
    await expect(page.getByTestId("lesson-header")).toHaveCount(0);
  });

  test("後ろのページは送れない", async ({ page }) => {
    await openHome(page);
    await expect(nudge(page)).toBeVisible();

    const locked = await page.evaluate(
      () => getComputedStyle(document.body).overflow,
    );

    expect(locked).toBe("hidden");
  });
});

test.describe("押した先", () => {
  test("「診断をはじめる」で、1問目に着く", async ({ page }) => {
    /*
      **開始説明を挟まない。** 案内で「5つの質問」と読んだ直後に、
      同じことを書いた画面で「診断をはじめる」をもう一度押させない。
    */
    await openHome(page);
    await page.getByTestId("diagnosis-nudge-start").click();

    await expect(nudge(page)).toHaveCount(0);
    await expect(page.getByTestId("lesson-header")).toBeVisible();
    await expect(page.locator("main h1").first()).toContainText(
      "AIをどれくらい使っていますか",
    );
  });

  test("連打しても、履歴に2つ積まれない", async ({ page }) => {
    /*
      2回進むと、診断から戻った人がもう一度診断に着く。

      数えるのは**アプリが積んだ段の深さ**（`App.tsx` の `depth`）。
      `history.length` はレッスンの中の層も足すので、押した回数だけを
      見るにはこちらのほうが素直。ホームが 1、そこから1回進んで 2。
    */
    await openHome(page);
    /*
      2回を**同じ一拍のうちに**押す。指の2度目は、一枚が閉じるより
      早いことがある——そこを再現したいので、間に描き直しを挟まない。
      Playwright の `click()` を2回呼ぶと、2回目は消えたボタンを待つ
      ことになり、確かめたい形にならない。
    */
    await page.evaluate(() => {
      const button = document.querySelector<HTMLElement>(
        "[data-testid='diagnosis-nudge-start']",
      )!;
      button.click();
      button.click();
    });
    await expect(page.getByTestId("lesson-header")).toBeVisible();
    await page.waitForTimeout(300);

    const depth = await page.evaluate(
      () => (window.history.state as { depth?: number } | null)?.depth,
    );

    expect(depth).toBe(2);
  });

  test("コースから普通に開いた診断は、これまでどおり開始説明から", async ({
    page,
  }) => {
    /*
      説明を飛ばすのは**案内を読んだ人だけ**。こちらを押した人は
      案内を読んでいないので、そこが最初の説明になる。
    */
    await openHome(page);
    await page.getByTestId("diagnosis-nudge-later").click();

    await page.getByTestId("open-diagnosis").click();

    await expect(page.locator("main h1").first()).toContainText(
      "今のAIの使い方をチェック",
    );
  });
});

test.describe("閉じたあと", () => {
  for (const [how, close] of [
    ["あとで", (page: Page) => page.getByTestId("diagnosis-nudge-later").click()],
    ["×", (page: Page) => page.getByTestId("diagnosis-nudge-close").click()],
    ["Escape", (page: Page) => page.keyboard.press("Escape")],
  ] as const) {
    test(`「${how}」で閉じて、そのままホームが使える`, async ({ page }) => {
      await openHome(page);
      await close(page);

      await expect(nudge(page)).toHaveCount(0);
      // 後ろのページが送れる状態に戻っている
      expect(
        await page.evaluate(() => getComputedStyle(document.body).overflow),
      ).not.toBe("hidden");
      // 主役が押せる
      await page.getByTestId("continue-lesson").click();
      await expect(page.getByTestId("lesson-header")).toBeVisible();
    });
  }

  test("ホームへ戻っても、読み込み直しても、二度目は出ない", async ({ page }) => {
    await openHome(page);
    await page.getByTestId("diagnosis-nudge-later").click();
    await expect(nudge(page)).toHaveCount(0);

    // ほかの画面へ行って、ホームへ戻る
    await page.getByRole("button", { name: "コース" }).first().click();
    await page.getByRole("button", { name: "ホーム" }).first().click();
    await expect(page.getByTestId("next-up")).toBeVisible();
    await expect(nudge(page)).toHaveCount(0);

    // 読み込み直す
    await page.reload();
    await expect(page.getByTestId("next-up")).toBeVisible();
    await expect(nudge(page)).toHaveCount(0);
  });

  test("診断を始めて閉じても、二度目は出ない", async ({ page }) => {
    await openHome(page);
    await page.getByTestId("diagnosis-nudge-start").click();
    await expect(page.getByTestId("lesson-header")).toBeVisible();

    await backToHome(page);

    await expect(nudge(page)).toHaveCount(0);
  });

  test("閉じた人も、ホームの常設の入口から後で始められる", async ({ page }) => {
    await openHome(page);
    await page.getByTestId("diagnosis-nudge-later").click();

    await expect(page.getByTestId("open-diagnosis")).toBeVisible();
    await page.getByTestId("open-diagnosis").click();

    await expect(page.getByTestId("lesson-header")).toBeVisible();
  });
});

test.describe("ログインしている人", () => {
  test("登録したばかりの人にも、1度は出る", async ({ page }) => {
    /*
      案内の「見た／まだ」はサーバーが持つ（`UserProfile`）。端末では
      なくそちらに持つので、会社のPCで閉じた人に、帰りの電車で
      もう一度出ることがない。
    */
    await openHome(page, { signedIn: true, freshAccount: true });

    await expect(nudge(page)).toBeVisible();
  });

  test("閉じると、サーバーへ「見た」を残す", async ({ page }) => {
    const seen: unknown[] = [];
    await page.route("**/api/v1/accounts/profile/", async (route) => {
      seen.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: {} }),
      });
    });

    await openHome(page, { signedIn: true, freshAccount: true });
    await expect(nudge(page)).toBeVisible();
    await page.getByTestId("diagnosis-nudge-later").click();
    await expect(nudge(page)).toHaveCount(0);

    await expect
      .poll(() => seen)
      .toEqual([{ diagnosis_nudge_seen: true }]);
  });
});

test.describe("出さない人", () => {
  test("もう学んでいるゲストには出さない", async ({ page }) => {
    /*
      **今回この機能が増えたことを理由に、常連のホームへ突然かぶせない。**
      ここでは「前にも来た日がある」端末として開く。
    */
    await stubApi(page, { diagnosisNudge: true });
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.localStorage.setItem(
        "aippo:streak",
        JSON.stringify({ days: 3, lastDate: "2020-01-03", openDays: ["2020-01-03"] }),
      );
    });
    await page.reload();
    await page.getByRole("button", { name: "はじめる" }).first().click();
    await expect(page.getByTestId("next-up")).toBeVisible();

    await expect(nudge(page)).toHaveCount(0);
  });

  test("診断を始めている人には出さない", async ({ page }) => {
    await stubApi(page, { diagnosisNudge: true });
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.localStorage.setItem(
        "aippo:draft:diagnosis",
        JSON.stringify({
          version: 2,
          lessonId: "diagnosis",
          stepId: "ai_usage",
          values: {},
          updatedAt: Date.now(),
        }),
      );
    });
    await page.reload();
    await page.getByRole("button", { name: "はじめる" }).first().click();
    await expect(page.getByTestId("next-up")).toBeVisible();

    await expect(nudge(page)).toHaveCount(0);
  });

  test("もう進んでいるログイン利用者には出さない", async ({ page }) => {
    /*
      スタブのログイン利用者は `in_progress: 1` を持っている。
      サーバーが数えている進み具合だけで足りる（端末は関係ない）。
    */
    await openHome(page, { signedIn: true });

    await expect(page.getByTestId("next-up")).toBeVisible();
    await expect(nudge(page)).toHaveCount(0);
  });
});

test.describe("どの持ち方でも読める", () => {
  const SIZES = [
    { name: "320×568", width: 320, height: 568 },
    { name: "375×667", width: 375, height: 667 },
    { name: "390×844", width: 390, height: 844 },
    { name: "430×932", width: 430, height: 932 },
    { name: "デスクトップ", width: 1280, height: 800 },
  ];

  for (const size of SIZES) {
    test(`${size.name} で、押す先まで全部見える`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openHome(page);
      await expect(nudge(page)).toBeVisible();
      /*
        出てくる動き（`animate-pop-in`）が終わるのを待つ。

        あれは `transform: scale()` なので、**動いている最中の
        `getBoundingClientRect()` は縮んだ大きさを返す**。待たずに
        測ると、56px のボタンが 43.7px として読めた（実際そうなった）。
      */
      await page.waitForTimeout(400);

      const seen = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>(
          "[data-testid='diagnosis-nudge-sheet'] [role='dialog']",
        )!;
        const later = document.querySelector<HTMLElement>(
          "[data-testid='diagnosis-nudge-later']",
        )!;
        const start = document.querySelector<HTMLElement>(
          "[data-testid='diagnosis-nudge-start']",
        )!;
        /* 一枚の中に、もう1つ送れる箱を作っていないこと */
        const inner = [
          ...panel.querySelectorAll<HTMLElement>("*"),
        ].filter(
          (el) =>
            el.scrollHeight > el.clientHeight + 2 &&
            ["auto", "scroll"].includes(getComputedStyle(el).overflowY),
        ).length;
        return {
          over: panel.scrollHeight - panel.clientHeight,
          laterBottom: later.getBoundingClientRect().bottom,
          /*
            当たり判定の高さは `offsetHeight` で見る。こちらは組んだ
            ときの高さで、上の動きや拡大縮小の影響を受けない。
          */
          startHeight: start.offsetHeight,
          laterHeight: later.offsetHeight,
          innerScrollers: inner,
          viewport: window.innerHeight,
        };
      });

      // 一枚そのものが送れる形はあってよいが、この5つでは収まる
      expect(seen.over, `${size.name}: 一枚が ${seen.over}px あふれた`).toBe(0);
      expect(seen.laterBottom).toBeLessThanOrEqual(seen.viewport);
      // 指で押せる大きさ。**降りる道も同じだけ取る**
      expect(seen.startHeight).toBeGreaterThanOrEqual(44);
      expect(seen.laterHeight).toBeGreaterThanOrEqual(44);
      // 入れ子の送りは作らない
      expect(seen.innerScrollers).toBe(0);
    });
  }
});
