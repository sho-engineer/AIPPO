/**
 * ゲストのまま試して、必要になったときに登録する流れ。
 *
 * 本物のバックエンドに当てる（`exploratory.spec.ts` と同じ考え方）。
 * スタブでは「登録できた」も「引き継げた」も作り物になり、
 * ここで見たいことが何も確かめられない。
 *
 * Google の本物の往復は測れないので、**戻ってきた形**を作って
 * 元の場所へ着くかを見る。
 */

import { expect, test, type Page } from "@playwright/test";

const API = "http://127.0.0.1:8000";

async function backendIsUp(page: Page): Promise<boolean> {
  try {
    return (await page.request.get(`${API}/health/live`)).ok();
  } catch {
    return false;
  }
}

async function openApp(page: Page) {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}

async function intoLesson(page: Page) {
  await openApp(page);
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-rewrite_text").click();
  await expect(page.getByTestId("primary-action").first()).toBeVisible();
}

test.describe("ゲストのまま試せる", () => {
  test.slow();

  test.beforeEach(async ({ page }) => {
    test.skip(!(await backendIsUp(page)), "バックエンドが起動していません");
  });

  test("登録せずにレッスンを開いて、AIまで届く", async ({ page }) => {
    /*
      入口に登録の壁を置かない。ここが崩れると、価値を見る前に
      アカウントを作らせる形に戻る。
    */
    await intoLesson(page);

    await expect(page.getByTestId("outcome-preview")).toBeVisible();
    // 登録を求める画面が割り込んでいないこと
    await expect(page.getByTestId("auth-dialog")).toHaveCount(0);
  });

  test("外へ出る前に、いた場所を控える", async ({ page }) => {
    await intoLesson(page);

    // 出るのは押した先。ここでは控えが取れることだけを見る
    await page.evaluate(() => {
      const place = window.localStorage.getItem("aippo:place");
      window.localStorage.setItem(
        "aippo:auth-return",
        JSON.stringify({ place: JSON.parse(place ?? "{}"), at: Date.now() }),
      );
    });

    const saved = await page.evaluate(() =>
      window.localStorage.getItem("aippo:auth-return"),
    );
    expect(saved).toContain("rewrite_text");
  });

  test("戻ってきたら、元のレッスンへ着く", async ({ page }) => {
    /*
      Google はアプリの入口（/）へ戻す。控えが効いていないと、
      別のタブが書き換えた「最後の画面」へ着いてしまう。
    */
    await intoLesson(page);
    const heading = await page.locator("main h1").first().innerText();

    // 別のタブが place を書き換えた状況を作る
    await page.evaluate(() => {
      const place = window.localStorage.getItem("aippo:place");
      window.localStorage.setItem(
        "aippo:auth-return",
        JSON.stringify({ place: JSON.parse(place ?? "{}"), at: Date.now() }),
      );
      window.localStorage.setItem(
        "aippo:place",
        JSON.stringify({ screen: "SETTINGS", lessonId: "rewrite_text" }),
      );
    });

    // 認証から戻ってきた形
    await page.goto("/?social=google&social_result=signup");

    await expect(page.locator("main h1").first()).toHaveText(heading);
  });

  test("控えは使ったら消える", async ({ page }) => {
    /*
      残しておくと、次にアプリを開いたときにも同じ場所へ飛ばされる。

      「次に開いたら別の画面へ行く」では確かめられない——戻った先で
      `aippo:place` が正しく上書きされるので、そのあとに `/` を開けば
      同じ画面に着くのが**正しい**。見るのは控えそのもの。
    */
    await intoLesson(page);

    await page.evaluate(() => {
      window.localStorage.setItem(
        "aippo:auth-return",
        JSON.stringify({
          place: { screen: "LESSON", lessonId: "rewrite_text" },
          at: Date.now(),
        }),
      );
    });

    await page.goto("/?social=google&social_result=signup");
    await expect(page.getByTestId("primary-action").first()).toBeVisible();

    const left = await page.evaluate(() =>
      window.localStorage.getItem("aippo:auth-return"),
    );
    expect(left).toBeNull();
  });

});

test.describe("外部ログインが失敗したとき", () => {
  test("技術的な文言をそのまま出さない", async ({ page }) => {
    await openApp(page);
    await page.goto("/?social_error=denied");

    const body = await page.locator("body").innerText();
    for (const leak of ["OAuthCallbackError", "401", "CSRF", "500", "denied"]) {
      expect(body, `${leak} が画面に出ている`).not.toContain(leak);
    }
  });
});
