/**
 * 詰まった人を、行き止まりにしない（Day1）。
 *
 * 見張るのは4つ。
 *
 *   1. 失敗しても、押せる道が必ずある
 *   2. **例文で試すと、そのまま成功まで行ける**
 *   3. 例文で進んだ人も、レッスンを最後まで通せる
 *   4. 続きから戻ったとき、**作ったものが残っている**
 *
 * 2つ目と4つ目がこの仕事の要。前は「もう一度」1本しか無く、
 * 開き直すと比べる画面の中身が空だった。
 */

import { expect, test, type Page, type Locator } from "@playwright/test";

import { stubApi } from "./support/stubApi";

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
  await expect(page.getByTestId("primary-action").first()).toBeVisible();
}

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

/** AI を呼ぶところまで進めて、詰まった画面を出す。 */
async function untilStuck(page: Page): Promise<void> {
  await openRewrite(page);
  for (let i = 0; i < 10; i++) {
    if (await page.getByTestId("failure-rescue").isVisible().catch(() => false)) return;
    if (!(await advance(page))) break;
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId("failure-rescue")).toBeVisible();
}

test.describe("詰まったとき", () => {
  test("押せる道が必ずある（行き止まりにしない）", async ({ page }) => {
    await stubApi(page, { failStatus: 502 });
    await untilStuck(page);

    const buttons = page.getByTestId("failure-rescue").getByRole("button");
    expect(await buttons.count()).toBeGreaterThan(0);
    for (const button of await buttons.all()) {
      await expect(button).toBeEnabled();
    }
  });

  test("同じ頼み方ではまた同じになるときは、押し直しを勧めない", async ({ page }) => {
    /*
      サーバーは既に作り直しを1回試している。それでも駄目なので、
      押し直しは道ではない。3回押して同じ画面を見た人はそこでやめる。
    */
    await stubApi(page, {
      failStatus: 502,
      failCode: "AI_RESULT_UNUSABLE",
      failDetail: "うまく変わりませんでした。別の頼み方で試してみましょう。",
    });
    await untilStuck(page);

    await expect(page.getByTestId("rescue-retry")).toHaveCount(0);
    await expect(page.getByTestId("rescue-sample")).toBeVisible();
  });

  test("学習者を評価する言葉を出さない", async ({ page }) => {
    await stubApi(page, { failStatus: 502, failCode: "AI_RESULT_UNUSABLE" });
    await untilStuck(page);

    const text = await page.getByTestId("failure-rescue").innerText();
    for (const word of ["不正解", "失敗", "間違", "正しくありません"]) {
      expect(text).not.toContain(word);
    }
  });

  test("**例文で試すと、そのまま結果まで行ける**", async ({ page }) => {
    /*
      欄へ入れるだけで止めない。詰まっている人にもう一度「送る」を
      探させると、そこでやめる。**成功体験まで連れていく。**
    */
    const api = await stubApi(page, { failStatus: 502, failOnCall: 1 });
    await untilStuck(page);

    await page.getByTestId("rescue-sample").click();

    /*
      送り直されるのを待つ。押した瞬間に画面から失敗が消えるので、
      画面だけを見ると「抜けた」が先に真になる——本当に送ったかは
      通信のほうで確かめる。
    */
    await expect.poll(() => api.calls.length).toBeGreaterThan(1);
    await expect(page.getByTestId("failure-rescue")).toHaveCount(0);
  });

  test("例文で進んだ人も、最後まで通せる", async ({ page }) => {
    /*
      例文は逃げ道であって、袋小路ではない。ここから完了まで
      行けないなら、詰まった人は結局レッスンを終えられない。
    */
    const api = await stubApi(page, { failStatus: 502, failOnCall: 1 });
    await untilStuck(page);
    await page.getByTestId("rescue-sample").click();
    await expect(page.getByTestId("failure-rescue")).toHaveCount(0);

    for (let i = 0; i < 40; i++) {
      if (await page.getByTestId("completion-view").isVisible().catch(() => false)) break;
      if (!(await advance(page))) break;
      await page.waitForTimeout(120);
    }

    await expect(page.getByTestId("completion-view")).toBeVisible();
    expect(api.calls.length).toBeGreaterThan(1);
  });
});

test.describe("続きから始める", () => {
  test("開き直しても、比べる中身が残っている", async ({ page }) => {
    /*
      **この仕事でいちばん大きかった穴。** 前は AI が返したものを
      覚えていなかったので、開き直した人は「3つを比べる」の画面に
      着くのに中身が空だった。進み具合だけ残って、作ったものが
      消えている状態になる。
    */
    await stubApi(page);
    await openRewrite(page);

    // 比べる画面まで進める
    for (let i = 0; i < 12; i++) {
      if (await page.getByTestId("compare-more").isVisible().catch(() => false)) break;
      if (!(await advance(page))) break;
      await page.waitForTimeout(150);
    }
    /*
      空白の入り方は `innerText` と描き直しで揺れるので、比べるのは
      **中身の文字**にする。見たいのは「AI が返したものが残っているか」
      であって、改行の位置ではない。
    */
    const flat = (text: string) => text.replace(/\s+/g, "");
    /*
      1回目の結果は「変わったところを見る」の一枚の中にある。
      画面に縦積みすると比べる面が潰れるので移した
      （`components/course/steps/Compare.tsx`）。
    */
    const readFirst = async () => {
      await page.getByTestId("compare-more").click();
      const text = flat(await page.getByTestId("compare-first").innerText());
      // 開いた一枚は下から滑って出るので、×は動いている間クリックできない。
      // Esc なら位置に関係なく閉じられる
      await page.keyboard.press("Escape");
      await page.getByTestId("more-sheet").waitFor({ state: "detached" });
      return text;
    };

    const before = await readFirst();
    expect(before.length).toBeGreaterThan(0);

    await page.reload();
    await page.waitForTimeout(800);

    await expect.poll(readFirst).toBe(before);
  });
});
