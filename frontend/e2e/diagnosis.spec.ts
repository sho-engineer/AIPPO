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
  if (((await page.getByTestId("completion-view").count()) ||
      (await page.getByTestId("diagnosis-analyzing").count()))) return false;

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
 * 5問に答えて、**現在地の画面**まで行く。
 *
 * 途中に「整理中」の1枚が入る（1〜1.5秒）。押すものは無く、自分で
 * 現在地へ移るので、ここでは**移り終わるのを待つ**だけ。待ち方を
 * 秒数で書かない——長さを変えた日に、ここだけ古い数で落ちる。
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
  await expect(page.locator("main h1").first()).toHaveText("あなたの現在地", {
    timeout: 6000,
  });
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
      if (((await page.getByTestId("completion-view").count()) ||
      (await page.getByTestId("diagnosis-analyzing").count()))) break;
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

  test("帯は、はじめから終わりまで段のまま", async ({ page }) => {
    /*
      渡さないことは、出さないことではない。

      開始画面と結果には `segments` を渡していなかった。「そこは問い
      ではないので数えるものが無い」という理由だったが、
      `LessonProgress` は `segments` が無ければ**章の帯**を描く。
      実機の写しで開始画面の右寄りに入っていた細い切れ目がそれで、
      読み上げは「2つのうち1つ目。いまは『試す』」——聞かれているのは
      自分のことなのに、何かを試している最中に見える言葉を、画面から
      消したあとも読み上げにだけ残していた。

      だから通しで見る。**問いが始まってから終わりまで段のまま**で
      あること。

      開始画面だけは別で、帯そのものを出さない。まだ1問も始まって
      いないので、空の段が5つ並ぶと「0 / 5 から始まる長いもの」に
      見える。数え始めるのは質問1から。
    */
    /*
      `openDiagnosis` は開始画面を1回押して通り過ぎる。ここで見たいのは
      その開始画面そのものなので、押さずに止める。
    */
    await stubApi(page);
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "コース" }).first().click();
    await page.getByTestId("current-course-open").click();
    await page.getByTestId("lesson-diagnosis").first().click();
    await dismissLessonIntro(page);
    await expect(page.getByTestId("diagnosis-intro")).toBeVisible();

    const read = () =>
      page.evaluate(() => {
        const root = document.querySelector('[data-testid="lesson-progress"]');
        const segs = root?.querySelector('[data-testid="progress-segments"]');
        return {
          present: !!root,
          segmented: !!segs,
          total: segs ? segs.children.length : 0,
          filled: segs
            ? [...segs.children].filter(
                (node) => (node as HTMLElement).dataset.done === "true",
              ).length
            : 0,
          valuetext: root?.getAttribute("aria-valuetext") ?? "",
        };
      });

    // ── 開始画面。帯そのものを出さない ──
    const intro = await read();
    expect(intro.present, "開始前に進捗バーが出ている").toBe(false);

    // 開始画面から、最初の問いへ
    await page.getByTestId("primary-action").click();
    await expect(page.getByTestId("progress-segments")).toBeVisible();

    /*
      段の数は数え直さない。**教材が持っている数**と合っていればよい
      ——ここに 5 と書くと、問いを1つ足した日に検査だけが古い数を守る。
    */
    const asked = (await read()).total;
    expect(asked).toBeGreaterThan(1);

    // ── 問いの画面。埋まった数が、そのまま何問目か ──
    for (let at = 1; at <= asked; at += 1) {
      if (((await page.getByTestId("completion-view").count()) ||
      (await page.getByTestId("diagnosis-analyzing").count()))) break;

      const here = await read();
      expect(here.segmented, `質問${at}の帯が章の帯に落ちている`).toBe(true);
      expect(here.total).toBe(asked);
      expect(here.filled, `質問${at}で埋まった段の数が合わない`).toBe(at);
      expect(here.valuetext, `質問${at}の読み上げ`).toContain(`${at}問目`);

      if (!(await answerOne(page))) break;
    }

    // ── 結果。全部埋まっている ──
    await expect(page.getByTestId("completion-view")).toBeVisible({
      timeout: 6000,
    });
    /* 整理中の1枚を過ぎるまで待つ（自分で現在地へ移る） */
    await expect(page.locator("main h1").first()).toHaveText("あなたの現在地", {
      timeout: 6000,
    });
    const done = await read();
    expect(done.segmented, "結果の帯が章の帯に落ちている").toBe(true);
    expect(done.filled, "答え終えたのに段が埋まっていない").toBe(asked);
    expect(done.valuetext).not.toContain("試す");
  });

  test("どの画面も、送らずに全部見える", async ({ page }) => {
    /*
      ミニ問題は枠が3つあり、それぞれ札が2行に折り返す。札の高さを
      44px にしていたころ、Pixel 5（393×727）で**最後の枠が画面から
      出ていた**。1行あたり数 px の差が、枠3つぶんで効く。
    */
    await openDiagnosis(page);

    for (let guard = 0; guard < 12; guard += 1) {
      if (((await page.getByTestId("completion-view").count()) ||
      (await page.getByTestId("diagnosis-analyzing").count()))) break;

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

  test("結果は、4画面に分かれて出る", async ({ page }) => {
    /*
      前は1画面だった。図・できていること・次の一歩・おすすめが同時に
      並び、下のボタンは最初から「ここから始める」。**読む前に次へ行く
      道が目に入る**ので、結果は読まれずに押されていた。

      いまは 整理中 → 現在地 → 4つの力 → おすすめ。整理中は押すものを
      持たず、自分で現在地へ移る（`toResult` がそこまで待つ）。
    */
    await toResult(page);

    // ①現在地。ここではまだ Lesson の話をしない
    await expect(page.locator("main h1").first()).toHaveText("あなたの現在地");
    await expect(page.getByTestId("growth-track")).toBeVisible();
    await expect(page.getByTestId("growth-node")).toHaveCount(5);
    await expect(page.locator("[data-testid='growth-node'][data-state='here']"))
      .toHaveCount(1);
    await expect(page.getByTestId("diagnosis-next-skill")).toHaveCount(0);

    /*
      判断と根拠は、**同じ画面に置く。** そうなった理由と、回答から
      見えたこと（元の答えつき）が現在地と一緒に出る。前は別の画面に
      分かれていて、現在地のほうは「そう出た」としか読めなかった。
    */
    await expect(page.getByTestId("diagnosis-stage-reason")).toBeVisible();

    /*
      詳しい根拠は、**開いて読む一枚**のほう。主画面へ積むと、答えの
      組み合わせによって画面が縦に伸びる（実測で 390×844 が 42px、
      320×568 が最大 148px あふれていた）。隠すのでも消すのでもなく、
      出す単位を分けてある。
    */
    await page.getByTestId("diagnosis-reason-open").click();
    await expect(page.getByTestId("diagnosis-detail-sheet")).toBeVisible();
    await page.getByTestId("detail-next").click();
    await expect(page.getByTestId("diagnosis-traits")).toBeVisible();
    await expect(
      page.getByTestId("diagnosis-trait-from").first(),
    ).toBeVisible();
    await page.getByTestId("diagnosis-detail-close").click();
    await expect(page.getByTestId("diagnosis-detail-sheet")).toHaveCount(0);
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

    /*
      整理中の1枚。**押すものを置かない。** 押せる先が無いので、
      帯ごと出さない。画面まるごとを受け持つ部品なので、結果の
      入れ物（`completion-view`）もまだ無い。
    */
    await expect(page.getByTestId("diagnosis-analyzing")).toBeVisible({
      timeout: 4000,
    });
    await expect(page.getByTestId("completion-view")).toHaveCount(0);
    await expect(page.getByTestId("primary-action")).toHaveCount(0);

    /* 4つの観点は、最初から4行そろって置いてある（増えていかない） */
    await expect(
      page.locator('[data-testid="analyzing-axes"] > li'),
    ).toHaveCount(4);

    /* やっていないことは書かない。偽の進捗も出さない */
    const said = await page.getByTestId("diagnosis-analyzing").innerText();
    expect(said).not.toContain("分析");
    expect(said).not.toMatch(/\d+\s*%/);

    /* 自分で現在地へ移る */
    await expect(page.locator("main h1").first()).toHaveText("あなたの現在地", {
      timeout: 6000,
    });
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

  test("結果の説明は、開いて読む一枚として在る", async ({ page }) => {
    /*
      前はここに一枚が2つあった（「いまの様子」と「この結果になった
      理由」）。どちらも中身を画面そのものへ移して廃した。

      **理由の一枚だけ戻した。** 根拠は答えの組み合わせで長さが変わる
      ので、主画面へ積むと人によって画面が縦に伸びる（実測で
      390×844 が 42px、320×568 が最大 182px）。隠すのでも消すのでも
      なく、出す単位を分ける。

      どの画面からでも開ける形には戻していない——理由のリンクは
      現在地の画面にだけ、4つの力のリンクはその画面にだけ置く。
      同じものが何度も載らないように。
    */
    await toResult(page);

    /* 廃したままの一枚は、戻っていない */
    await expect(page.getByTestId("diagnosis-reason-sheet")).toHaveCount(0);
    await expect(page.getByTestId("chart-switch")).toHaveCount(0);

    /* 開く前は、一枚は出ていない */
    await expect(page.getByTestId("diagnosis-detail-sheet")).toHaveCount(0);

    await page.getByTestId("diagnosis-reason-open").click();
    const sheet = page.getByTestId("diagnosis-detail-sheet");
    await expect(sheet).toBeVisible();

    /* 重ねて開かない */
    await expect(sheet).toHaveCount(1);

    /* 閉じれば、元の画面に戻る */
    await page.getByTestId("diagnosis-detail-close").click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator("main h1").first()).toHaveText("あなたの現在地");
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
    await expect(heading()).toHaveText("あなたの現在地");

    /*
      ここから先は教材の問い。**整理中へは戻さない**——同じ1.2秒を
      もう一度見るだけで、しかもあの画面は自分で次へ進むので、
      戻った先からすぐ押し戻される（「戻る」が効かないように見える）。
    */
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
    /*
      戻る先は現在地。**整理中は見直しでは再生しない**——同じ結果を
      もう一度読むだけの人に、1.2秒の演出をもう一度見せない。
    */
    await expect(page.locator("main h1").first()).toHaveText("あなたの現在地");
  });

  test("「診断結果を見る」を連打しても、1回しか進まない", async ({ page }) => {
    /*
      指の2度目は、画面が入れ替わるより早いことがある。2回進むと
      履歴に同じ行き先が2つ積まれ、戻った人がもう一度同じ場所に着く。
    */
    await openDiagnosis(page);
    /* 5問目の手前まで */
    for (let guard = 0; guard < 4; guard += 1) {
      if (!(await answerOne(page))) break;
    }
    const cards = page.locator("[aria-pressed]");
    if (await cards.count()) await cards.first().click();
    await page.waitForTimeout(400);

    /* 2回ぶんを、1つの動きの中で投げる */
    await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>(
        '[data-testid="primary-action"]',
      );
      node?.click();
      node?.click();
    });

    await expect(page.getByTestId("completion-view")).toBeVisible({
      timeout: 6000,
    });
    await expect(page.locator("main h1").first()).toHaveText("あなたの現在地", {
      timeout: 8000,
    });

    /* 1回ぶんだけ戻れば、5問目に着く */
    await page.evaluate(() => window.history.back());
    await expect(page.getByTestId("lesson-mission-count")).toContainText("5 / 5");
  });

  test("320×568 で送れるのは、枠を埋める2問だけ", async ({ page }) => {
    /*
      **いちばん狭い端末で、どこまでを「収める」と約束するか。**

      375×667 以上は全画面が送らずに収まる（`diagnosisSizes`）。
      320×568（iPhone SE 1st / 5s）だけは、質問3・4 が収まらない。

      収めようとして何が要るかを数えた。どちらも枠が3つ並ぶ回で、
      札は 11個・9個。札の当たりは 44px から下げられない（指で押せる
      最小）。字を縮めるのも、選択肢を減らすのも、場面の説明を削るのも
      **仕様が禁じている**——「文字の過度な縮小や overflow:hidden に
      よる切り捨ては禁止」「質問ごとの複数設問の仕様は維持する」。

      画面を分ける案も採らなかった。枠3つを2画面に割ると、**押す回数が
      全端末で2回増える**うえ、「1つのお願いを3つの枠で組み立てる」と
      いう問いの形そのものが崩れる。1機種のために、全員のテンポと
      問いの意味を落とすのは割に合わない。

      だから**送れることを認める。** ただし送っても壊れないことは
      約束する——下のボタンは動かない、見出しは先頭で見える、
      選んでも位置が動かない（そこが今回いちばん直したところ）。

      ここに書いてあるのは**決めごと**で、直し忘れではない。
    */
    await page.setViewportSize({ width: 320, height: 568 });
    await openDiagnosis(page);

    const scrollable = async () =>
      page.evaluate(() => {
        const stage = document.querySelector('[data-testid="step-stage"]');
        return stage ? stage.scrollHeight - stage.clientHeight : 0;
      });
    const ctaTop = async () =>
      page.evaluate(() =>
        Math.round(
          document
            .querySelector('[data-testid="primary-action"]')
            ?.getBoundingClientRect().top ?? -1,
        ),
      );

    const over: Record<string, number> = {};
    const seats: number[] = [];

    for (let q = 1; q <= 5; q += 1) {
      const heading = (await page.locator("main h1").first().innerText()).trim();
      over[heading] = await scrollable();
      seats.push(await ctaTop());

      /* 見出しは、送りの先頭で見えていること */
      const headTop = await page.evaluate(
        () => Math.round(document.querySelector("main h1")?.getBoundingClientRect().top ?? -1),
      );
      expect(headTop, `「${heading}」の見出しが画面の外`).toBeGreaterThan(0);

      if (!(await answerOne(page))) break;
      if (((await page.getByTestId("completion-view").count()) ||
      (await page.getByTestId("diagnosis-analyzing").count()))) break;
    }

    /* 送れるのは、枠を埋める2問だけ */
    const scrolls = Object.entries(over).filter(([, px]) => px > 8);
    expect(
      scrolls.map(([name]) => name).sort(),
      `送れる画面が想定と違う: ${JSON.stringify(over)}`,
    ).toEqual(["この場面なら、どう頼む？", "こんなとき、AIに何を頼む？"].sort());

    /*
      下のボタンは、どの問いでも同じ場所に座っている。**送れる画面でも
      動かない**——枠の外に置いてあるので、中身の量に左右されない。
    */
    expect(new Set(seats).size, `ボタンが動いている: ${seats.join(" / ")}`).toBe(1);
  });

  test("整理中は、読める長さ出ている", async ({ page }) => {
    /*
      1.8秒 → 2.8秒 と伸ばしてきて、実機では**まだ短い**と言われた。
      いまは 5 秒を目安にする（`Analyzing` の `FULL_MS`）。

      **秒数をここに書き写さない**——`Analyzing` の `TOTAL` を変えた日に、
      検査だけが古い数を守ることになる。見るのは「短すぎない」ことと
      「待たせすぎない」ことの幅。
    */
    await openDiagnosis(page);
    for (let guard = 0; guard < 8; guard += 1) {
      if (!(await answerOne(page))) break;
    }

    const shown = Date.now();
    await expect(page.getByTestId("diagnosis-analyzing")).toBeVisible({
      timeout: 4000,
    });
    await expect(page.locator("main h1").first()).toHaveText("あなたの現在地", {
      timeout: 10000,
    });
    const span = Date.now() - shown;

    expect(span, `整理中が ${span}ms しか出ていない`).toBeGreaterThan(4000);
    expect(span, `整理中が ${span}ms も出ている`).toBeLessThan(8000);
  });

  test("結果は、どの画面も送らずに収まる", async ({ page }) => {
    /*
      答えの長さで画面が伸びていた。実測で 390×844 の現在地が 42px、
      320×568 のおすすめが最大 182px あふれていた——**人によって
      出るかどうかが変わる**ので、1通り試しただけでは見つからない。

      隠して収めたのではない。詳しい根拠を**開いて読む一枚**へ移して、
      主画面には判断と次の一手だけを置いた。
    */
    await toResult(page);

    for (let guard = 0; guard < 4; guard += 1) {
      const heading = (await page.locator("main h1").first().innerText()).trim();
      await expectFits(page, heading);

      /* 詳しくを開いても、後ろは送れないまま */
      const more = page.getByTestId("diagnosis-reason-open");
      if (await more.count()) {
        await more.click();
        await expect(page.getByTestId("diagnosis-detail-sheet")).toBeVisible();
        const locked = await page.evaluate(
          () => getComputedStyle(document.body).overflow,
        );
        expect(locked, "一枚が開いているのに、後ろが送れる").toBe("hidden");
        await page.getByTestId("diagnosis-detail-close").click();
        await expect(page.getByTestId("diagnosis-detail-sheet")).toHaveCount(0);
      }

      if (heading.includes("おすすめ")) break;
      await page.getByTestId("primary-action").click();
      await page.waitForTimeout(900);
    }
  });

  test("現在地から、5段階の一覧を開ける", async ({ page }) => {
    /*
      **「Lv.2 って何？」の行き先を作る。**

      結果の画面には自分の段しか出ていない。5つ並べて初めて、いまが
      高いのか低いのかが分かる。ただし5つの説明を結果の画面へ置くと
      そのぶん縦に伸びるので、開いて読む一枚にする。
    */
    await toResult(page);
    await page.getByTestId("diagnosis-level-open").click();
    await expect(page.getByTestId("level-sheet")).toBeVisible();

    /* 5つそろっていること。一目で見比べるための一覧なので */
    await expect(page.getByTestId("level-list").locator("li")).toHaveCount(5);

    /* いまの段が1つだけ、はっきり分かること */
    await expect(page.getByTestId("level-here")).toHaveCount(1);

    /* 次に何をすれば上がるか。並べるだけの階級表にしない */
    await expect(page.getByTestId("level-next")).toBeVisible();

    /* 後ろは送れない。開いているあいだは一枚の中だけ */
    const locked = await page.evaluate(
      () => getComputedStyle(document.body).overflow,
    );
    expect(locked).toBe("hidden");
  });

  test("進み具合は、1行にまとまっている", async ({ page }) => {
    /*
      帯と「質問 4 / 5」は**同じひとつのこと**（いまどこ）を言って
      いる。2行に分けると、問いの画面でそこに 32px 使うことになり、
      その分がそのまま選択肢から引かれる（実測で 32px → 22px）。
    */
    await openDiagnosis(page);
    await answerOne(page);

    const shape = await page.evaluate(() => {
      const bar = document.querySelector("[data-testid='progress-segments']");
      const count = document.querySelector("[data-testid='lesson-mission-count']");
      if (!bar || !count) return null;
      const a = bar.getBoundingClientRect();
      const b = count.getBoundingClientRect();
      return {
        /* 同じ行に居るなら、縦の中心はほぼ重なる */
        apart: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2),
        countIsRight: b.left > a.right - 1,
      };
    });

    expect(shape, "帯か数が見つからない").not.toBeNull();
    expect(shape!.apart, "帯と数が別の行にある").toBeLessThanOrEqual(4);
    expect(shape!.countIsRight, "数が帯の右に無い").toBe(true);
  });

  test("Q4 は、枠どうしのほうが枠の中より離れている", async ({ page }) => {
    /*
      **3つの枠が3つに見えること。**

      前はどちらも 4px で、1つ目の枠の最後の札と2つ目の枠の名前が、
      中の札どうしと同じ距離にあった。どこまでが1つの場面なのかを、
      目で追って数えることになる。

      数そのものは書かない（余白を1px 変えるたびに落ちる）。
      **中より外が広い**という関係だけを見る。
    */
    await openDiagnosis(page);
    for (let at = 0; at < 3; at += 1) await answerOne(page);
    await expect(page.locator("main h1").first()).toHaveText(
      "こんなとき、AIに何を頼む？",
    );

    const gaps = await page.evaluate(() => {
      const parts = [
        ...document.querySelectorAll("[data-testid='assemble-part']"),
      ];
      const boxes = parts.map((one) => one.getBoundingClientRect());
      const between = boxes
        .slice(1)
        .map((box, at) => Math.round(box.top - boxes[at].bottom));
      const first = parts[0];
      const legend = first.querySelector("legend")!;
      const chip = first.querySelector("[data-testid='assemble-choice']")!;
      return {
        between,
        inside: Math.round(
          chip.getBoundingClientRect().top - legend.getBoundingClientRect().bottom,
        ),
      };
    });

    expect(gaps.between.length).toBe(2);
    for (const gap of gaps.between) {
      expect(gap, `枠のあいだ ${gap}px が、枠の中 ${gaps.inside}px より狭い`)
        .toBeGreaterThan(gaps.inside);
    }
  });

  test("一覧から、学習マップへ行ける", async ({ page }) => {
    /*
      **5段を眺めて終わりにしない。** 「次は Lv.3」を読んだ人が、
      そこへ行く道をその場で持つ。
    */
    await toResult(page);
    await page.getByTestId("diagnosis-level-open").click();
    await page.getByTestId("level-open-map").click();

    await expect(page.getByTestId("map-levels")).toBeVisible();
  });

  test("出た段を、地図の開始地点としてサーバーへ預ける", async ({ page }) => {
    /*
      **上げ下げを画面で決めない。** 受け直した診断が、実践問題を
      通って上がった段を取り消さないようにするのはサーバーの役目。
      ここで見るのは「出た数をそのまま送っていること」だけ。
    */
    const sent: string[] = [];
    await page.route("**/api/v1/rewards/level/", async (route) => {
      sent.push(route.request().postData() ?? "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ current_level: 2 }),
      });
    });

    await toResult(page);

    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThan(0);
    expect(JSON.parse(sent[0])).toHaveProperty("level");
  });

  test("一覧の段と、道の点は食い違わない", async ({ page }) => {
    /*
      **同じ数を2か所で数えない。**

      指示書に添えてあった画面では、道が「組み立て」（5段目）を
      指しているのに文字は「Level 2」だった。2つの数を別々に持つと
      いつか必ずこうなる。ここでは道の点と一覧の印が**同じ段**を
      指していることを見る。
    */
    await toResult(page);

    const here = await page
      .getByTestId("growth-node")
      .evaluateAll((nodes) =>
        nodes.findIndex((one) => (one as HTMLElement).dataset.state === "here"),
      );
    expect(here, "道のどこも光っていない").toBeGreaterThanOrEqual(0);

    await page.getByTestId("diagnosis-level-open").click();
    await expect(page.getByTestId("level-sheet")).toBeVisible();

    const marked = await page
      .getByTestId("level-list")
      .locator("li")
      .evaluateAll((rows) =>
        rows.findIndex((one) => (one as HTMLElement).dataset.here === "yes"),
      );

    expect(marked, "道の点と一覧の現在地がずれている").toBe(here);
  });

  test("端末の「戻る」で、一覧を閉じられる", async ({ page }) => {
    await toResult(page);
    await page.getByTestId("diagnosis-level-open").click();
    await expect(page.getByTestId("level-sheet")).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId("level-sheet")).toHaveCount(0);
    /* 閉じただけ。結果の画面から出ない */
    await expect(page.locator("main h1").first()).toHaveText("あなたの現在地");
  });

  /** 結果から「直す」を開いて、その回の編集に入る。 */
  async function toEdit(page: Page): Promise<void> {
    await page.getByTestId("diagnosis-reason-open").click();
    await expect(page.getByTestId("diagnosis-detail-sheet")).toBeVisible();
    await page.getByTestId("detail-next").click();
    await page.getByTestId("diagnosis-edit-answer").first().click();
    await expect(page.getByTestId("diagnosis-detail-sheet")).toHaveCount(0);
  }

  test("「直す」は、その回だけを編集する（次の問いへ行かない）", async ({ page }) => {
    /*
      **直すのは、診断をやり直す機能ではない。**

      前は `goTo` で問いへ移すだけだった。着いた先はふつうの問いの
      画面なので、直したあとは残りの問いをもう一度通る——5問目まで
      進み直して、また整理中を見て、やっと結果に戻る。直したいのは
      1つなのに、受け直したのと同じ手間がかかっていた。
    */
    await toResult(page);
    await toEdit(page);

    /* 編集中だと分かること。ふつうの問いと見た目が同じなので */
    await expect(page.getByText("回答を修正")).toBeVisible();
    await expect(page.getByTestId("primary-action")).toHaveText("変更を反映");
    await expect(page.getByRole("button", { name: "キャンセル" })).toBeVisible();

    await page.getByTestId("primary-action").click();

    /* 次の問いへは行かない。結果へ帰る */
    await expect(page.getByTestId("completion-view")).toBeVisible({
      timeout: 8000,
    });
    await expect(page.locator("main h1").first()).toHaveText("あなたの現在地");
  });

  test("直したあとの作り直しは、初回より短い", async ({ page }) => {
    /*
      初回は「診断を受けた」体験、直したあとは「すぐ反映された」体験。
      **秒数はここに書き写さない**——`Analyzing` の定数を変えた日に、
      検査だけが古い数を守ることになる。見るのは初回より短いこと。
    */
    const first = Date.now();
    await toResult(page);
    const firstSpan = Date.now() - first;

    await toEdit(page);
    const again = Date.now();
    await page.getByTestId("primary-action").click();
    await expect(page.getByTestId("diagnosis-analyzing")).toBeVisible();
    await expect(page.getByTestId("diagnosis-analyzing")).toHaveAttribute(
      "data-mode",
      "recalc",
    );
    await expect(page.getByTestId("completion-view")).toBeVisible({
      timeout: 8000,
    });
    const againSpan = Date.now() - again;

    expect(
      againSpan,
      `直したあとが ${againSpan}ms で、初回（${firstSpan}ms 以内）より短くない`,
    ).toBeLessThan(4000);
  });

  test("キャンセルすると、答えを変えずに結果へ帰る", async ({ page }) => {
    await toResult(page);
    const before = (
      await page.getByTestId("diagnosis-stage-reason").innerText()
    ).trim();

    await toEdit(page);

    /* いまと違う札を押しておく。キャンセルで元に戻るはず */
    const cards = page.locator("[aria-pressed]");
    const count = await cards.count();
    for (let at = 0; at < count; at += 1) {
      if ((await cards.nth(at).getAttribute("aria-pressed")) !== "true") {
        await cards.nth(at).click();
        break;
      }
    }

    await page.getByRole("button", { name: "キャンセル" }).click();
    await expect(page.getByTestId("completion-view")).toBeVisible();

    /*
      作り直しの1枚は通らない。何も変えていないのに「更新しています」と
      出るのは嘘になる。
    */
    await expect(page.getByTestId("diagnosis-analyzing")).toHaveCount(0);
    await expect(page.getByTestId("diagnosis-stage-reason")).toHaveText(before);
  });

  test("答えを変えると、ひし形も変わる", async ({ page }) => {
    await toResult(page);
    await toAxes(page);
    const before = await page
      .getByTestId("radar-chart")
      .locator("svg")
      .getAttribute("aria-label");

    await page.goBack();
    await expect(page.locator("main h1").first()).toHaveText("あなたの現在地");
    await toEdit(page);

    /* 最後の札を選ぶ。いちばん上の札とは点数が違う */
    const cards = page.locator("[aria-pressed]");
    const count = await cards.count();
    for (let at = count - 1; at >= 0; at -= 1) {
      if ((await cards.nth(at).getAttribute("aria-pressed")) !== "true") {
        await cards.nth(at).click();
        break;
      }
    }
    await page.getByTestId("primary-action").click();
    await expect(page.getByTestId("completion-view")).toBeVisible({
      timeout: 8000,
    });
    await toAxes(page);

    const after = await page
      .getByTestId("radar-chart")
      .locator("svg")
      .getAttribute("aria-label");
    expect(after, "答えを変えたのに、ひし形が同じ").not.toBe(before);
  });

  test("詳しくを閉じると、焦点が開いた場所へ戻る", async ({ page }) => {
    /*
      閉じたあとに焦点が body へ落ちると、キーボードで読んでいる人は
      **画面の先頭から辿り直す**ことになる。開いた場所へ返す。
    */
    await toResult(page);
    await page.getByTestId("diagnosis-reason-open").click();
    await expect(page.getByTestId("diagnosis-detail-sheet")).toBeVisible();
    await page.getByTestId("diagnosis-detail-close").click();

    const focused = await page.evaluate(
      () => document.activeElement?.getAttribute("data-testid") ?? "",
    );
    expect(focused).toBe("diagnosis-reason-open");
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
    await page.getByRole("button", { name: "コース" }).first().click();
    await page.getByTestId("current-course-open").click();
    await page.getByTestId("lesson-diagnosis").first().click();
    await dismissLessonIntro(page);
    await page.waitForTimeout(600);

    await expectFits(page, "診断の開始画面");

    /*
      **並んでいるものどうしが、離れていないこと。**

      一度、余りを上下へ配ったことがある（メタの下と道の下に伸びる
      隙間を置いた）。下だけに白が溜まると画面が途中で終わって見える、
      という理由だったが、実機で見ると**メタと道のあいだが空く**ほうが
      読みにくかった——「この3つの札はこの図の説明だ」というまとまりが、
      背の高い端末ほど薄くなる。

      いまは上から順に置き、余りは本文と下のボタンのあいだへ落とす。
      ここで見張るのは**要素どうしの間隔が端末で変わらない**こと。
    */
    const gap = await page.evaluate(() => {
      const meta = document.querySelector('[data-testid="diagnosis-meta"]');
      const card = document
        .querySelector('[data-testid="growth-track"]')
        ?.closest("section");
      if (!meta || !card) return null;
      return Math.round(
        card.getBoundingClientRect().top - meta.getBoundingClientRect().bottom,
      );
    });
    expect(gap, "メタと5段階カードのあいだが空きすぎている")
      .toBeLessThanOrEqual(32);

    /*
      5段階の名前が、カードの中に収まっていること。

      名前の並びを浮かせて（`absolute`）置いていたので、**この図の
      高さは線の太さ（4px）だけ**になり、丸と名前はカードの外へ
      ぶら下がっていた。
    */
    const spill = await page.evaluate(() => {
      const card = document
        .querySelector('[data-testid="growth-track"]')
        ?.closest("section");
      if (!card) return -1;
      const bottom = card.getBoundingClientRect().bottom;
      return [...document.querySelectorAll('[data-testid="growth-node"]')].filter(
        (node) => node.getBoundingClientRect().bottom > bottom + 1,
      ).length;
    });
    expect(spill, "5段階の名前がカードからはみ出している").toBe(0);

    /* 開始前に進捗バーは出さない */
    await expect(page.getByTestId("lesson-progress")).toHaveCount(0);

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
