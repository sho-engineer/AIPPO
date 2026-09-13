/**
 * 診断を、iPhone 相当の4つの持ち方で通す。
 *
 * なぜ4つ要るか
 * -------------
 * 通しの検査（`e2e/stepFits.spec.ts`）が見ているのは Pixel 5（393×727）と
 * いちばん低い 402×660 の2つで、**幅 375 と 430 が誰にも見られていなかった**。
 * 幅は左右の余白と図の入る場所を決めるので、縦だけ見ても足りない。
 *
 *     375×667   いちばん小さい（iPhone SE）。ここで図が潰れやすい
 *     390×844   iPhone 12〜14
 *     393×852   iPhone 14 Pro / 15
 *     430×932   いちばん大きい（Pro Max）。ここは図が余りやすい
 *
 * 左端に何か貼り付いていないか
 * ----------------------------
 * 実機（iPhone Safari）で「濃い灰色の縦長ハンドルが左端に貼り付いて、
 * 見出しの1文字目を覆っている」という報告があった。調べたところ
 * **AIPPO はそこに何も描いていない**（下の `fixed` が全画面で0）。
 * 外から挿し込まれたものだと分かったが、こちらが後から生やさないよう
 * ここで押さえておく——本文を覆う貼り付きが増えたら、ここで止まる。
 */

import { expect, test, type Page } from "@playwright/test";

import { dismissLessonIntro } from "./support/lessonIntro";
import { stubApi } from "./support/stubApi";

/** 画面の左右に取る余白。`StepShell` の `px-5`。 */
const GUTTER = 20;

const SIZES = [
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "393x852", width: 393, height: 852 },
  { name: "430x932", width: 430, height: 932 },
];

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
    await page.waitForTimeout(400);
    return true;
  }

  const cards = page.locator("[aria-pressed]");
  if (await cards.count()) await cards.first().click();
  await page.waitForTimeout(400);
  const primary = page.getByTestId("primary-action");
  if (
    (await primary.count()) &&
    (await primary.getAttribute("aria-disabled")) !== "true"
  ) {
    await primary.click();
    await page.waitForTimeout(400);
  }
  return true;
}

/** その画面の、横方向と重なりだけを見る。 */
async function measure(page: Page) {
  return page.evaluate(() => {
    const view = window.innerWidth;
    const h1 = document.querySelector("h1");
    const stage = document.querySelector("[data-testid='step-stage']");

    const fixed = [...document.querySelectorAll<HTMLElement>("*")]
      .filter((node) => {
        const box = node.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return false;
        return getComputedStyle(node).position === "fixed";
      })
      .map((node) => node.dataset.testid ?? node.tagName);

    return {
      view,
      docWidth: document.documentElement.scrollWidth,
      headingLeft: h1 ? Math.round(h1.getBoundingClientRect().left) : null,
      fixed,
      /* 入れ物の中でも送れないこと。ページの高さだけでは足りない */
      stageScroll: stage ? stage.scrollHeight - stage.clientHeight : 0,
    };
  });
}

test.setTimeout(120_000);

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test(`診断を最後まで通せる（${size.name}）`, async ({ page }, info) => {
      test.skip(info.project.name !== "mobile", "スマホの見え方だけ見る");
      await openDiagnosis(page);

      const screens: string[] = ["開始画面"];
      const seen = [await measure(page)];
      await page.getByTestId("primary-action").click();

      for (let guard = 0; guard < 8; guard += 1) {
        if (await page.getByTestId("completion-view").count()) break;
        screens.push(await page.locator("main h1").first().innerText());
        seen.push(await measure(page));
        if (!(await answerOne(page))) break;
      }

      /*
        質問5のあとは、**結果がそのまま出る。**
        「回答を分析しています」を挟まない（`course/diagnosisFlow.ts`）。
      */
      await expect(page.getByTestId("diagnosis-analyzing")).toHaveCount(0);
      await expect(page.locator("main h1").first()).toHaveText("あなたの現在地");

      /*
        結果の画面を、おすすめまで押していく。**何画面あるかは
        書かない**——1つ足した日に、ここだけ古い数で止まる。
      */
      const results: string[] = [];
      for (let guard = 0; guard < 6; guard += 1) {
        seen.push(await measure(page));
        results.push(await page.locator("main h1").first().innerText());
        if (results[results.length - 1].includes("おすすめ")) break;
        await page.getByTestId("primary-action").click();
        await page.waitForTimeout(400);
      }
      expect(results[results.length - 1]).toBe("今のあなたにおすすめ");
      expect(results, "結果の画面が並んでいない").toContain("4つの力のバランス");

      // 5問ぶん + 開始
      expect(screens.length, `画面が ${screens.length} 枚`).toBe(6);

      for (const [at, one] of seen.entries()) {
        const where = `${size.name} の ${at + 1}枚目`;

        // 横に伸びない
        expect(one.docWidth, `${where}: 横に送れる`).toBeLessThanOrEqual(one.view);
        // 中身も、入れ物の中で送れない
        expect(one.stageScroll, `${where}: 中身が送れる`).toBeLessThanOrEqual(8);
        // 見出しの1文字目が、余白のとおりの位置に出ている
        expect(one.headingLeft, `${where}: 見出しの左端`).toBe(GUTTER);
        // 画面に貼り付いたものを置かない（本文を覆う元になる）
        expect(one.fixed, `${where}: 貼り付いた要素`).toEqual([]);
      }
    });

    test(`ひし形が、読める大きさで出る（${size.name}）`, async ({ page }, info) => {
      test.skip(info.project.name !== "mobile", "スマホの見え方だけ見る");
      await openDiagnosis(page);
      await page.getByTestId("primary-action").click();
      for (let guard = 0; guard < 8; guard += 1) {
        if (!(await answerOne(page))) break;
      }
      for (let guard = 0; guard < 6; guard += 1) {
        if (
          (await page.locator("main h1").first().innerText()) === "4つの力のバランス"
        ) {
          break;
        }
        await page.getByTestId("primary-action").click();
        await page.waitForTimeout(400);
      }
      await expect(page.locator("main h1").first()).toHaveText("4つの力のバランス");

      const chart = page.getByTestId("radar-chart");
      await expect(chart).toBeVisible();

      const shape = await page.evaluate(() => {
        const node = document.querySelector("[data-testid='radar-chart']")!;
        const card = document.querySelector("[data-testid='step-stage']")!;
        const box = node.getBoundingClientRect();
        const cardBox = card.getBoundingClientRect();
        const labels = [...node.querySelectorAll("span[aria-hidden]")]
          .map((one) => one.getBoundingClientRect())
          .filter((one) => one.width > 0);
        return {
          height: Math.round(box.height),
          outside: labels.filter(
            (one) => one.left < cardBox.left || one.right > cardBox.right,
          ).length,
        };
      });

      /*
        小さすぎない。頂点が寄ると「どこが薄いか」が読めなくなり、
        場所を取るぶん無いほうがましな図になる。
      */
      expect(shape.height, `${size.name}: ひし形が ${shape.height}px`).toBeGreaterThanOrEqual(130);
      // 軸の名前は左右へはみ出す置き方をしている。カードの外まで出ないこと
      expect(shape.outside, `${size.name}: 軸の名前がカードの外`).toBe(0);
      // 横棒は置かない。同じ4つの値を2通りで同時に見せない
      await expect(page.getByTestId("axis-bars")).toHaveCount(0);
    });
  });
}
