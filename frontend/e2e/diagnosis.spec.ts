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
import { serveOpenCatalog } from "./support/openLessons";

/** 影や余白の端数で数 px は動く。 */
const SLACK = 8;

/**
 * 診断を開く。
 *
 * `allOpen` は「ほかの候補」を見る回だけ。第1リリースで開いているのは
 * 診断と Day1 だけなので、**ほかの候補になれる教材が1本もない**
 * ——候補の一枚そのものが出ない。公開範囲の話は
 * `e2e/releaseGate.spec.ts` が別に見るので、ここでは検査のあいだだけ開ける。
 */
async function openDiagnosis(page: Page, options: { allOpen?: boolean } = {}) {
  await stubApi(page);
  /*
    `stubApi` のあと、画面を開く前。あとから登録した経路が先に当たり、
    教材は起動時に1回しか聞かない（`support/openLessons.ts`）。
  */
  if (options.allOpen) await serveOpenCatalog(page);
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

/**
 * 5問に答えて、**結果の1画面目（現在地）**まで行く。
 *
 * 途中に待ち画面は無い。5問目を押したら、そのまま現在地が出る。
 */
async function toResult(
  page: Page,
  options: { allOpen?: boolean } = {},
): Promise<void> {
  await openDiagnosis(page, options);
  for (let guard = 0; guard < 8; guard += 1) {
    if (!(await answerOne(page))) break;
  }
  await expect(page.getByTestId("completion-view")).toBeVisible({ timeout: 6000 });
  await expect(page.locator("main h1").first()).toHaveText("5つの答えを読み取りました");
}

/** 結果の最後（おすすめ）まで行く。 */
async function toRecommendation(
  page: Page,
  options: { allOpen?: boolean } = {},
): Promise<void> {
  await toResult(page, options);
  /*
    何画面あるかを、ここに数で書かない。**おすすめが出るまで押す。**
    結果の画面を1つ足した日に、ここだけ古い数で止まる。
  */
  for (let guard = 0; guard < 6; guard += 1) {
    if (
      (await page.locator("main h1").first().innerText()).includes("おすすめ")
    ) {
      break;
    }
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(500);
  }
  await expect(page.locator("main h1").first()).toHaveText("今のあなたにおすすめ");
}

/** 結果の「4つの力」まで行く。何画面あるかは、ここに数で書かない。 */
async function toAxes(page: Page): Promise<void> {
  for (let guard = 0; guard < 6; guard += 1) {
    if ((await page.locator("main h1").first().innerText()) === "4つの力のバランス") {
      return;
    }
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(400);
  }
  await expect(page.locator("main h1").first()).toHaveText("4つの力のバランス");
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

  test("結果は、5画面に分かれて出る", async ({ page }) => {
    /*
      前は1画面だった。図・できていること・次の一歩・おすすめが同時に
      並び、下のボタンは最初から「ここから始める」。**読む前に次へ行く
      道が目に入る**ので、結果は読まれずに押されていた。
    */
    await toResult(page);

    // ①読み取り。答えから出した4つの段を、そのまま出す
    await expect(page.locator("main h1").first()).toHaveText(
      "5つの答えを読み取りました",
    );
    await expect(page.getByTestId("axis-bars")).toBeVisible();
    await expect(page.getByTestId("axis-bar")).toHaveCount(4);
    // やっていないことは書かない
    await expect(page.getByTestId("completion-view")).not.toContainText("分析");

    // ②現在地。ここではまだ Lesson の話をしない
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(500);
    await expect(page.locator("main h1").first()).toHaveText("あなたの現在地");
    await expect(page.getByTestId("growth-track")).toBeVisible();
    await expect(page.getByTestId("growth-node")).toHaveCount(5);
    await expect(page.locator("[data-testid='growth-node'][data-state='here']"))
      .toHaveCount(1);
    await expect(page.getByTestId("diagnosis-next-skill")).toHaveCount(0);
    await expect(page.getByTestId("diagnosis-traits")).toHaveCount(0);
    await expect(page.getByTestId("primary-action")).toHaveText(
      /答えから見えたことを見る/,
    );

    // ③回答から見えた特徴。判断と、その元になった答えが同じ画面にある
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(500);
    await expect(page.locator("main h1").first()).toHaveText("回答から見えた特徴");
    await expect(page.getByTestId("diagnosis-traits")).toBeVisible();
    await expect(
      page.getByTestId("diagnosis-trait-from").first(),
    ).toBeVisible();
    await expect(page.getByTestId("primary-action")).toHaveText(
      /4つの力のバランスを見る/,
    );

    // ④4つの力
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(500);
    await expect(page.locator("main h1").first()).toHaveText("4つの力のバランス");
    await expect(page.getByTestId("diagnosis-axes-summary")).toContainText("強み");
    await expect(page.getByTestId("diagnosis-axes-summary")).toContainText(
      "次に伸ばす力",
    );
    await expect(page.getByTestId("diagnosis-axes-summary")).toContainText(
      "次に覚えること",
    );
    await expect(page.getByTestId("primary-action")).toHaveText(
      /おすすめLessonを見る/,
    );

    // ⑤おすすめ。ここで初めて Lesson が出る
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(500);
    await expect(page.locator("main h1").first()).toHaveText("今のあなたにおすすめ");
    await expect(page.getByTestId("diagnosis-lesson")).toHaveCount(1);
    // なぜこの1本かが、同じカードの中にある
    await expect(page.getByTestId("diagnosis-reason-line")).toBeVisible();
    await expect(page.getByTestId("primary-action")).toHaveText(/Day \d+をはじめる/);
  });

  test("答え終わったら、待たずに現在地が出る", async ({ page }) => {
    /*
      **「回答を分析しています」の画面は無い。**

      前は5問目のあとに、4つの観点が順に点く 1.8 秒を挟んでいた。
      消した理由は2つある。

      1つ目。採点は同期で終わる（`course/diagnosisScore.ts` は計算
      だけで、AIもサーバーも呼ばない）。待つものが無いのに待たせて
      いた。

      2つ目のほうが重い。あの画面は4つの観点を**白い角丸カードに
      丸い印**を付けて縦に並べ、順に青くしていた。直前まで答えて
      いた選択肢と見分けが付かないので、**自分が押していない項目に
      勝手にチェックが付いていく**ように見えていた。診断を信じて
      もらうための画面が、逆のことをしていた。
    */
    await openDiagnosis(page);
    for (let guard = 0; guard < 8; guard += 1) {
      if (!(await answerOne(page))) break;
    }

    await expect(page.getByTestId("completion-view")).toBeVisible({ timeout: 4000 });
    await expect(page.locator("main h1").first()).toHaveText(
      "5つの答えを読み取りました",
    );

    // かけらも残っていないこと
    await expect(page.getByTestId("diagnosis-analyzing")).toHaveCount(0);
    await expect(page.getByTestId("analyzing-axis")).toHaveCount(0);
    // 押せないボタンを置いたまま待たせない
    await expect(page.getByTestId("primary-action")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("結果の4画面で、押す場所が動かない", async ({ page }, testInfo) => {
    /*
      順に押していく画面なので、**指を置いたまま次を押せる**必要が
      ある。前は、逃げ道を持つのが後ろの2つだけだったせいで、現在地
      から4つの力へ移った瞬間に主ボタンが 46px 上がっていた（実測）。

      空ける側も、**同じ `button` で空けている**（`StepShell` の
      `reserveSecondary`）。一度 `div` で高さだけ真似たら 6px 足りな
      かった——`button` は preflight の `font: inherit` で、`text-xs`
      の行の高さではなく本文の行間で描かれる。
    */
    test.skip(testInfo.project.name !== "mobile", "スマホの見え方だけ見る");
    await page.setViewportSize({ width: 402, height: 660 });
    await openDiagnosis(page);
    for (let guard = 0; guard < 8; guard += 1) {
      if (!(await answerOne(page))) break;
    }

    const bottom = async () => {
      const box = await page.getByTestId("primary-action").boundingBox();
      return Math.round(box?.y ?? 0) + Math.round(box?.height ?? 0);
    };

    const seen: { where: string; at: number }[] = [];
    seen.push({ where: "分析中", at: await bottom() });
    await expect(page.getByTestId("completion-view")).toBeVisible({ timeout: 6000 });

    for (const where of ["現在地", "4つの力", "おすすめ"]) {
      seen.push({ where, at: await bottom() });
      if (where === "おすすめ") break;
      await page.getByTestId("primary-action").click();
      await page.waitForTimeout(500);
    }

    const report = seen.map((one) => `${one.where}:${one.at}`).join(" / ");
    for (const one of seen) {
      expect(one.at, `押す場所が動いている（${report}）`).toBe(seen[0].at);
    }
  });

  test("結果の説明を開く一枚は、もう無い", async ({ page }) => {
    /*
      前はここに一枚が2つあった（「いまの様子」と「この結果になった
      理由」）。前者は現在地・できていること・次にやること・4つの力の
      内訳が入っていて、**いまはそれが画面そのもの**になっている。

      後者も同じ道をたどった。答えた内容とそこからの判断は、いまは
      特徴の画面（③）そのもの。一枚のままだと判断と根拠が離れて
      置かれ、しかもどの画面からも開けるので**同じものが何度も載る**
      ——押さない人には、根拠が1つも見えなかった。
    */
    await toResult(page);

    await expect(page.getByTestId("diagnosis-reason-open")).toHaveCount(0);
    await expect(page.getByTestId("diagnosis-detail-sheet")).toHaveCount(0);
    await expect(page.getByTestId("diagnosis-reason-sheet")).toHaveCount(0);

    // 根拠は、特徴の画面に出ている
    for (let guard = 0; guard < 6; guard += 1) {
      if (await page.getByTestId("diagnosis-traits").count()) break;
      await page.getByTestId("primary-action").click();
      await page.waitForTimeout(400);
    }
    await expect(page.getByTestId("diagnosis-trait-from").first()).toContainText(
      /と答えた|AI|3つの場面/,
    );
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

        ここで見るのはページそのものの縦。開いた一枚（くわしく見る）の
        中だけは送ってよいので、そこは通らない。
      */
      await page.setViewportSize({ width, height });
      await openDiagnosis(page);

      for (let guard = 0; guard < 9; guard += 1) {
        const where = (await page.locator("main h1").first().innerText()).trim();
        await expectFits(page, where);
        if (!(await answerOne(page))) break;
      }

      /*
        結果の3画面も、1つずつ見る。**どれも同じだけ収まっている
        必要がある**——1画面だったころは「結果画面」1回で足りたが、
        いまは中身が画面ごとに違う。ひし形を置く回がいちばん高い。
      */
      await expect(page.getByTestId("completion-view")).toBeVisible({
        timeout: 6000,
      });
      for (const name of ["現在地", "4つの力", "おすすめ"]) {
        await expectFits(page, `結果（${name}）`);
        if (name === "おすすめ") break;
        await page.getByTestId("primary-action").click();
        await page.waitForTimeout(500);
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────
     進むのは、押したときだけ。

     前は「答えが入っているか」（`isAnswered`）で自動送りを決めて
     いた。あれは**保存されている値の性質**であって、人が何かをした
     証ではない。だから2つ壊れていた。

       1. 札を押した瞬間に値が入る → 500ms で次の問いへ送られ、
          何を選んだのか確かめられない
       2. 前の問いへ戻ると、そこには前の答えが残っている → 入った
          瞬間に「答えてある」と読まれ、また送られる。**戻れない**
     ───────────────────────────────────────────────────────────── */

  test("選んでも、その場に留まる（CTAが押せるようになるだけ）", async ({ page }) => {
    await openDiagnosis(page);

    const title = await page.locator("main h1").first().innerText();
    const primary = page.getByTestId("primary-action");
    await expect(primary).toHaveAttribute("aria-disabled", "true");

    await page.locator("[aria-pressed]").first().click();
    // 自動送りは 500ms だった。それより十分に長く待つ
    await page.waitForTimeout(1500);

    await expect(page.locator("main h1").first()).toHaveText(title);
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
  });

  test("「次へ」を押すと、はじめて次の問いへ行く", async ({ page }) => {
    await openDiagnosis(page);
    const first = await page.locator("main h1").first().innerText();

    await page.locator("[aria-pressed]").first().click();
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(600);

    await expect(page.locator("main h1").first()).not.toHaveText(first);
  });

  test("戻ると、前の答えが選ばれたまま残る（勝手に進まない）", async ({ page }) => {
    await openDiagnosis(page);
    const q1 = await page.locator("main h1").first().innerText();

    const picked = await page.locator("[aria-pressed]").nth(2).innerText();
    await page.locator("[aria-pressed]").nth(2).click();
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(600);

    await page.getByTestId("lesson-back").click();
    // 送られてしまうなら、ここで次の問いへ移っている
    await page.waitForTimeout(1500);

    await expect(page.locator("main h1").first()).toHaveText(q1);
    const on = page.locator("[aria-pressed='true']");
    await expect(on).toHaveCount(1);
    await expect(on).toHaveText(picked.trim());
  });

  test("戻った先で答えを変えても、その場に留まる", async ({ page }) => {
    await openDiagnosis(page);
    const q1 = await page.locator("main h1").first().innerText();

    await page.locator("[aria-pressed]").nth(2).click();
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(600);
    await page.getByTestId("lesson-back").click();
    await page.waitForTimeout(600);

    // 別の札へ変える
    await page.locator("[aria-pressed='false']").first().click();
    await page.waitForTimeout(1500);

    await expect(page.locator("main h1").first()).toHaveText(q1);

    // そこから「次へ」で進める
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(600);
    await expect(page.locator("main h1").first()).not.toHaveText(q1);
  });

  test("何問進んでも、押した数だけ戻れる", async ({ page }) => {
    await openDiagnosis(page);
    const q1 = await page.locator("main h1").first().innerText();

    // Q1 → Q2 → Q3
    for (let step = 0; step < 2; step += 1) {
      await page.locator("[aria-pressed]").first().click();
      await page.getByTestId("primary-action").click();
      await page.waitForTimeout(600);
    }
    const q3 = await page.locator("main h1").first().innerText();
    expect(q3).not.toBe(q1);

    await page.getByTestId("lesson-back").click();
    await page.waitForTimeout(800);
    await page.getByTestId("lesson-back").click();
    await page.waitForTimeout(800);

    await expect(page.locator("main h1").first()).toHaveText(q1);
  });

  test("ミニ問題も、埋め終わっただけでは進まない", async ({ page }) => {
    await openDiagnosis(page);
    await answerOne(page);
    await answerOne(page);

    const title = await page.locator("main h1").first().innerText();
    const parts = page.getByTestId("assemble-part");
    for (let index = 0; index < 3; index += 1) {
      await parts.nth(index).getByTestId("assemble-choice").first().click();
    }
    await page.waitForTimeout(1500);

    await expect(page.locator("main h1").first()).toHaveText(title);
    await expect(page.getByTestId("primary-action")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("どの持ち方でも、ひし形を出す", async ({ page }) => {
    /*
      **前は高さで出し分けていた。** 760px 以上ならひし形、それ未満
      なら横棒（`AxisBars`）。いちばん低い持ち方に合わせた結果、
      実機のほとんどで横棒しか出ていなかった。

      横棒は同じ4つの段を数として言うが、4つの関係——どこが出ていて
      どこがへこんでいるか——は一目にならない。ここの主役は形のほう
      なので、どの高さでもひし形を出す。値そのものは読み上げへ渡す。
    */
    await page.setViewportSize({ width: 402, height: 660 });
    await toResult(page);
    await toAxes(page);

    await expect(page.locator("main h1").first()).toHaveText("4つの力のバランス");
    await expect(page.getByTestId("radar-chart")).toBeVisible();
    // 表には横棒を出さない。同じ値を2通りで同時に見せない
    await expect(page.getByTestId("axis-bars")).toHaveCount(0);
    await expectFits(page, "結果（4つの力・低い持ち方）");
  });

  test("ひし形は、4つの値を読み上げにも渡す", async ({ page }) => {
    /*
      数の内訳（横棒）は置かない——同じ4つの値を2通りで同時に見せると、
      どちらを読めばよいのか決められなくなる。ここで見せたいのは
      **4つの関係**なので、ひし形1つでよい。

      ただし形だけでは、目で追えない人に何も伝わらない。値そのものは
      読み上げへ渡す（`radar-chart` の `aria-label`）。
    */
    await page.setViewportSize({ width: 402, height: 660 });
    await toResult(page);
    await toAxes(page);

    await expect(page.locator("main h1").first()).toHaveText("4つの力のバランス");
    const label = await page
      .getByTestId("radar-chart")
      .locator("svg")
      .getAttribute("aria-label");
    for (const axis of ["AIに頼む", "条件を加える", "目的に合わせる", "仕事で組み立てる"]) {
      expect(label, `${axis} が読み上げに無い`).toContain(axis);
    }
    expect(label, "段の値が読み上げに無い").toMatch(/のうち \d/);
  });

  test("その1本が合わない人の行き先は、押した人にだけ", async ({ page }) => {
    /*
      画面に3枚並べると「次に何をするか」をもう一度選ばせることに
      なる。かといって消すと、画像をやりたくて来た人に1本だけ出して
      終わる形になる。決めるのは上の1本、ここはその逃げ道。
    */
    await page.setViewportSize({ width: 402, height: 660 });
    await toRecommendation(page, { allOpen: true });

    await expect(page.getByTestId("diagnosis-also")).toHaveCount(0);
    await expectFits(page, "結果（おすすめ・低い持ち方）");

    await page.getByTestId("diagnosis-also-open").click();
    const sheet = page.getByTestId("diagnosis-also-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("listitem")).toHaveCount(2);
  });

  test("端末の「戻る」は、開いた一枚から閉じる", async ({ page }) => {
    /*
      このアプリは**画面**（TOP / HOME / LESSON …）を履歴に積んで
      いて、一枚（モーダル）は積んでいなかった。開いている最中に
      端末の「戻る」を押すと、一枚は無視されて画面ごと前へ移る
      ——閉じたいだけの人が、診断の外まで出されていた。

      いまは一枚が開くとき、画面はそのままの履歴を1つ積む。
    */
    await toRecommendation(page, { allOpen: true });

    await page.getByTestId("diagnosis-also-open").click();
    await expect(page.getByTestId("diagnosis-also-sheet")).toBeVisible();

    /*
      押すのは端末の「戻る」。`page.goBack()` は使わない——あれは
      文書の読み込みを待つので、`pushState` だけで積んだ同じURLの
      履歴では待ち切れず、余分に戻ることがある（実際そうなった）。
    */
    const back = () => page.evaluate(() => window.history.back());

    // 1回目 … 一枚だけ閉じる。背面のおすすめはそのまま
    await back();
    await expect(page.getByTestId("diagnosis-also-sheet")).toHaveCount(0);
    await expect(page.locator("main h1").first()).toHaveText("今のあなたにおすすめ");

    // 2回目 … 結果の中を1画面ぶん戻る。診断からは出ない
    await back();
    await expect(page.locator("main h1").first()).toHaveText("4つの力のバランス");
  });

  test("×で閉じたあとも、「戻る」の数がずれない", async ({ page }) => {
    /*
      開くときに積んだ履歴は、×やEscで閉じたときにも戻す。戻さないと
      閉じたあとの1回目の「戻る」が空振りする（押しても何も起きない）。
    */
    await toRecommendation(page, { allOpen: true });

    await page.getByTestId("diagnosis-also-open").click();
    await expect(page.getByTestId("diagnosis-also-sheet")).toBeVisible();
    await page.getByTestId("diagnosis-also-close").click();
    await expect(page.getByTestId("diagnosis-also-sheet")).toHaveCount(0);

    /*
      ここでの「戻る」は**空振りしない**。閉じるときに履歴を戻して
      いなければ、1回目の「戻る」が一枚の分を食って何も起きない。

      戻る先は結果の1画面ぶん前（4つの力）。診断からは出ない。
    */
    await page.evaluate(() => window.history.back());
    await page.waitForTimeout(400);
    await expect(page.locator("main h1").first()).toHaveText("4つの力のバランス");
  });

  test("「戻る」は、1回ぶんだけ戻る", async ({ page }) => {
    /*
      押しっぱなしで外まで出ないこと。結果の中では**画面を1つずつ**、
      抜けたら問いを1つずつ。分析中へは戻さない——同じ 1.8 秒をもう
      一度待つだけで、戻る先として意味を持たない。
    */
    await toRecommendation(page);

    const back = () => page.evaluate(() => window.history.back());
    const heading = () => page.locator("main h1").first();

    await back();
    await expect(heading()).toHaveText("4つの力のバランス");
    await back();
    await expect(heading()).toHaveText("回答から見えた特徴");
    await back();
    await expect(heading()).toHaveText("あなたの現在地");
    await back();
    await expect(heading()).toHaveText("5つの答えを読み取りました");

    // ここから先は教材の問い。1問ずつ戻る
    for (const expected of ["5 / 5", "4 / 5"]) {
      await back();
      await expect(page.getByTestId("lesson-mission-count")).toContainText(expected);
    }
  });

  test("おすすめを押すと、その回が始まる", async ({ page }) => {
    /*
      押せる形にしてあるのに押せないと、見えているだけで届かない道になる。
      **診断を受けた記録も残ること**——ここを飛ばすと、受けたのに
      受けていないことになる（ホームのおすすめが既定のまま戻る）。
    */
    await toRecommendation(page);

    const label = (await page.getByTestId("diagnosis-lesson").innerText()).replace(
      /\s+/g,
      "",
    );
    await page.getByTestId("primary-action").click();

    // 診断から出て、そのレッスンが開いている
    await expect(page.getByTestId("completion-view")).toHaveCount(0);
    const title = (await page.getByTestId("lesson-header").innerText()).replace(
      /\s+/g,
      "",
    );
    expect(title).toContain(label);
  });

  test("ほかの候補を押しても、その回が始まる", async ({ page }) => {
    await toRecommendation(page, { allOpen: true });

    await page.getByTestId("diagnosis-also-open").click();
    const also = page.getByTestId("diagnosis-also-pick").first();
    const label = (await also.innerText()).replace(/\s+/g, "");
    await also.click();

    await expect(page.getByTestId("completion-view")).toHaveCount(0);
    const title = (await page.getByTestId("lesson-header").innerText()).replace(
      /\s+/g,
      "",
    );
    expect(label).toContain(title);
  });

  test("診断の途中で「×」を押すと、一度たしかめる", async ({ page }) => {
    /*
      前はここが「スキップ」という文字で、押すと**その場で消えて
      いた**。3問答えたところで指が触れると、そこまでの手が黙って消える。
    */
    await openDiagnosis(page);
    await answerOne(page);

    await page.getByTestId("lesson-exit").click();

    const sheet = page.getByTestId("diagnosis-leave-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("ここまでの回答は保存されています");

    // 「診断を続ける」で、いた場所に戻る
    await page.getByTestId("diagnosis-leave-cancel").click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId("lesson-header")).toBeVisible();
  });

  test("「メインへ戻る」は、ホームまで返す", async ({ page }) => {
    /*
      **押しても何も起きない、と報告された。**

      実際に押して確かめると、着く先は「AIスタートコース」——診断を
      開いた1つ手前の画面だった。コースから診断へ入った人（ほぼ全員）
      には、押す前と後で似た画面が並ぶので、反応していないように見える。

      ボタンに書いてある行き先と、着く場所を合わせる。
    */
    await openDiagnosis(page);
    await answerOne(page);

    await page.getByTestId("lesson-exit").click();
    await expect(page.getByTestId("diagnosis-leave-sheet")).toBeVisible();
    await page.getByTestId("diagnosis-leave-confirm").click();

    // ホームに居ること。レッスンの帯は消え、下タブが出ている
    await expect(page.getByTestId("lesson-header")).toHaveCount(0);
    await expect(page.getByTestId("tab-bar")).toBeVisible();
    await expect(page.getByTestId("home-greeting")).toBeVisible();
  });

  test("結果まで着いても、←と×は消えない", async ({ page }) => {
    /*
      帯は診断のあいだじゅう出しておく。**結果の3画面でも。**

      結果を読んで「さっきの問いは何と答えたっけ」と思う人はいるし、
      おすすめを取らずに戻りたい人もいる。ここで帯を消すと、
      画面の中のボタン以外に行き先が無くなる。

      そして結果の「×」では確かめない。「診断を終了しますか？」は
      **途中でやめる人**への一言で、答え終わった人には当てはまらない。
    */
    await toResult(page);

    await expect(page.getByTestId("lesson-back")).toBeVisible();
    await expect(page.getByTestId("lesson-exit")).toBeVisible();

    // ←は最後の問いへ戻す。行き止まりにしない
    await page.getByTestId("lesson-back").click();
    await expect(page.getByTestId("completion-view")).toHaveCount(0);
    await expect(page.locator("[aria-pressed='true']").first()).toBeVisible();

    // 戻って結果へ着き直し、そこから×で出る（たしかめは挟まない）
    await page.getByTestId("primary-action").click();
    await expect(page.getByTestId("completion-view")).toBeVisible({ timeout: 6000 });
    await page.getByTestId("lesson-exit").click();
    await expect(page.getByTestId("diagnosis-leave-sheet")).toHaveCount(0);
    await expect(page.getByTestId("tab-bar")).toBeVisible();
  });

  test("おすすめまで進んでも、←と×は消えない", async ({ page }) => {
    await toRecommendation(page);
    await expect(page.getByTestId("lesson-back")).toBeVisible();
    await expect(page.getByTestId("lesson-exit")).toBeVisible();

    // 「診断結果をもう一度見る」は、結果の先頭へ戻す
    await page.getByRole("button", { name: "診断結果をもう一度見る" }).click();
    await expect(page.locator("main h1").first()).toHaveText(
      "5つの答えを読み取りました",
    );
  });

  test("開始画面も、送らずに全部見える", async ({ page }) => {
    /*
      絵を幅いっぱい・高さは比なりで置いていたころ、いちばん低い
      持ち方（402×660）では絵だけで 241px あり、入れ物（195px）から
      46px はみ出していた。ページは伸びないので外からは分からず、
      実機の Safari で「開始画面がスクロールする」と見えていた。
    */
    await page.setViewportSize({ width: 402, height: 660 });
    await stubApi(page);
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "はじめる" }).first().click();
    await page.getByRole("button", { name: "コース" }).first().click();
    await page.getByTestId("current-course-open").click();
    await page.getByTestId("lesson-diagnosis").first().click();
    await dismissLessonIntro(page);
    await page.waitForTimeout(600);

    await expectFits(page, "診断の開始画面");

    /*
      大きな説明画像を置かない。**絵の中の「AI活用診断」が上の帯と
      二重**になっていて、しかも詰め込まれた1枚が広告のバナーに
      見えていた。いまは UI で組んである。
    */
    await expect(page.getByTestId("teaching-image")).toHaveCount(0);

    // 答える前の不安に、3つだけ答える
    const meta = (await page.getByTestId("diagnosis-meta").innerText()).replace(
      /\s+/g,
      "",
    );
    expect(meta).toContain("全5問");
    expect(meta).toContain("約1分");
    expect(meta).toContain("正解・不正解なし");

    /*
      5段階は見せるが、**現在地はまだ出さない**。ここは診断する範囲の
      下見で、結果ではない。1つ光らせると、答える前に「あなたはここ」と
      言うことになる。
    */
    await expect(page.getByTestId("growth-node")).toHaveCount(5);
    await expect(
      page.locator("[data-testid='growth-node'][data-state='here']"),
    ).toHaveCount(0);

    await expect(page.getByTestId("primary-action")).toHaveText(/診断をはじめる/);
    // 降りる道も、進む道のすぐ下にある
    await expect(
      page.getByRole("button", { name: "診断せずに始める" }),
    ).toBeVisible();
  });
});
