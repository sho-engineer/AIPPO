/**
 * 診断の「なおす」で、実際に答えを直せること。
 *
 * 何が起きていたか
 * ----------------
 * サマリーの「なおす」は、その質問へ戻すだけだった。戻った先には
 * 前の答えが残っているので、自動送り（選んだら次へ）が「もう答えて
 * ある」と判断して 500ms で次へ送ってしまう。押した人から見ると
 * **何も起きない**。3問とも素通りして、結果画面へ戻されていた。
 *
 * いまの診断は、**一度も自動で進めない**（`course/autoAdvance.ts`）。
 * 選ぶのと送るのは別の操作で、選んだ札を見て「これでよい」と
 * 確かめてから「次へ」を押す。だからこのファイルで見るのは
 * 「戻ったあとも、その決まりが変わらないこと」になる。
 *
 * なぜ E2E なのか
 * ---------------
 * 起きていたのは「押してから500ms後」の出来事で、時計と画面の
 * 組み合わせでしか現れない。jsdom でも書けなくはないが、
 * 実際に踏んだのは本物のブラウザなので、同じ場所で見張る。
 *
 * 見るのは5つ。
 *
 *   1. 戻れる
 *   2. **戻っただけでは進まない**
 *   3. いまの答えが選ばれた状態で見える
 *   4. **別の答えを選んでも、その場に留まる**（押したときだけ進む）
 *   5. まとめとおすすめが、新しい答えで作り直される
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";
import { dismissLessonIntro } from "./support/lessonIntro";

/** 診断を最後まで答えて、結果画面まで行く。 */
async function answerAll(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).first().click();
  // コースは3段（一覧 → 中身 → レッスン）。レッスンが並ぶのは2段目
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-diagnosis").first().click();
  await dismissLessonIntro(page);

  // 最初の1枚は説明。そこから5問
  await page.getByTestId("primary-action").click();
  await answerRemaining(page);
  /*
    5問目のあとは、整理中の1枚（1〜1.5秒）を挟んでから現在地が出る。
    **押すものは無い**ので、待つのではなく移り終わるのを見る。
    秒数で書かない——長さを変えた日に、ここだけ古い数で落ちる。
  */
  await expect(page.getByTestId("completion-view")).toBeVisible({ timeout: 4000 });
  await expect(page.locator("main h1").first()).toHaveText("あなたの現在地", {
    timeout: 8000,
  });
}

/**
 * いま出ている質問から、結果画面まで答え切る。
 *
 * 画面の種類を決め打ちにしない。診断は5問あって答え方が3通りある
 * （ひとつ選ぶ / 枠を埋める / いくつでも選ぶ）ので、**出ているものを
 * 見て決める**——並びや型が変わっても、ここは直さずに済む。
 */
async function answerRemaining(page: Page): Promise<void> {
  for (let guard = 0; guard < 12; guard += 1) {
    /*
      ここは `return` のまま。抜けたあとに `throw` が待っているので、
      `break` にすると**答え切ったのに失敗**する。整理中を過ぎるまでの
      待ちは、呼んだ側が持つ（`toDiagnosisResult` / `summaryLines`）。
    */
    if (await page.getByTestId("completion-view").count()) return;

    const parts = page.getByTestId("assemble-part");
    const count = await parts.count();
    if (count > 0) {
      for (let index = 0; index < count; index += 1) {
        const part = parts.nth(index);
        /*
          もう選んである枠は触らない。**押すと取り消しになる。**

          「なおす」で戻ったあとは、あとの回の答えがそのまま残って
          いる。そこで一律に1つ目を押すと、選んであった枠が空になり、
          下のボタンが押せないまま止まる（実際そうして時間切れになった）。
        */
        if (await part.locator("[aria-pressed='true']").count()) continue;
        await part.getByTestId("assemble-choice").first().click();
      }
      const next = page.getByTestId("primary-action");
      if (await next.count()) {
        await next.click();
        await page.waitForTimeout(700);
      }
      continue;
    }

    const cards = page.locator("[aria-pressed]");
    if (await cards.count()) await cards.first().click();
    // 診断は、どの回も選んだだけでは進まない。必ず自分で押す
    const primary = page.getByTestId("primary-action");
    if (
      (await primary.count()) &&
      (await primary.getAttribute("aria-disabled")) !== "true"
    ) {
      await primary.click();
      await page.waitForTimeout(700);
    }
  }
  throw new Error("診断から抜けられない");
}

/**
 * 答えの行を読む。
 *
 * 置き場が3度変わった。
 *
 *   1. 結果画面のいちばん上の折りたたみ（「ここまでに答えた内容」）
 *      → 結果を見に来た人の最初に、自分の答えが目に入っていた
 *   2. 一枚の、さらに奥（「いまの様子」→「答えと理由」）
 *      → 手前の一枚が、結果の画面と同じことを言っていた
 *   3. 一枚1つだけ（「この結果になった理由」）
 *      → 判断は画面・根拠は一枚、と離れていた。しかもどの画面からも
 *        開けるので、**同じものが何度も載って**いた
 *
 * いまは結果の2画面目（「回答から見えた特徴」）そのもの。判断の行の
 * すぐ下に、その元になった答えと「なおす」が並ぶ（`DiagnosisResult`）。
 */
async function summaryLines(page: Page): Promise<string[]> {
  /*
    判断とその根拠は、**現在地の画面**に一緒に並ぶ。前は別の画面
    （「回答から見えた特徴」）に分かれていたので、そこまで押して
    いく必要があった。いまは整理中の1枚を過ぎれば、もうそこに居る。
  */
  await expect(page.locator("main h1").first()).toHaveText("あなたの現在地", {
    timeout: 8000,
  });
  const traits = page.getByTestId("diagnosis-traits");
  await expect(traits).toBeVisible();
  const lines = await page.getByTestId("diagnosis-trait-from").allInnerTexts();
  return lines.map((line) => line.replace(/\s*なおす\s*/g, "").trim());
}

test.describe("診断の「なおす」", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("戻っただけでは、勝手に次へ行かない", async ({ page }) => {
    /*
      ここが直したところ。自動送りは 500ms なので、
      それより十分に長く待って、同じ質問のままであることを見る。
    */
    await answerAll(page);
    await summaryLines(page);

    const first = page.getByRole("button", { name: "なおす" }).first();
    await first.click();

    const question = await page.locator("h1").first().innerText();
    await page.waitForTimeout(1500);

    await expect(page.locator("h1").first()).toHaveText(question);
  });

  test("いまの答えが、選ばれた状態で見える", async ({ page }) => {
    // 何を選んでいたか分からないまま選び直させない
    await answerAll(page);
    await summaryLines(page);
    await page.getByRole("button", { name: "なおす" }).first().click();
    await page.waitForTimeout(800);

    await expect(page.locator("[aria-pressed='true']")).toHaveCount(1);
  });

  test("別の答えを選んでも、その場に留まる", async ({ page }) => {
    /*
      直したその瞬間に画面が変わると、**直した結果を見られない。**

      前はここだけ自動で送っていた。「戻った直後は止める、選び直したら
      進む」という細かい使い分けで、押した人からは同じ操作なのに
      あるときは動きあるときは動かない、に見えていた。診断は
      どの回も同じ——選ぶ、確かめる、押す。
    */
    await answerAll(page);
    await summaryLines(page);
    await page.getByRole("button", { name: "なおす" }).first().click();
    await page.waitForTimeout(800);

    const question = await page.locator("h1").first().innerText();
    await page.locator("[aria-pressed='false']").first().click();
    // 自動送りは 500ms だった。それより十分に長く待つ
    await page.waitForTimeout(1500);

    await expect(page.locator("h1").first()).toHaveText(question);
    // 選んだことは効いている。押せる状態になっているはず
    await expect(page.getByTestId("primary-action")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("直した答えが、まとめに出る", async ({ page }) => {
    await answerAll(page);
    const before = await summaryLines(page);

    await page.getByRole("button", { name: "なおす" }).first().click();
    await page.waitForTimeout(800);
    const picked = await page
      .locator("[aria-pressed='false']")
      .first()
      .innerText();

    await page.locator("[aria-pressed='false']").first().click();
    // 直したら、自分で「次へ」。ここから残りを通って結果へ戻る
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(700);
    await answerRemaining(page);

    const after = await summaryLines(page);
    expect(after.join("\n")).toContain(picked.split("\n")[0].trim());
    expect(after).not.toEqual(before);
  });

  test("まとめに、教材の中の記号を出さない", async ({ page }) => {
    /*
      答えは `tried` `first_time` のような記号で持っている。
      そのまま出すと日本語の画面に英語が並び、別の質問の
      同じ記号どうしが同じ答えに見える。
    */
    await answerAll(page);

    for (const line of await summaryLines(page)) {
      const answer = line.split("：").at(-1)?.trim() ?? "";
      expect(answer, `記号のまま出ている: ${line}`).not.toMatch(/^[a-z_]+$/);
    }
  });
});
