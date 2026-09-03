/**
 * 主導線だけで終われる（Day1）。
 *
 * 前は19画面あって、**全部通らないと終われなかった**。7〜9分。
 * 仕事終わりに開ける長さではない。そこで、途中に分かれ道
 * （「自分の文章でも試す？」）を置き、そこで一度終われるようにした。
 *
 * 分かれ道の場所を、後ろへ動かした
 * --------------------------------
 * 前は「技を深める回」の**手前**にあった。そのため、そこで降りた人は
 * その日の技を1つしか受け取れない——Day1 でいえば、教材が
 * 「今日おぼえるのは誰向けかと言い方」と言っているのに、
 * **トーン指定を一度も見ないまま終わっていた**。
 *
 * いまは Day1 の3つ（プロンプト・ターゲット指定・トーン指定）を
 * 渡し終えてから分かれる。**そのぶん、降りられるのは遅くなった**
 * ——9画面ではなく17画面ほど。習うことと、自分の文章で使うことは
 * 別なので、そこを分ける場所にした。
 *
 * 降りた人が失うのは「自分の文章で試す」だけ。
 *
 * 見張るのは3つ。
 *
 *   1. 主導線だけで完了画面まで行けること
 *   2. **やり切った人が「途中」に見えないこと**（帯が最後まで行く）
 *   3. 自分の文章の回が**消えていない**こと（続けた人には出る）
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

/** 「自分の文章でも試す？」まで、主導線を進める。 */
async function toBranch(page: Page): Promise<number> {
  await openRewrite(page);
  let screens = 1;
  for (let i = 0; i < 30; i++) {
    if (
      await page
        .getByRole("heading", { name: "自分の文章でも試す？" })
        .isVisible()
        .catch(() => false)
    ) {
      return screens;
    }
    if (!(await advance(page))) break;
    screens += 1;
    await page.waitForTimeout(150);
  }
  throw new Error(`分かれ道まで届かなかった（${screens}画面）`);
}

test.describe("主導線だけで終われる", () => {
  test("最後まで通らなくても、途中で終われる", async ({ page }) => {
    /*
      前は分かれ道が無く、23画面を通り切るしかなかった。

      数で縛らない。**分かれ道がどこにあるかは教材の作り方の話**で、
      Day1 は3つの技を渡し終えてから分かれると決めた（章扉③まで
      通ってから）。ここで「9画面以内」と釘を刺すと、技を1つ削るか、
      分かれ道を前へ戻すかしか道が無くなる。

      守りたいのは「**通り切らなくても終われる**」ことのほう。
      それは下の「次のレッスンへ」の検査が見ている。ここでは、
      分かれ道が最後まで行く前にあることだけを見る。
    */
    await stubApi(page);

    const screens = await toBranch(page);
    const total = Number(
      await page.getByTestId("lesson-progress").first().getAttribute("aria-valuemax"),
    );

    expect(screens).toBeLessThan(total);
  });

  test("「次のレッスンへ」で、そのまま完了できる", async ({ page }) => {
    await stubApi(page);
    await toBranch(page);

    await page.getByRole("button", { name: "次のレッスンへ" }).click();

    await expect(page.getByTestId("completion-view")).toBeVisible();
  });

  test("**やり切った人が「途中」に見えない**", async ({ page }) => {
    /*
      任意の回を分母に入れていると、分かれ道まで来た人が
      「17 / 23」で終わる。最後まで来たのに途中でやめたように見える。
    */
    await stubApi(page);
    await toBranch(page);

    /*
      見るのは**分かれ道にいるとき**。完了画面で見ても分からない
      ——`completion` は並びの最後なので、任意の回を分母に入れていても
      「19 / 19」で釣り合ってしまう（最初そこを見ていて、壊しても
      落ちなかった）。

      分母に効いているかは、まだ主導線にいるあいだにしか見えない。

      `aria-valuetext` も見ない。あちらは区切りの名前を持っていて、
      歩数の数え方では変わらない。
    */
    const bar = page.getByTestId("lesson-progress").first();
    const current = Number(await bar.getAttribute("aria-valuenow"));
    const total = Number(await bar.getAttribute("aria-valuemax"));

    // 主導線は17画面ほど。23（任意の回を含む数）になっていないこと
    expect(total).toBeLessThan(20);
    expect(total - current).toBeLessThanOrEqual(1);
  });

  test("自分の文章の回は消えていない（続けた人には出る）", async ({ page }) => {
    /*
      分かれ道の先が、行き止まりになっていないこと。「自分の文章で
      試す」を選んだ人には、これまでどおり入力欄が出る。

      技の回（相手・トーン）は分かれ道の**手前**へ移したので、
      ここではもう出ない——降りた人も受け取れるようにするための
      並べ替えで、消したのではない。
    */
    await stubApi(page);
    await toBranch(page);

    await page.getByTestId("primary-action").first().click();

    await expect(page.getByRole("heading", { name: "自分の文章" })).toBeVisible();
  });
});
