/**
 * 登録・ログインの導線。
 *
 * 第一リリースの合否そのもの。「成果物を作ってから登録し、
 * 別端末で続きを再開できる」が成り立たないと、始める意味がない。
 *
 * ここで見るのは画面側の作法。
 *
 *   - 同意しないと登録を送らない
 *   - 合言葉もパスワードも端末に残さない
 *   - 規約を読みに行っても、入力が消えない
 *
 * 引き継ぎそのものはサーバー側の話なので `backend/tests/test_accounts.py`
 * が受け持つ。ここで両方やると、落ちたときにどちらの問題か分からない。
 */

import { expect, test, type Page, type Locator } from "@playwright/test";

import { stubApi } from "./support/stubApi";

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

async function toSettings(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "その他" }).click();
}

async function openAuth(page: Page): Promise<void> {
  await toSettings(page);
  await page.getByRole("button", { name: /アカウント設定/ }).click();
  await page.getByTestId("account-open-auth").click();
  await expect(page.getByTestId("auth-dialog")).toBeVisible();
}

test.describe("登録", () => {
  test("同意しないと送らない", async ({ page }) => {
    const api = await stubApi(page);
    await openAuth(page);

    await page.getByLabel("メールアドレス").fill("learner@example.com");
    await page.getByLabel("パスワード", { exact: true }).fill("aippo-strong-pass-9");
    await page.getByLabel("パスワード（確認）").fill("aippo-strong-pass-9");

    await expect(page.getByTestId("auth-submit")).toBeDisabled();
    expect(api.auth).toHaveLength(0);
  });

  test("同意したら登録でき、アカウントが出る", async ({ page }) => {
    await stubApi(page);
    await openAuth(page);

    await page.getByLabel("メールアドレス").fill("learner@example.com");
    await page.getByLabel("パスワード", { exact: true }).fill("aippo-strong-pass-9");
    await page.getByLabel("パスワード（確認）").fill("aippo-strong-pass-9");
    await page.getByRole("checkbox").check();
    await page.getByTestId("auth-submit").click();

    await expect(page.getByTestId("account-email")).toContainText("learner@example.com");
  });

  test("パスワードも合言葉も端末に残さない", async ({ page }) => {
    await stubApi(page);
    await openAuth(page);

    await page.getByLabel("メールアドレス").fill("learner@example.com");
    await page.getByLabel("パスワード", { exact: true }).fill("aippo-strong-pass-9");
    await page.getByLabel("パスワード（確認）").fill("aippo-strong-pass-9");
    await page.getByRole("checkbox").check();
    await page.getByTestId("auth-submit").click();
    await expect(page.getByTestId("account-email")).toBeVisible();

    const stored = await page.evaluate(() =>
      JSON.stringify({ local: { ...window.localStorage }, session: { ...window.sessionStorage } }),
    );
    expect(stored).not.toContain("aippo-strong-pass-9");
    expect(stored.toLowerCase()).not.toContain("token");
  });

  test("規約を読んでも、入力が消えない", async ({ page }) => {
    await stubApi(page);
    await openAuth(page);

    await page.getByLabel("メールアドレス").fill("learner@example.com");
    await page.getByTestId("auth-read-terms").click();

    await expect(page.getByTestId("legal-terms")).toBeVisible();
    await page.getByTestId("auth-read-back").click();

    // 外部のページへ飛ばすと、戻ったときにここが空になる
    await expect(page.getByLabel("メールアドレス")).toHaveValue("learner@example.com");
  });
});

test.describe("ログインの失敗", () => {
  test("どちらが違うかは言わない", async ({ page }) => {
    await stubApi(page);
    await page.route("**/api/v1/accounts/signin/", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          code: "INVALID_CREDENTIALS",
          errors: { detail: ["メールアドレスかパスワードが違います。"] },
        }),
      }),
    );
    await openAuth(page);

    await page.getByRole("button", { name: "登録済みの方はこちら" }).click();
    await page.getByLabel("メールアドレス").fill("learner@example.com");
    await page.getByLabel("パスワード").fill("wrong-password-1");
    await page.getByTestId("auth-submit").click();

    const alert = page.getByTestId("auth-error");
    await expect(alert).toContainText("メールアドレスかパスワードが違います");
    // どのメールが登録済みかを、外から調べられないようにする
    await expect(alert).not.toContainText("登録されていません");
  });

  test("連打を断られたら、待つ時間が分かる", async ({ page }) => {
    await stubApi(page);
    await page.route("**/api/v1/accounts/signin/", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          code: "TOO_MANY_ATTEMPTS",
          errors: { detail: ["回数が多すぎます。15分ほどおいてから、もう一度お試しください。"] },
        }),
      }),
    );
    await openAuth(page);

    await page.getByRole("button", { name: "登録済みの方はこちら" }).click();
    await page.getByLabel("メールアドレス").fill("learner@example.com");
    await page.getByLabel("パスワード").fill("wrong-password-1");
    await page.getByTestId("auth-submit").click();

    await expect(page.getByTestId("auth-error")).toContainText("15分");
  });
});

test.describe("登録していない人", () => {
  test("完了画面で誘われる", async ({ page }) => {
    await stubApi(page);
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
            .filter({ hasNotText: /レッスン一覧へ|もどる|くわしく|送っています|飛ばす|スキップ|あとにする/ })
            .first();
          if (await choice.count()) await choice.click();
        }
        await page.waitForTimeout(80);
      }
      if (await blocked(primary)) break;
      await primary.click();
      await page.waitForTimeout(120);
    }

    await expect(page.getByTestId("save-progress")).toBeVisible();
  });

  test("ログイン済みなら誘わない", async ({ page }) => {
    await stubApi(page, { signedIn: true });
    await toSettings(page);
    await page.getByRole("button", { name: /アカウント設定/ }).click();

    // ログイン中はアカウントが出る＝登録の入口は出ない
    await expect(page.getByTestId("account-email")).toBeVisible();
    await expect(page.getByTestId("account-open-auth")).toHaveCount(0);
  });
});
