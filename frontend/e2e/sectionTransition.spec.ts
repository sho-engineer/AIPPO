/**
 * 章扉。
 *
 * Day1 は4つの段に分かれている。段が変わったことは、これまで進み具合の
 * 細い帯にしか出ていなかった——帯は1本の線なので、**変わったことには
 * 気づけても、何に変わったのかは言っていない**。押した次の瞬間に別の話が
 * 始まるので、「気づいたら次の学習画面にいる」状態だった。
 *
 * ここで見るのは、部品ではなく**実際に通ったときの姿**。
 *
 *   1. 4つの段の頭で、それぞれ1枚出ること
 *   2. 絵が画面そのもので、送らずに全部見えること
 *   3. 押せば進むこと（ボタンでも、画面のどこを押しても）
 *   4. 帯が、章扉で見せた名前と同じ言葉を出すこと
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/** 丸めのぶれ。影や余白の端数で数 px は動く。 */
const SLACK = 8;

async function start(page: Page) {
  await stubApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await page.getByTestId("continue-lesson").click();
}

/** いま章扉にいるなら、その章の名前。いなければ空。 */
async function coverTitle(page: Page): Promise<string> {
  if (!(await page.getByTestId("section-transition").count())) return "";
  return (
    await page.locator("#section-transition-title").innerText({ timeout: 500 })
  ).trim();
}

/** 次へ進む。答えが要る回は、その場にあるもので埋める。 */
async function advance(page: Page): Promise<boolean> {
  const primary = page.getByTestId("primary-action").first();
  if (!(await primary.count())) return false;

  const intro = page.getByTestId("lesson-intro-close");
  if (await intro.count()) await intro.click();

  const blocked = async () =>
    (await primary.isDisabled()) ||
    (await primary.getAttribute("aria-disabled")) === "true";

  if (await blocked()) {
    const box = page.locator("textarea:visible").first();
    if (await box.count()) {
      await box.fill("来週の打ち合わせの件、資料の確認をお願いします。");
    } else {
      const choice = page
        .locator("main button:visible")
        .filter({
          hasNotText:
            /レッスン一覧へ|もどる|くわしく|全文|変わったところ|記録|送っています|飛ばす|スキップ/,
        })
        .first();
      if (await choice.count()) await choice.click();
    }
    await page.waitForTimeout(300);
  }
  if (await blocked()) return false;
  await primary.click();
  await page.waitForTimeout(900);
  return true;
}

test.setTimeout(180_000);

test.describe("段が変わったことを、1枚で言う", () => {
  test("4つの段の頭に、それぞれ出る", async ({ page }) => {
    /*
      通しで拾う。**教材の並びを信じずに、実際に出たものを数える**
      ——章扉は骨格が挟むので、挟み損ねても教材データは無傷に見える。
    */
    await start(page);

    const covers: string[] = [];
    for (let step = 0; step < 30; step += 1) {
      const title = await coverTitle(page);
      if (title) covers.push(title);
      if (await page.getByTestId("completion-view").count()) break;
      if (!(await advance(page))) break;
    }

    expect(covers).toEqual([
      "まずは試してみよう",
      "相手を決めよう",
      "トーンを変えよう",
      "自分で仕上げよう",
    ]);
  });

  test("送らずに、1枚が全部見える", async ({ page }) => {
    /*
      1枚を見て次へ行くだけの画面で、送る先が無い。

      高さの式を間違えると、中身が何も無くても帯（44px）のぶんだけ
      はみ出す——`100dvh` を帯の**下**に置いていたとき、実測で
      ちょうど 44px 送れた。
    */
    await start(page);
    await expect(page.getByTestId("section-transition")).toBeVisible();

    const over = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(over).toBeLessThanOrEqual(SLACK);

    // 絵も「つづける」も、同じ画面の中にある
    const view = page.viewportSize()!;
    for (const target of ["section-transition-tap", "primary-action"]) {
      const box = await page.getByTestId(target).first().boundingBox();
      expect(box, `${target} が無い`).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(view.height + SLACK);
    }
  });

  test("画面のどこを押しても進む", async ({ page }) => {
    /*
      親指はふつう画面の下半分にあり、そこには絵しかない。
      下のボタンまで運ばせずに済むようにする。
    */
    await start(page);
    await expect(page.getByTestId("section-transition")).toBeVisible();

    await page.getByTestId("section-transition-tap").click();

    await expect(page.getByTestId("section-transition")).toHaveCount(0);
  });

  test("帯は、章扉で見せた名前と同じ言葉を出す", async ({ page }) => {
    /*
      共通の区切りの名前（試す・変える・深める・自分で使う）は、どの
      教材にも当たるように付けてある。当たるが、**その日に何をして
      いるのかは言っていない**。章扉で名前を見せた直後に帯が別の言葉を
      出すと、見たばかりの段の名前が画面から消える。
    */
    await start(page);
    // 章扉①を通り抜けると、帯のある画面に出る
    await page.getByTestId("primary-action").first().click();
    await page.waitForTimeout(700);

    const band = await page
      .getByTestId("lesson-progress")
      .first()
      .getAttribute("aria-valuetext");

    expect(band).toContain("4つのうち1つ目");
    expect(band).toContain("試す");
  });
});
