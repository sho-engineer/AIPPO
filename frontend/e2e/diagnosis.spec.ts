/**
 * AI活用診断（5問）。
 *
 * 前は3問とも自己申告だった。**自分でどう思っているか**しか集まらない
 * ので、できると答えた人が本当にできるのかも、できないと答えた人が
 * 何でつまずくのかも分からない。いまはうしろの2問で手を動かす。
 *
 * ここで見るのは、部品ではなく**実際に通ったときの姿**。
 *
 *   1. 5問あること
 *   2. どの画面も、送らずに全部見えること
 *   3. 枠を埋める回は、全部埋めるまで進めないこと
 *   4. 押しても正解・不正解を出さないこと
 */

import { expect, test, type Page } from "@playwright/test";

import { dismissLessonIntro } from "./support/lessonIntro";
import { stubApi } from "./support/stubApi";

/** 影や余白の端数で数 px は動く。 */
const SLACK = 8;

async function openDiagnosis(page: Page) {
  await stubApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-diagnosis").first().click();
  await dismissLessonIntro(page);
  // 最初の1枚は説明
  await page.getByTestId("primary-action").click();
}

/**
 * いまの画面が、送らずに全部見えるか。
 *
 * **ページの高さだけでは足りない。** 中身の入れ物には
 * `overflow-y-auto` が掛かっていて（`StepShell` の逃げ道）、収まらない
 * ぶんはそこで送れるようになる。ページは伸びないので、外から見ると
 * 収まっているように見えてしまう——行の高さを 44 → 80px に増やして
 * 試したら、はみ出しているのに素通りした。
 *
 * だから2つ見る。ページが伸びていないことと、**入れ物の中でも
 * 送る先が無いこと**。
 */
async function expectFits(page: Page, where: string): Promise<void> {
  const page_over = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  expect(page_over, `「${where}」でページが ${page_over}px はみ出している`)
    .toBeLessThanOrEqual(SLACK);

  const stage_over = await page.evaluate(() => {
    const stage = document.querySelector("[data-testid='step-stage']");
    return stage ? stage.scrollHeight - stage.clientHeight : 0;
  });
  expect(stage_over, `「${where}」の中身が ${stage_over}px 送れる`)
    .toBeLessThanOrEqual(SLACK);
}

/** いま出ている画面で答えて、次へ。答え終わっていれば false。 */
async function answerOne(page: Page): Promise<boolean> {
  if (await page.getByTestId("completion-view").count()) return false;

  const parts = page.getByTestId("assemble-part");
  const count = await parts.count();
  if (count > 0) {
    for (let index = 0; index < count; index += 1) {
      const part = parts.nth(index);
      // もう選んである枠は触らない。**押すと取り消しになる**
      if (await part.locator("[aria-pressed='true']").count()) continue;
      await part.getByTestId("assemble-choice").first().click();
    }
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(700);
    return true;
  }

  const cards = page.locator("[aria-pressed]");
  if (await cards.count()) await cards.first().click();
  await page.waitForTimeout(900);
  const primary = page.getByTestId("primary-action");
  if (
    (await primary.count()) &&
    (await primary.getAttribute("aria-disabled")) !== "true"
  ) {
    await primary.click();
    await page.waitForTimeout(700);
  }
  return true;
}

test.setTimeout(120_000);

test.describe("AI活用診断", () => {
  test("5問ある", async ({ page }) => {
    /*
      **教材の並びを信じずに、実際に出たものを数える。**
      1〜2分で終わる長さに収めるための上限でもある。
    */
    await openDiagnosis(page);

    const asked: string[] = [];
    for (let guard = 0; guard < 12; guard += 1) {
      if (await page.getByTestId("completion-view").count()) break;
      asked.push((await page.locator("main h1").first().innerText()).trim());
      if (!(await answerOne(page))) break;
    }

    expect(asked).toEqual([
      "AIをどれくらい使っていますか？",
      "AIにお願いするとき、どれに近い？",
      "この場面なら、どう頼む？",
      "こんなとき、AIに何を頼む？",
      "AIで何をできるようになりたい？",
    ]);
  });

  test("どの画面も、送らずに全部見える", async ({ page }) => {
    /*
      ミニ問題は枠が3つあり、それぞれ札が2行に折り返す。札の高さを
      44px にしていたころ、Pixel 5（393×727）で**最後の枠が画面から
      出ていた**。1行あたり数 px の差が、枠3つぶんで効く。
    */
    await openDiagnosis(page);

    for (let guard = 0; guard < 12; guard += 1) {
      if (await page.getByTestId("completion-view").count()) break;

      const where = (await page.locator("main h1").first().innerText()).trim();
      const over = await page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight,
      );
      expect(over, `「${where}」が ${over}px はみ出している`).toBeLessThanOrEqual(
        SLACK,
      );

      if (!(await answerOne(page))) break;
    }
  });

  test("枠を埋める回は、ぜんぶ埋めるまで進めない", async ({ page }) => {
    /*
      1つでも空のまま送れると、採点する側は「選ばなかった」のか
      「まだ途中」なのかを区別できない。
    */
    await openDiagnosis(page);
    // 自己申告の2問を通り抜ける
    await answerOne(page);
    await answerOne(page);

    const parts = page.getByTestId("assemble-part");
    await expect(parts).toHaveCount(3);

    const primary = page.getByTestId("primary-action");
    await expect(primary).toHaveAttribute("aria-disabled", "true");

    await parts.nth(0).getByTestId("assemble-choice").first().click();
    await parts.nth(1).getByTestId("assemble-choice").first().click();
    // まだ3つ目が空
    await expect(primary).toHaveAttribute("aria-disabled", "true");

    await parts.nth(2).getByTestId("assemble-choice").first().click();
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
  });

  test("押しても、正解・不正解を出さない", async ({ page }) => {
    /*
      その場で採点すると、診断はテストになる。「間違えた」で終わる人が
      出るし、次の問題の答え方も変わってしまう。
    */
    await openDiagnosis(page);
    await answerOne(page);
    await answerOne(page);

    const parts = page.getByTestId("assemble-part");
    // わざと場面に合わない答えを選ぶ
    await parts.nth(2).getByTestId("assemble-choice").last().click();
    await page.waitForTimeout(400);

    const shown = (await page.locator("main").innerText()).replace(/\s/g, "");
    for (const banned of ["正解", "不正解", "おしい", "残念", "まちがい"]) {
      expect(shown, `「${banned}」が出ている`).not.toContain(banned);
    }
  });

  test("結果は、次の1つを決めるだけの画面にする", async ({ page }) => {
    /*
      前はここにおすすめが3本並んでいた。選べるように見えて、
      「次に何をするか」をもう一度選ばせているだけだった。
    */
    await openDiagnosis(page);
    for (let guard = 0; guard < 8; guard += 1) {
      if (!(await answerOne(page))) break;
    }

    await expect(page.getByTestId("diagnosis-stage")).toBeVisible();
    await expect(
      page.getByTestId("diagnosis-strengths").getByRole("listitem"),
    ).toHaveCount(2);
    await expect(page.getByTestId("diagnosis-next-skill")).toBeVisible();
    // おすすめは1本だけ
    await expect(page.getByTestId("diagnosis-lesson")).toHaveCount(1);
    await expect(page.getByTestId("completion-view")).not.toContainText("おすすめ2");

    // 押す先は2つ。おすすめから始める／Day1から確かめる
    await expect(page.getByTestId("primary-action")).toHaveText(
      /おすすめLessonから始める/,
    );
    await expect(
      page.getByRole("button", { name: "Day1から確認する" }),
    ).toBeVisible();
  });

  test("長い話は「理由を見る」の中だけ", async ({ page }) => {
    /*
      通常の画面に長文を置くと、読む画面になって次の一歩が遠くなる。
      開いた一枚の中だけは送ってよい。
    */
    await openDiagnosis(page);
    for (let guard = 0; guard < 8; guard += 1) {
      if (!(await answerOne(page))) break;
    }

    await expect(page.getByTestId("completion-view")).not.toContainText(
      "いまの4つの力",
    );

    await page.getByTestId("diagnosis-reason-open").click();

    const sheet = page.getByTestId("diagnosis-reason-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-placement", "center");
    await expect(sheet).toContainText("いまの4つの力");
    await expect(sheet).toContainText("どの回答から判断したか");

    // Esc で閉じられる
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  });

  for (const [name, width, height] of [
    ["iPhone 14", 390, 844],
    ["iPhone Pro Max", 430, 932],
    /*
      いちばん低い持ち方（Safari の上下の帯が両方出ている状態）。

      上の2つだけでは**見張りとして働かない**。844px あると、行の
      高さを 44 → 80px に増やしても収まってしまい、太らせたことに
      気づけない（実際に試した）。ここが本当の締め切りになる。
    */
    ["Safari の帯あり", 402, 660],
  ] as const) {
    test(`${name} で、診断のどの画面も送らずに見える`, async ({ page }) => {
      /*
        `overflow: hidden` で切って収めない。**中身を減らしてから**
        収める——切ると、見えなくなった要素に気づけない。

        ここで見るのはページそのものの縦。開いた一枚（理由を見る）の
        中だけは送ってよいので、そこは通らない。
      */
      await page.setViewportSize({ width, height });
      await openDiagnosis(page);

      for (let guard = 0; guard < 9; guard += 1) {
        const where = (await page.locator("main h1").first().innerText()).trim();
        await expectFits(page, where);
        if (!(await answerOne(page))) break;
      }
      await expectFits(page, "結果画面");
    });
  }
});
