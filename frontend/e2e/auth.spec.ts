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

import { openRecord } from "./support/openRecord";
import { stubApi } from "./support/stubApi";
import { dismissLessonIntro, passSkillStamp } from "./support/lessonIntro";

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

/**
 * 登録の1枚目で、メールアドレスを入れて2枚目へ進む。
 *
 * 登録は2枚になっている。1枚目で道を選び（Google / パスキー / メール）、
 * 選んだ道に要るものだけを2枚目で聞く。
 */
async function toPasswordStep(page: Page, email = "learner@example.com"): Promise<void> {
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByLabel("パスワード（確認）")).toBeVisible();
}

test.describe("登録", () => {
  test("メールアドレスが空のうちは進めない", async ({ page }) => {
    const api = await stubApi(page);
    await openAuth(page);

    await expect(page.getByTestId("auth-submit")).toBeDisabled();
    expect(api.auth).toHaveLength(0);
  });

  test("1枚目には、自分の道に要らないものを出さない", async ({ page }) => {
    /*
      前は1枚だった。Google で登録する人にもパスワード欄が見えていて、
      要らないものを数えてから始めることになっていた。
    */
    await stubApi(page, {
      social: [
        { name: "google", label: "Google", start_url: "/api/v1/accounts/social/google/start/" },
      ],
      passkey: true,
    });
    await openAuth(page);

    await expect(page.getByTestId("social-google")).toBeVisible();
    await expect(page.getByTestId("auth-to-passkey")).toBeVisible();
    await expect(page.getByLabel("パスワード", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel(/呼ばれたい名前/)).toHaveCount(0);

    // 押せるボタンが、押す前に見える位置にある
    const social = await page.getByTestId("social-google").boundingBox();
    const email = await page.getByLabel("メールアドレス").boundingBox();
    expect(social!.y).toBeLessThan(email!.y);
  });

  test("設定が入っていない環境では、区切りの線だけが残らない", async ({ page }) => {
    // 既定のスタブは「外部ログインなし・パスキー無し」
    await stubApi(page);
    await openAuth(page);

    await expect(page.getByTestId("social-buttons")).toHaveCount(0);
    await expect(page.getByTestId("auth-to-passkey")).toHaveCount(0);
    await expect(page.getByTestId("auth-dialog")).not.toContainText("または");
  });

  test("メールで続けると登録でき、アカウントが出る", async ({ page }) => {
    await stubApi(page);
    await openAuth(page);

    await toPasswordStep(page);
    await page.getByLabel("パスワード", { exact: true }).fill("aippo-strong-pass-9");
    await page.getByLabel("パスワード（確認）").fill("aippo-strong-pass-9");
    await page.getByTestId("auth-submit").click();

    await expect(page.getByTestId("account-email")).toContainText("learner@example.com");
  });

  test("どの道でも、同意は同じ形で取る", async ({ page }) => {
    const api = await stubApi(page);
    await openAuth(page);

    // 押す前に、同じ一文が見えている
    await expect(page.getByTestId("auth-consent")).toContainText("同意したことになります");
    await toPasswordStep(page);
    await expect(page.getByTestId("auth-consent")).toContainText("同意したことになります");

    await page.getByLabel("パスワード", { exact: true }).fill("aippo-strong-pass-9");
    await page.getByLabel("パスワード（確認）").fill("aippo-strong-pass-9");
    await page.getByTestId("auth-submit").click();
    await expect(page.getByTestId("account-email")).toBeVisible();

    const signup = api.auth.find((call) => call.url.includes("/signup/"));
    expect(signup?.body).toMatchObject({ accept_terms: true, accept_privacy: true });
  });

  test("パスワードも合言葉も端末に残さない", async ({ page }) => {
    await stubApi(page);
    await openAuth(page);

    await toPasswordStep(page);
    await page.getByLabel("パスワード", { exact: true }).fill("aippo-strong-pass-9");
    await page.getByLabel("パスワード（確認）").fill("aippo-strong-pass-9");
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
    await dismissLessonIntro(page);

    const primary = page.getByTestId("primary-action").first();
    for (let i = 0; i < 40; i++) {
      /*
        技を受け取る回で「覚えた」を押すと、スタンプ台紙が1枚挟まる。
        閉じずに下のボタンを押そうとすると、背景（閉じるための面）が
        受け取ってしまう。
      */
      if (await passSkillStamp(page)) continue;

      if (await page.getByTestId("completion-view").isVisible().catch(() => false)) break;
      if (await blocked(primary)) {
        const box = page.locator("textarea:visible").first();
        if (await box.count()) await box.fill("来週の打ち合わせの件、資料の確認をお願いします。");
        else {
          const choice = page
            .locator("main button:visible")
            .filter({ hasNotText:
            /レッスン一覧へ|もどる|くわしく|変わったところ|記録|全文|送っています|飛ばす|スキップ|あとにする/ })
            .first();
          if (await choice.count()) await choice.click();
        }
        await page.waitForTimeout(80);
      }
      if (await blocked(primary)) break;
      await primary.click();
      await page.waitForTimeout(120);
    }

    /*
      登録の誘いは「このレッスンの記録」の一枚の中。完了画面に残すのは
      できるようになったこと・覚えたAI技・成果物の3つだけにした
      （`src/components/course/steps/Completion.tsx`）。
    */
    await openRecord(page);
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
