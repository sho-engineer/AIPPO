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
  /*
    5問目のあとは分析中が挟まる（`diagnosis/Analyzing.tsx`）。ここも
    「答え終わった」——押せるものが無いので、止めないと空振りを
    繰り返す。
  */
  if (await page.getByTestId("diagnosis-analyzing").count()) return false;

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
 * 分析中を待ち切ること。待たずに次を触ると、まだボタンが押せない
 * 1.8 秒のあいだに空振りする。
 */
async function toResult(page: Page): Promise<void> {
  await openDiagnosis(page);
  for (let guard = 0; guard < 8; guard += 1) {
    if (!(await answerOne(page))) break;
  }
  await expect(page.getByTestId("completion-view")).toBeVisible({ timeout: 6000 });
  await expect(page.locator("main h1").first()).toHaveText("あなたの現在地");
}

/** 結果の3画面目（おすすめ）まで行く。 */
async function toRecommendation(page: Page): Promise<void> {
  await toResult(page);
  for (let step = 0; step < 2; step += 1) {
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(500);
  }
  await expect(page.locator("main h1").first()).toHaveText("今のあなたにおすすめ");
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
      /* 分析中は問いではない。数えない（`diagnosis/Analyzing.tsx`） */
      if (await page.getByTestId("diagnosis-analyzing").count()) break;
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

  test("結果は、3画面に分かれて出る", async ({ page }) => {
    /*
      前は1画面だった。図・できていること・次の一歩・おすすめが同時に
      並び、下のボタンは最初から「ここから始める」。**読む前に次へ行く
      道が目に入る**ので、結果は読まれずに押されていた。
    */
    await toResult(page);

    // ①現在地。ここではまだ Lesson の話をしない
    await expect(page.locator("main h1").first()).toHaveText("あなたの現在地");
    await expect(page.getByTestId("growth-track")).toBeVisible();
    await expect(page.getByTestId("growth-node")).toHaveCount(5);
    await expect(page.locator("[data-testid='growth-node'][data-state='here']"))
      .toHaveCount(1);
    await expect(page.getByTestId("diagnosis-next-skill")).toHaveCount(0);
    await expect(page.getByTestId("primary-action")).toHaveText(
      /使い方のバランスを見る/,
    );

    // ②4つの力
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

    // ③おすすめ。ここで初めて Lesson が出る
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(500);
    await expect(page.locator("main h1").first()).toHaveText("今のあなたにおすすめ");
    await expect(page.getByTestId("diagnosis-lesson")).toHaveCount(1);
    // なぜこの1本かが、同じカードの中にある
    await expect(page.getByTestId("diagnosis-reason-line")).toBeVisible();
    await expect(page.getByTestId("primary-action")).toHaveText(/Day \d+をはじめる/);
  });

  test("答え終わってすぐは、結果ではなく分析中", async ({ page }) => {
    /*
      押した／出た、の2コマしかないと、答えが読まれた実感が残らない
      ——「アンケートのよう」と言われたのがそこ。足しているのは待ち
      時間ではなく、**何を見て判断したか**。
    */
    await openDiagnosis(page);
    for (let guard = 0; guard < 8; guard += 1) {
      if (!(await answerOne(page))) break;
    }

    const analyzing = page.getByTestId("diagnosis-analyzing");
    await expect(analyzing).toBeVisible();
    await expect(page.locator("main h1").first()).toHaveText("回答を分析しています");
    // 4つの観点。結果の「4つの力」と同じ4つであること
    await expect(page.getByTestId("analyzing-axis")).toHaveCount(4);
    // ここで押せてしまうと、演出を飛ばして結果へ行ける
    await expect(page.getByTestId("primary-action")).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    // 白い画面を挟まない。分析中から現在地へ、そのまま入れ替わる
    await expect(page.getByTestId("completion-view")).toBeVisible({ timeout: 6000 });
    await expect(analyzing).toHaveCount(0);
  });

  test("分析は、長すぎない", async ({ page }) => {
    /*
      待たせるのが目的ではない。4つ読んで終わる長さより延ばすと、
      「固まった」に変わる。
    */
    await openDiagnosis(page);
    for (let guard = 0; guard < 8; guard += 1) {
      if (!(await answerOne(page))) break;
    }
    await expect(page.getByTestId("diagnosis-analyzing")).toBeVisible();

    const started = Date.now();
    await expect(page.getByTestId("completion-view")).toBeVisible({ timeout: 6000 });
    expect(Date.now() - started).toBeLessThan(3500);
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

  test("長い話は、1つの一枚の中だけ", async ({ page }) => {
    /*
      前はここに一枚が2つあった（「いまの様子」と「答えと理由」）。
      前者は現在地・できていること・次にやること・4つの力の内訳が
      入っていて、**いまはそれが画面そのもの**になっている。同じことを
      2か所で言っていたので廃止した。

      残したのは「この結果になった理由」1つ。3画面のどこからでも
      同じ一枚へ届く——読みたくなる場所は人によって違うが、見たい
      ものは同じ1つ。
    */
    await toResult(page);

    await expect(page.getByTestId("completion-view")).not.toContainText(
      "答えた内容",
    );
    await expect(page.getByTestId("completion-view")).not.toContainText(
      "4つの力の内訳",
    );

    await page.getByTestId("diagnosis-reason-open").click();
    const sheet = page.getByTestId("diagnosis-detail-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-placement", "center");
    await expect(sheet).toContainText("答えた内容");
    await expect(sheet.getByTestId("axis-bar")).toHaveCount(4);

    // 廃止した一枚は、もう開かない
    await expect(page.getByTestId("diagnosis-reason-sheet")).toHaveCount(0);

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

  test("低い持ち方では、ひし形ではなく横棒で出す", async ({ page }) => {
    /*
      ひし形は正方形なので、幅を使えるだけ高さも要る。402×660 で
      この画面に渡せるのは 200px ほどで、ひし形と下の3行の両方は
      載らない。

      **縮めて載せない。** 小さいひし形は4つの頂点が寄って、どこが
      薄いのか読めない図になる——載っているだけで読めない図は、
      場所を取るぶん無いほうがまし。同じ4つの段を横棒で言う。
    */
    await page.setViewportSize({ width: 402, height: 660 });
    await toResult(page);
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(500);

    await expect(page.locator("main h1").first()).toHaveText("4つの力のバランス");
    /*
      見るのは**見えているか**で、DOM にあるかではない。高さで
      出し分けているので（`hidden` / `flex`）、両方とも要素としては
      置かれている。
    */
    await expect(page.getByTestId("axis-bars")).toBeVisible();
    await expect(page.getByTestId("radar-chart")).not.toBeVisible();
    await expectFits(page, "結果（4つの力・低い持ち方）");
  });

  test("縦に余る端末では、ひし形で出す", async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await toResult(page);
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId("radar-chart")).toBeVisible();
    await expectFits(page, "結果（4つの力・高い端末）");
  });

  test("その1本が合わない人の行き先は、押した人にだけ", async ({ page }) => {
    /*
      画面に3枚並べると「次に何をするか」をもう一度選ばせることに
      なる。かといって消すと、画像をやりたくて来た人に1本だけ出して
      終わる形になる。決めるのは上の1本、ここはその逃げ道。
    */
    await page.setViewportSize({ width: 402, height: 660 });
    await toRecommendation(page);

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
    await toRecommendation(page);

    await page.getByTestId("diagnosis-reason-open").click();
    await expect(page.getByTestId("diagnosis-detail-sheet")).toBeVisible();

    /*
      押すのは端末の「戻る」。`page.goBack()` は使わない——あれは
      文書の読み込みを待つので、`pushState` だけで積んだ同じURLの
      履歴では待ち切れず、余分に戻ることがある（実際そうなった）。
    */
    const back = () => page.evaluate(() => window.history.back());

    // 1回目 … 一枚だけ閉じる。背面のおすすめはそのまま
    await back();
    await expect(page.getByTestId("diagnosis-detail-sheet")).toHaveCount(0);
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
    await toResult(page);

    await page.getByTestId("diagnosis-reason-open").click();
    await expect(page.getByTestId("diagnosis-detail-sheet")).toBeVisible();
    await page.getByTestId("diagnosis-detail-close").click();
    await expect(page.getByTestId("diagnosis-detail-sheet")).toHaveCount(0);

    /*
      ここでの「戻る」は**空振りしない**。現在地からの行き先は
      最後の問い——結果の1画面目なので、戻る先は教材のほうになる。

      前はここで診断そのものから出ていた。レッスンの中の回を履歴に
      積んでいなかったので、結果でブラウザバックを押すと**5問すべてを
      飛ばしてコースの画面まで出る**（実測で履歴6段、1回でコースへ）。
    */
    await page.evaluate(() => window.history.back());
    await page.waitForTimeout(400);
    await expect(page.getByTestId("completion-view")).toHaveCount(0);
    await expect(page.getByTestId("lesson-mission-count")).toContainText("5 / 5");
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
    await expect(heading()).toHaveText("あなたの現在地");

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
    await toRecommendation(page);

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
    await expect(page.locator("main h1").first()).toHaveText("あなたの現在地");
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
