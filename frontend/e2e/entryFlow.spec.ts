/**
 * 入口の3枚——ようこそ・診断の案内・ホーム。
 *
 * 見張るのは4つ。**下のほうが重い。**
 *
 *   1. はじめての人が、ようこそ → 案内 → ホーム と通る
 *   2. 案内の「診断をはじめる」が、そのまま1問目に着く
 *   3. 3つの入口（登録・ログイン・ゲスト）が、それぞれ機能する
 *   4. **再訪で、ようこそも案内も出ないこと**
 *
 * 4つ目がいちばん重い。入口は出しそこねてもアプリの中から辿れるが、
 * 毎回出ると、続きをやりに来た人が始め方を選び直すことになる。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi, type StubOptions } from "./support/stubApi";

/**
 * まっさらな端末で開く。
 *
 * `showEntry: true` は「案内を黙らせない」の意味（既定は黙らせる。
 * ほとんどの検査は入口を見に来ていないため）。
 */
async function openFresh(page: Page, options: StubOptions = {}): Promise<void> {
  await stubApi(page, { showEntry: true, ...options });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}

const welcome = (page: Page) => page.getByTestId("welcome-page");
const intro = (page: Page) => page.getByTestId("diagnosis-intro-page");

test.describe("はじめての人", () => {
  test("ようこそから始まり、始め方が3つ出ている", async ({ page }) => {
    await openFresh(page);

    await expect(welcome(page)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "触って学ぶ、AIの使い方。" }),
    ).toBeVisible();
    await expect(page.getByTestId("welcome-signup")).toBeVisible();
    await expect(page.getByTestId("welcome-signin")).toBeVisible();
    await expect(page.getByTestId("welcome-guest")).toBeVisible();
    // まだ「アプリの中」ではない。下タブは出さない
    await expect(page.getByTestId("tab-bar")).toHaveCount(0);
    // 普段どおりのロゴ
    await expect(page.getByTestId("brand-logo")).toBeVisible();
  });

  test("決まる前に、別の画面をちらつかせない", async ({ page }) => {
    /*
      ログイン状態が届く前にどちらかを出すと、決まった瞬間に
      入れ替わる——一瞬だけ知らない画面が見える。ようこそが出てから
      1.5秒のあいだ、一度も消えないことを見る。
    */
    await openFresh(page);
    await expect(welcome(page)).toBeVisible();

    for (let at = 0; at < 6; at += 1) {
      await page.waitForTimeout(250);
      await expect(welcome(page)).toBeVisible();
      await expect(page.getByTestId("next-up")).toHaveCount(0);
    }
  });

  test("ゲストで始めると、ホームを経由せず案内へ", async ({ page }) => {
    await openFresh(page);
    await page.getByTestId("welcome-guest").click();

    await expect(intro(page)).toBeVisible();
    // ホームを一度も挟まない
    await expect(page.getByTestId("next-up")).toHaveCount(0);
    await expect(page.getByTestId("tab-bar")).toHaveCount(0);
    await expect(page.getByTestId("diagnosis-intro-meta")).toContainText("全5問");
  });
});

test.describe("案内から先", () => {
  const toIntro = async (page: Page) => {
    await openFresh(page);
    await page.getByTestId("welcome-guest").click();
    await expect(intro(page)).toBeVisible();
  };

  test("「診断をはじめる」で、1問目に着く", async ({ page }) => {
    /*
      **開始説明を挟まない。** 案内で「5つの質問」と読んだ直後に、
      同じことを書いた画面で「診断をはじめる」をもう一度押させない。
    */
    await toIntro(page);
    await page.getByTestId("diagnosis-intro-start").click();

    await expect(page.getByTestId("lesson-header")).toBeVisible();
    await expect(page.locator("main h1").first()).toContainText(
      "AIをどれくらい使っていますか",
    );
  });

  test("連打しても、履歴に2つ積まれない", async ({ page }) => {
    await toIntro(page);
    /*
      2回を**同じ一拍のうちに**押す。指の2度目は、画面が入れ替わるより
      早いことがある。`click()` を2回呼ぶと2回目は消えたボタンを待つので、
      確かめたい形にならない。
    */
    await page.evaluate(() => {
      const button = document.querySelector<HTMLElement>(
        "[data-testid='diagnosis-intro-start']",
      )!;
      button.click();
      button.click();
    });
    await expect(page.getByTestId("lesson-header")).toBeVisible();
    await page.waitForTimeout(300);

    const depth = await page.evaluate(
      () => (window.history.state as { depth?: number } | null)?.depth,
    );

    // 案内が根（0）で、そこから1つ進んで 1
    expect(depth).toBe(1);
  });

  test("「あとで」でホームへ進む", async ({ page }) => {
    await toIntro(page);
    await page.getByTestId("diagnosis-intro-later").click();

    await expect(page.getByTestId("next-up")).toBeVisible();
    await expect(page.getByTestId("tab-bar")).toBeVisible();
  });

  test("診断を途中で閉じたら、ホームへ戻る", async ({ page }) => {
    await toIntro(page);
    await page.getByTestId("diagnosis-intro-start").click();
    await expect(page.getByTestId("lesson-header")).toBeVisible();

    await page.getByRole("button", { name: "レッスンを閉じる" }).click();
    /*
      診断は「×」だけでは消さない。ここまでの答えは端末に残るので、
      それを言ってから決めてもらう（`LessonRunner` の `leaving`）。
    */
    const confirm = page.getByRole("button", { name: "メインへ戻る" });
    if (await confirm.count()) await confirm.click();

    /*
      ホームに着いたことは、記録の行で見る。**今日の1本ではない**——
      始められる教材を全部終えた人には、あちらが出ない日がある。
    */
    await expect(page.getByTestId("progress-summary")).toBeVisible();
    // 案内は繰り返さない
    await expect(intro(page)).toHaveCount(0);
  });

  test("あとで閉じた人も、ホームの導線から診断を始められる", async ({ page }) => {
    await toIntro(page);
    await page.getByTestId("diagnosis-intro-later").click();

    await expect(page.getByTestId("open-diagnosis")).toBeVisible();
    await page.getByTestId("open-diagnosis").click();

    /*
      こちらは**これまでどおり開始説明から**。押した人は案内を読んで
      いないので、そこがその人にとっての最初の説明になる。
    */
    await expect(page.locator("main h1").first()).toContainText(
      "今のAIの使い方をチェック",
    );
  });
});

test.describe("再訪", () => {
  test("ホームへ戻っても、読み込み直しても、入口は出ない", async ({ page }) => {
    await openFresh(page);
    await page.getByTestId("welcome-guest").click();
    await page.getByTestId("diagnosis-intro-later").click();
    await expect(page.getByTestId("next-up")).toBeVisible();

    // ほかの画面へ行って、ホームへ戻る
    await page.getByRole("button", { name: "コース" }).first().click();
    await page.getByRole("button", { name: "ホーム" }).first().click();
    await expect(page.getByTestId("next-up")).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
    await expect(intro(page)).toHaveCount(0);

    // 読み込み直す
    await page.reload();
    await expect(page.getByTestId("next-up")).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
    await expect(intro(page)).toHaveCount(0);
  });

  test("案内を見ずに学び始めた人にも、あとから案内を出さない", async ({ page }) => {
    /*
      「ゲストではじめる」を押した印だけが残って案内を読み飛ばした形
      （読み込み中に閉じた、など）。学んだ跡があれば、もう案内の
      場面ではない。
    */
    await stubApi(page, { showEntry: true });
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.localStorage.setItem("aippo:guest", "1");
      window.localStorage.setItem(
        "aippo:completed",
        JSON.stringify({ lessons: ["rewrite_text"], updatedAt: Date.now() }),
      );
    });
    await page.reload();

    await expect(page.getByTestId("progress-summary")).toBeVisible();
    await expect(intro(page)).toHaveCount(0);
  });

  test("ゲストの印より前から使っている人を、ようこそへ流さない", async ({ page }) => {
    /*
      **いちばん避けたい出方。** ゲストの印はこの入口と一緒に入った
      ものなので、それ以前から居る人は持っていない。持っていないことを
      「はじめて」と読むと、続きがある全員がようこそへ戻される。
    */
    await stubApi(page, { showEntry: true });
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.localStorage.setItem(
        "aippo:completed",
        JSON.stringify({ lessons: ["rewrite_text"], updatedAt: Date.now() }),
      );
    });
    await page.reload();

    await expect(page.getByTestId("progress-summary")).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
  });
});

test.describe("ログインしている人", () => {
  test("登録したばかりなら、案内を通る", async ({ page }) => {
    await openFresh(page, { signedIn: true, freshAccount: true });

    await expect(intro(page)).toBeVisible();
  });

  test("もう進んでいれば、そのままホーム", async ({ page }) => {
    await openFresh(page, { signedIn: true });

    await expect(page.getByTestId("next-up")).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
    await expect(intro(page)).toHaveCount(0);
  });

  test("案内を見たら、サーバーへ残す", async ({ page }) => {
    const sent: unknown[] = [];
    await page.route("**/api/v1/accounts/profile/", async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: {} }),
      });
    });

    await openFresh(page, { signedIn: true, freshAccount: true });
    await expect(intro(page)).toBeVisible();

    // 出した時点で残す。閉じるのを待たない
    await expect.poll(() => sent).toEqual([{ diagnosis_nudge_seen: true }]);
  });
});

test.describe("入口の3枚が、どの持ち方でも読める", () => {
  const SIZES = [
    { name: "320×568", width: 320, height: 568 },
    { name: "375×667", width: 375, height: 667 },
    { name: "390×844", width: 390, height: 844 },
    { name: "430×932", width: 430, height: 932 },
    { name: "デスクトップ", width: 1280, height: 800 },
  ];

  /** 縦にも横にも送れないこと、いちばん下の押す先が画面に入ること。 */
  async function fits(page: Page, lastTestId: string) {
    return page.evaluate((id) => {
      const doc = document.documentElement;
      const last = document.querySelector<HTMLElement>(`[data-testid='${id}']`);
      return {
        over: doc.scrollHeight - doc.clientHeight,
        wide: doc.scrollWidth - doc.clientWidth,
        lastBottom: last ? last.getBoundingClientRect().bottom : 0,
        viewport: window.innerHeight,
      };
    }, lastTestId);
  }

  for (const size of SIZES) {
    test(`${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openFresh(page);

      // ① ようこそ
      await expect(welcome(page)).toBeVisible();
      await page.waitForTimeout(300);
      const one = await fits(page, "welcome-guest");
      expect(one.over, `ようこそが ${one.over}px あふれた`).toBeLessThanOrEqual(0);
      expect(one.wide).toBeLessThanOrEqual(0);
      expect(one.lastBottom).toBeLessThanOrEqual(one.viewport);

      // ② 案内
      await page.getByTestId("welcome-guest").click();
      await expect(intro(page)).toBeVisible();
      await page.waitForTimeout(300);
      const two = await fits(page, "diagnosis-intro-later");
      expect(two.over, `案内が ${two.over}px あふれた`).toBeLessThanOrEqual(0);
      expect(two.wide).toBeLessThanOrEqual(0);
      expect(two.lastBottom).toBeLessThanOrEqual(two.viewport);

      // ③ ホーム
      await page.getByTestId("diagnosis-intro-later").click();
      await expect(page.getByTestId("next-up")).toBeVisible();
      await page.waitForTimeout(300);
      const three = await fits(page, "progress-summary");
      expect(three.over, `ホームが ${three.over}px あふれた`).toBeLessThanOrEqual(0);
      expect(three.wide).toBeLessThanOrEqual(0);

      /*
        **収まっているだけでは足りない。余りがあること。**

        いちばん低い持ち方で、ホームは余り 0 で収まっていた——中身と
        下タブを足してちょうど 568px。収まってはいるので `over` は 0 を
        返し、検査は通る。ところが 1px でも増えれば送りが出るので、
        同じコードが手元では通り CI では 28px あふれた（字の詰まり方で
        題の折り返しが2行と3行に分かれた）。

        どちらの環境が正しいという話ではなく、**余りが無いのが問題**。
        少しの差を吸えるだけ空けておく。
      */
      if (size.height <= 600) {
        const room = await page.evaluate(() => {
          const last = document.querySelector('[data-testid="open-diagnosis"]');
          const bar = document.querySelector('[data-testid="tab-bar"]');
          if (!last || !bar) return 999;
          return Math.round(
            bar.getBoundingClientRect().top - last.getBoundingClientRect().bottom,
          );
        });
        expect(
          room,
          `ホームの余りが ${room}px しかない。字の詰まり方が少し変わると送りが出る`,
        ).toBeGreaterThanOrEqual(16);
      }
    });
  }
});
