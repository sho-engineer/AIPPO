/**
 * 押す先を1つだけ追って、Day1 を終えられる。
 *
 * 前はここに「分かれ道」があった
 * ------------------------------
 * 19画面を通り切らないと終われなかった時期があり、途中に
 * 「自分の文章でも試す？」を置いて、そこで一度降りられるようにして
 * いた。**その分かれ道は、いまは無い。**
 *
 * Day1 を4つの段に組み直したとき、4段目そのものを「自分の仕事で使う」
 * にした（`course/catalog.ts`）。降りる先だった回が、いまは最後の段の
 * 本体になっている——降りる道を消したのではなく、**降りた先が本編に
 * なった**ので、分かれる場所が無くなった。
 *
 * だからここで見るものも変わる。
 *
 *   1. 押す先を1つだけ追って、完了画面まで行けること
 *      （選ばせる回では、どれを選んでも詰まらない）
 *   2. やり切った人が「途中」に見えないこと——帯の分母に、
 *      **通らない回を混ぜていない**こと
 *   3. 自分の文章の回が、主導線の中にあること
 *
 * 2 は、任意の回を作った日に効く見張り。分母にだけ足して分子に足さない
 * 数え方をすると、最後まで来た人が「17 / 23」で終わる。
 */

import { expect, test, type Page, type Locator } from "@playwright/test";

import { stubApi } from "./support/stubApi";
import { dismissLessonIntro } from "./support/lessonIntro";

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
            /レッスン一覧へ|もどる|くわしく|変わったところ|記録|全文|送っています|飛ばす|スキップ|あとにする|次のレッスンへ/,
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

/** いま出ている画面の、帯の数え方。帯が無い画面では null。 */
async function bar(page: Page): Promise<{ current: number; total: number } | null> {
  const band = page.getByTestId("lesson-progress").first();
  if (!(await band.count())) return null;
  const current = Number(await band.getAttribute("aria-valuenow"));
  const total = Number(await band.getAttribute("aria-valuemax"));
  return Number.isFinite(current) && Number.isFinite(total) ? { current, total } : null;
}

interface Walk {
  /** 通った画面の見出し（章扉も含む）。 */
  headings: string[];
  /** 完了画面の直前に出ていた帯。 */
  lastBar: { current: number; total: number } | null;
}

/**
 * 押す先を1つだけ追って、完了画面まで歩く。
 *
 * 数は決め打ちにしない。**何画面あるかは教材の作り方の話**で、
 * ここで上限を書くと、回を1つ足すたびに検査を直すことになる。
 */
async function walkToCompletion(page: Page): Promise<Walk> {
  await openRewrite(page);

  const headings: string[] = [];
  let lastBar: Walk["lastBar"] = null;

  for (let guard = 0; guard < 40; guard += 1) {
    if (await page.getByTestId("completion-view").isVisible().catch(() => false)) {
      return { headings, lastBar };
    }

    const heading = await page
      .locator("h1")
      .first()
      .innerText()
      .catch(() => "");
    if (heading) headings.push(heading.replace(/\s+/g, ""));
    lastBar = (await bar(page)) ?? lastBar;

    if (!(await advance(page))) break;
    await page.waitForTimeout(150);
  }

  throw new Error(`完了まで届かなかった（${headings.length}画面）\n${headings.join(" / ")}`);
}

test.describe("押す先を1つだけ追って終われる", () => {
  test("選ばせる回で詰まらずに、完了画面まで行ける", async ({ page }) => {
    await stubApi(page);
    const { headings } = await walkToCompletion(page);

    await expect(page.getByTestId("completion-view")).toBeVisible();
    // 1画面だけ見て終わっていない（歩けていないのに通るのを防ぐ）
    expect(headings.length).toBeGreaterThan(5);
  });

  test("やり切った人が「途中」に見えない", async ({ page }) => {
    /*
      見るのは**完了画面の直前**。完了画面で見ても分からない
      ——`completion` は並びの最後なので、通らない回を分母に入れていても
      「19 / 19」で釣り合ってしまう（前にそこを見ていて、壊しても
      落ちなかった）。

      分母に効いているかは、まだ本編にいるあいだにしか見えない。
    */
    await stubApi(page);
    const { lastBar } = await walkToCompletion(page);

    expect(lastBar, "帯が1画面も出ていない").not.toBeNull();
    expect(
      lastBar!.total - lastBar!.current,
      `最後の画面で「${lastBar!.current} / ${lastBar!.total}」——分母に、通らない回が混じっている`,
    ).toBeLessThanOrEqual(1);
  });

  test("自分の文章の回は、主導線の中にある", async ({ page }) => {
    /*
      前はここが分かれ道の先にあり、降りた人には出なかった。いまは
      4段目そのもの——**押す先を1つだけ追った人にも必ず出る**。
    */
    await stubApi(page);
    const { headings } = await walkToCompletion(page);

    expect(headings.some((one) => one.includes("自分の文章"))).toBe(true);
  });
});
