/**
 * 無料で使える分を使い切ったとき。
 *
 * 見張るのは、**行き止まりにならないこと**。
 *
 * 断られた画面に「もう一度」だけを残すと、押しても必ずまた断られる。
 * 押した人には、壊れているのか自分のやり方が悪いのかも分からない。
 * 次にできることは2つ——いま登録して続ける、明日また続ける——ので、
 * その2つが本当に押せて、本当に先へ進むことを確かめる。
 *
 * 実APIは呼ばない。断り方はサーバーの `code` で決まるので、
 * その `code` を返すスタブで再現する。
 */

import { expect, test, type Page, type Locator } from "@playwright/test";

import { stubApi } from "./support/stubApi";
import { dismissLessonIntro, passSkillStamp } from "./support/lessonIntro";

const SAMPLE = "来週の打ち合わせの件、資料の確認をお願いします。";

async function blocked(primary: Locator): Promise<boolean> {
  if (await primary.isDisabled()) return true;
  return (await primary.getAttribute("aria-disabled")) === "true";
}

async function openRewrite(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-rewrite_text").click();
  await dismissLessonIntro(page);
  await expect(page.getByTestId("primary-action").first()).toBeVisible();
}

async function advance(page: Page): Promise<boolean> {
  /*
    技を受け取る回で「覚えた」を押すと、スタンプ台紙が1枚挟まる。
    閉じずに下のボタンを押そうとすると、背景が受け取ってしまう。
  */
  if (await passSkillStamp(page)) return true;

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
          hasNotText:
            /レッスン一覧へ|もどる|くわしく|変わったところ|記録|全文|送っています|飛ばす|スキップ|あとにする/,
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

/** AI へ送るところまで進めて、断られた画面を出す。 */
async function untilPaused(page: Page): Promise<void> {
  await openRewrite(page);
  for (let i = 0; i < 10; i++) {
    if (await page.getByTestId("lesson-paused").isVisible().catch(() => false)) return;
    if (!(await advance(page))) break;
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId("lesson-paused")).toBeVisible();
}

test.describe("使い切ったとき", () => {
  test("進む道が2つ出る（行き止まりにしない）", async ({ page }) => {
    await stubApi(page, {
      failStatus: 429,
      failCode: "FREE_CREDITS_EXHAUSTED",
      failDetail: "今日はここまで！　また明日、続きから試してみましょう。",
    });
    await untilPaused(page);

    await expect(page.getByTestId("lesson-paused-register")).toBeVisible();
    await expect(page.getByTestId("lesson-paused-tomorrow")).toBeVisible();
    // 押しても同じ断りに当たるだけのボタンは残さない
    await expect(page.getByTestId("primary-action")).toHaveCount(0);
  });

  test("「明日また続ける」で、ちゃんとホームへ出られる", async ({ page }) => {
    await stubApi(page, {
      failStatus: 429,
      failCode: "FREE_CREDITS_EXHAUSTED",
      failDetail: "今日はここまで！",
    });
    await untilPaused(page);

    await page.getByTestId("lesson-paused-tomorrow").click();

    await expect(page.getByTestId("tab-bar")).toBeVisible();
  });

  test("「今すぐ続きを」で、その場に登録の窓が開く", async ({ page }) => {
    /*
      別の画面へ飛ばさない。飛ばすと、いま止まっている回から離れる
      ——「続きをはじめる」と書いておきながら続きから離すことになる。
    */
    await stubApi(page, {
      failStatus: 429,
      failCode: "FREE_CREDITS_EXHAUSTED",
      failDetail: "今日はここまで！",
    });
    await untilPaused(page);

    await page.getByTestId("lesson-paused-register").click();

    await expect(page.getByRole("dialog")).toBeVisible();
    // 後ろにレッスンが残っていること（画面ごと差し替えていない）
    await expect(page.getByTestId("lesson-paused")).toBeVisible();
  });

  test("こちら側の都合の名前を出さない", async ({ page }) => {
    await stubApi(page, {
      failStatus: 429,
      failCode: "FREE_CREDITS_EXHAUSTED",
      failDetail: "今日はここまで！　また明日、続きから試してみましょう。",
    });
    await untilPaused(page);

    const text = await page.getByTestId("lesson-paused").innerText();
    for (const word of ["Quota", "quota", "クレジット", "API", "Token", "トークン"]) {
      expect(text).not.toContain(word);
    }
  });

  test("混み合っているだけのときは、登録を勧めない", async ({ page }) => {
    /*
      サービス全体が今日の上限に達した側。登録しても増えないので、
      ここで勧めると嘘になる。
    */
    await stubApi(page, { failStatus: 429 });
    await untilPaused(page);

    await expect(page.getByTestId("lesson-paused-register")).toHaveCount(0);
    await expect(page.getByTestId("lesson-paused-exit")).toBeVisible();
  });
});

test.describe("同じ操作は、1回ぶんしか減らない", () => {
  test("送るたびに合言葉が付いている", async ({ page }) => {
    /*
      付いていないと、返事が落ちて送り直されたときに作り直され、
      1回しか押していない人の分が2つ減る。
    */
    const api = await stubApi(page);
    await openRewrite(page);

    for (let i = 0; i < 10; i++) {
      if (api.calls.length > 0) break;
      if (!(await advance(page))) break;
      await page.waitForTimeout(150);
    }

    expect(api.calls.length).toBeGreaterThan(0);
    for (const call of api.calls) {
      expect(String((call as { request_id?: string }).request_id)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });

  test("押し直しても、送るのは1回だけ", async ({ page }) => {
    /*
      画面側の抑止（送信中はボタンを止める）が効いていること。
      サーバー側の合言葉と二重に守る——画面だけに任せると、
      タブを2つ開く道が残る。
    */
    const api = await stubApi(page);
    await openRewrite(page);

    // AI へ送る回の1歩手前（送る内容の確認）まで進める
    for (let i = 0; i < 12; i++) {
      if (api.calls.length > 0) break;
      const primary = page.getByTestId("primary-action").first();
      if (!(await primary.isVisible().catch(() => false))) break;
      if (await blocked(primary)) {
        if (!(await advance(page))) break;
      } else {
        // 連打する
        await primary.click({ force: true }).catch(() => {});
        await primary.click({ force: true }).catch(() => {});
        await primary.click({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(600);

    const first = api.calls[0];
    const same = api.calls.filter(
      (call) => call.step_id === first.step_id && call.action === first.action,
    );
    expect(same).toHaveLength(1);
  });
});
