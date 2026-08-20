/**
 * レッスンの通し。
 *
 * 成果物ファーストの流れを、上から下まで実際に触る。
 *
 *     完成イメージ → お試し → 観察 → 解説 → 条件を足す
 *                 → 比べる → 自分の課題 → 完了
 *
 * 実APIは呼ばない。AI の揺れを持ち込むと、落ちたときに
 * 「壊れたのか、AI の気分なのか」が分からなくなる。
 *
 * 進め方をステップ名で書き下さない。教材は管理画面から直せるので、
 * ステップが1つ増えるたびに落ちるテストは、すぐ誰も直さなくなる。
 * ここで見たいのは**最後まで進めること**そのもの。
 */

import { expect, test, type Page, type Locator } from "@playwright/test";

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

/** タイトルから教材一覧まで。端末に残った下書きは毎回消す。 */
async function toCourse(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).click();
}

async function openRewrite(page: Page): Promise<void> {
  await toCourse(page);
  await page.getByTestId("lesson-rewrite_text").click();
  await expect(page.getByTestId("primary-action").first()).toBeVisible();
}

/**
 * 1歩進める。進めなければ false。
 *
 * 主ボタンが押せないときは、押せるようにしてから押す。
 * 教材のステップが増えても、ここを直さずに済むようにしてある。
 */
async function advance(page: Page): Promise<boolean> {
  const primary = page.getByTestId("primary-action").first();
  if (!(await primary.isVisible().catch(() => false))) return false;

  if (await blocked(primary)) {
    const box = page.locator("textarea:visible").first();
    if (await box.count()) {
      await box.fill(SAMPLE);
    } else {
      const choice = page
        .locator("main button:visible")
        .filter({
          hasNotText: /レッスン一覧へ|もどる|くわしく|送っています|飛ばす|スキップ|あとにする/,
        })
        .first();
      if (await choice.count()) await choice.click();
    }
    await page.waitForTimeout(80);
  }
  if (await blocked(primary)) return false;

  await primary.click();
  return true;
}

/** 完了画面まで進める。何歩かかるかは教材が決めるので、上限だけ置く。 */
async function runToEnd(page: Page, limit = 40): Promise<void> {
  for (let i = 0; i < limit; i++) {
    if (await page.getByTestId("completion-view").isVisible().catch(() => false)) return;
    if (!(await advance(page))) break;
    await page.waitForTimeout(120);
  }
  await expect(page.getByTestId("completion-view")).toBeVisible();
}

test.describe("レッスンを最後まで進める", () => {
  let api: StubHandle;

  test.beforeEach(async ({ page }) => {
    api = await stubApi(page);
  });

  test("完成イメージから始まる（説明を先に読ませない）", async ({ page }) => {
    await openRewrite(page);

    await expect(page.getByTestId("outcome-preview")).toBeVisible();
    await expect(page.getByTestId("outcome-before")).toBeVisible();
    await expect(page.getByTestId("outcome-after")).toBeVisible();
  });

  test("最後まで進んで、完了画面が出る", async ({ page }) => {
    await openRewrite(page);
    await runToEnd(page);

    await expect(page.getByTestId("completion-view")).toContainText("スキルを身につけました");
  });

  test("教材が決めた action しか呼ばない", async ({ page }) => {
    await openRewrite(page);
    await runToEnd(page);

    expect(api.calls.length).toBeGreaterThan(0);
    for (const call of api.calls) {
      expect(["rewrite", "improve"]).toContain(call.action);
    }
  });

  test("条件を足す回は、前の結果を対象にする", async ({ page }) => {
    await openRewrite(page);
    await runToEnd(page);

    const improve = api.calls.filter((call) => call.action === "improve");
    expect(improve.length).toBeGreaterThan(0);
    for (const call of improve) {
      // 元の文章へ戻して送り直すと、1回目の効果が消えてしまう
      expect(call.input.original_text ?? "").not.toEqual("");
      expect(call.input.improvement ?? "").not.toEqual("");
    }
  });

  test("操作ログに本文を載せない", async ({ page }) => {
    await openRewrite(page);
    await runToEnd(page);

    expect(api.events.length).toBeGreaterThan(0);
    for (const event of api.events) {
      expect(JSON.stringify(event)).not.toContain("来週の打ち合わせ");
      expect(event).not.toHaveProperty("user_input");
    }
  });

  test("途中で読み込み直しても、続きから始まる", async ({ page }) => {
    await openRewrite(page);
    for (let i = 0; i < 4; i++) await advance(page);
    const before = await page.locator("main h1, main h2").first().innerText();

    await page.reload();
    await expect(page.getByTestId("primary-action").first()).toBeVisible();

    await expect(page.locator("main h1, main h2").first()).toHaveText(before);
  });
});

test.describe("うまくいかないとき", () => {
  test("AI が落ちても、画面は操作できる", async ({ page }) => {
    await stubApi(page, { failStatus: 500 });
    await openRewrite(page);

    for (let i = 0; i < 8; i++) {
      if (await page.getByTestId("step-error").isVisible().catch(() => false)) break;
      if (!(await advance(page))) break;
      await page.waitForTimeout(150);
    }

    await expect(page.getByTestId("step-error")).toBeVisible();
    // 行き止まりにしない。もう一度押せる
    await expect(page.getByTestId("primary-action").first()).toBeEnabled();
  });
});

test.describe("送る前の確認", () => {
  test("パスワードらしき入力は、そのままでは送れない", async ({ page }) => {
    await stubApi(page);
    await openRewrite(page);

    for (let i = 0; i < 12; i++) {
      const box = page.locator("textarea:visible").first();
      if (await box.count()) {
        await box.fill("パスワードは hunter2secret です。共有します。");
        const primary = page.getByTestId("primary-action").first();
        if (!(await blocked(primary))) await primary.click();
        break;
      }
      if (!(await advance(page))) break;
      await page.waitForTimeout(150);
    }

    await expect(page.getByTestId("privacy-dialog")).toBeVisible();
    // 取り消せない実害が出るものは、初期状態で送信できない
    await expect(page.getByTestId("privacy-send-anyway")).toBeDisabled();
  });
});
