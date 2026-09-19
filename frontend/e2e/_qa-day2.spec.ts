/**
 * 実ブラウザQA用。**検査ではなく、目で見るための写し。**
 *
 * Day2 を最初から Home 復帰まで通し、画面ごとに写しを取る。
 * DOM だけを見て「QA済み」とは言わないための道具で、CI では回さない
 * （ファイル名の頭に `_` を付けてあり、`playwright.config` の
 * `testIgnore` で外れる）。
 */

import { test, type Page } from "@playwright/test";

import { openLessonById } from "./support/openLesson";
import { stubApi } from "./support/stubApi";

const BASIC =
  "社内調査では、情報検索の難しさや複数ツールへの重複入力が課題として挙がりました。" +
  "新しい情報共有ツールには多くの社員が前向きですが、操作やデータ移行への不安もあります。" +
  "まず営業部で1か月試験導入し、効果を確認する案が検討されています。";

const THREE = [
  "・情報を探す時間と、複数ツールへの重複入力が課題",
  "・新ツールには前向きな意見が多いが、操作や移行への不安もある",
  "・営業部20名で1か月試し、検索時間と利用率を確認する予定",
].join("\n");

const MANAGER = [
  "・68％が情報検索に時間がかかると回答し、54％が複数ツールへの重複入力を経験",
  "・新ツールの導入には62％が前向きだが、操作習得とデータ移行への不安がある",
  "・営業部20名で1か月試験導入し、検索時間と利用率を基に全社展開を判断する案",
].join("\n");

const OWN = [
  "・営業部は資料の共有方法を変えたいと考えている",
  "・管理部は開催時間の短縮を求めている",
  "・次回までに方針を決める必要がある",
].join("\n");

const MY_TEXT =
  "来月の全社会議について、各部門から出た意見をまとめました。" +
  "営業部は資料の共有方法を変えたいと述べ、管理部は開催時間の短縮を求めています。" +
  "企画部からは事前アンケートの実施案が出ました。次回までに方針を決める必要があります。";

async function walk(page: Page, tag: string, own: boolean) {
  await stubApi(page, {
    result: (call) =>
      call === 1 ? BASIC : call === 2 ? THREE : call === 3 ? MANAGER : OWN,
  });
  await openLessonById(page, "summarize_text");

  for (let index = 0; index < 30; index += 1) {
    const title = (await page.locator("main h1").first().innerText().catch(() => ""))
      .replace(/\s+/g, "")
      .slice(0, 18);
    await page.screenshot({
      path: `qa/day2-${tag}-${String(index).padStart(2, "0")}-${title}.png`,
    });

    if (((await page.getByTestId("completion-view").count()) ||
      (await page.getByTestId("diagnosis-analyzing").count()))) break;
    const primary = page.getByTestId("primary-action").first();
    if (!(await primary.count())) break;

    if ((await primary.getAttribute("aria-disabled")) === "true") {
      const box = page.locator("textarea:visible").first();
      if (await box.count()) {
        if (own) await box.fill(MY_TEXT);
        else await page.getByRole("button", { name: "例文を使う" }).click();
      } else {
        await page.locator("main [aria-pressed]").first().click();
      }
      await page.waitForTimeout(250);
    }
    await primary.click({ force: true });
    await page.waitForTimeout(500);
  }

  // 完了 → 今日ここまで → Home
  await page.getByTestId("primary-action").first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `qa/day2-${tag}-90-dayComplete.png` });
  await page.getByTestId("day-complete-back").click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `qa/day2-${tag}-91-afterBack.png` });
}

test.describe("Day2 実ブラウザQA", () => {
  test.setTimeout(240_000);

  test("例文の道（390×844）", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await walk(page, "sample-390", false);
  });

  test("自分の文章の道（390×844）", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await walk(page, "own-390", true);
  });

  test("いちばん小さい端末（320×568）", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await walk(page, "sample-320", false);
  });
});
