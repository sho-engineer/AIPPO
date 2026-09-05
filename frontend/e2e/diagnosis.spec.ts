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

  test("結果は、読む前に図で分かる", async ({ page }) => {
    /*
      前はここが文字だけだった。見出しと短い文が縦に並ぶ形で、
      読むまで何も分からない——診断の結果としては遅い。
    */
    await openDiagnosis(page);
    for (let guard = 0; guard < 8; guard += 1) {
      if (!(await answerOne(page))) break;
    }

    // 開いた直後は道。5つの点でどこまで来たかを出す
    await expect(page.getByTestId("growth-track")).toBeVisible();
    await expect(page.getByTestId("growth-node")).toHaveCount(5);
    // 光る点は1つだけ。2つあると現在地が決められない
    await expect(page.locator("[data-testid='growth-node'][data-state='here']"))
      .toHaveCount(1);
    // 軸ごとの内訳は、まだ出さない（「くわしく見る」の中）
    await expect(page.getByTestId("axis-bar")).toHaveCount(0);

    await expect(
      page.getByTestId("diagnosis-strengths").getByRole("listitem"),
    ).toHaveCount(2);

    // 大きく出すおすすめは1本。ほかの候補は名前も出さない
    await expect(page.getByTestId("diagnosis-next-skill")).toBeVisible();
    await expect(page.getByTestId("diagnosis-lesson")).toHaveCount(1);
    await expect(page.getByTestId("diagnosis-also")).toHaveCount(0);

    await expect(page.getByTestId("primary-action")).toHaveText(/ここから始める/);
    await expect(
      page.getByRole("button", { name: "Day1から確認する" }),
    ).toBeVisible();
  });

  test("長い話は、開いた一枚のさらに奥だけ", async ({ page }) => {
    /*
      通常の画面に長文を置くと、読む画面になって次の一歩が遠くなる。
      開いた一枚の中だけは送ってよい。
    */
    await openDiagnosis(page);
    for (let guard = 0; guard < 8; guard += 1) {
      if (!(await answerOne(page))) break;
    }

    await expect(page.getByTestId("completion-view")).not.toContainText(
      "答えた内容",
    );
    await expect(page.getByTestId("completion-view")).not.toContainText(
      "次にやると良いこと",
    );

    await page.getByTestId("diagnosis-reason-open").click();

    /*
      1枚目は**補足**。切り替えと図と3行だけで、長い話は入れない。
      別ページのように見えると、開くこと自体が重くなる。
    */
    const sheet = page.getByTestId("diagnosis-reason-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-placement", "center");
    await expect(sheet).not.toContainText("答えた内容");
    await expect(sheet.getByTestId("axis-bar")).toHaveCount(0);

    await page.getByTestId("diagnosis-detail-open").click();
    const deep = page.getByTestId("diagnosis-detail-sheet");
    await expect(deep).toContainText("答えた内容");
    await expect(deep).toContainText("次にやると良いこと");
    await expect(deep.getByTestId("axis-bar")).toHaveCount(4);

    // Esc は、いちばん奥から順に閉じる
    await page.keyboard.press("Escape");
    await expect(deep).toHaveCount(0);
    await expect(sheet).toBeVisible();
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
      await expectFits(page, "結果画面");
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

  test("図は2通りから選べて、どちらも送らずに収まる", async ({ page }) => {
    /*
      ひし形（レーダー）のほうが縦に高い。ここを見ていないと、
      切り替えた人だけが送らないと下のボタンに届かない状態になる
      ——切り替えは押した人にしか起きないので、気づきにくい。
    */
    await page.setViewportSize({ width: 402, height: 660 });
    await openDiagnosis(page);
    for (let guard = 0; guard < 8; guard += 1) {
      if (!(await answerOne(page))) break;
    }
    await expect(page.getByTestId("completion-view")).toBeVisible();

    await expectFits(page, "結果（現在地）");

    await page.getByTestId("chart-tab-balance").click();
    await expect(page.getByTestId("radar-chart")).toBeVisible();
    // 片方ずつ。2つ同時には出さない
    await expect(page.getByTestId("growth-track")).toHaveCount(0);
    await page.waitForTimeout(600);
    await expectFits(page, "結果（スキルバランス）");

    // できていることは、切り替えても消えない
    await expect(
      page.getByTestId("diagnosis-strengths").getByRole("listitem"),
    ).toHaveCount(2);

    await page.getByTestId("chart-tab-stage").click();
    await expect(page.getByTestId("growth-track")).toBeVisible();
    await expect(page.getByTestId("radar-chart")).toHaveCount(0);
  });

  test("図を押すと、一枚の中で大きく開く", async ({ page }) => {
    /*
      結果の画面に置ける大きさは、いちばん低い持ち方（402×660）で
      送らずに収まる上限まで——ひし形は 92px 角しかなく、**読むには
      小さい**。収める都合と読める大きさは両立しないので、読みたい人
      には開いた一枚のほうで応える。
    */
    await page.setViewportSize({ width: 402, height: 660 });
    await openDiagnosis(page);
    for (let guard = 0; guard < 8; guard += 1) {
      if (!(await answerOne(page))) break;
    }

    // 画面に置くほうは小さい版。道は横に伸びるので、寸法は据え置き
    await expect(page.getByTestId("growth-track")).toHaveAttribute(
      "data-size",
      "sm",
    );
    await page.getByTestId("chart-expand").click();

    const sheet = page.getByTestId("diagnosis-reason-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("growth-track")).toHaveAttribute(
      "data-size",
      "lg",
    );

    // 中で切り替えたものが、閉じたあとの図にも残る
    await sheet.getByTestId("chart-tab-balance").click();
    await expect(sheet.getByTestId("radar-chart")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId("radar-chart")).toHaveAttribute(
      "data-size",
      "fluid",
    );
    await page.waitForTimeout(600);
    await expectFits(page, "結果（開いて閉じたあと）");
  });

  test("端末の「戻る」は、開いた一枚から順に閉じる", async ({ page }) => {
    /*
      ここがいちばん効く直し。

      このアプリは**画面**（TOP / HOME / LESSON …）を履歴に積んで
      いて、一枚（モーダル）は積んでいなかった。開いている最中に
      端末の「戻る」を押すと、一枚は無視されて画面ごと前へ移る
      ——閉じたいだけの人が、診断の外まで出されていた。

      いまは一枚が開くとき、画面はそのままの履歴を1つ積む。押された
      「戻る」はその1つを消費し、こちらは閉じるだけで済む。
      背面には何もしないので、図の切り替えも選んだ札もそのまま残る。
    */
    await openDiagnosis(page);
    for (let guard = 0; guard < 8; guard += 1) {
      if (!(await answerOne(page))) break;
    }

    // 図を切り替えてから開く。閉じたときに戻っていないことを見るため
    await page.getByTestId("chart-tab-balance").click();
    await page.getByTestId("chart-expand").click();
    await expect(page.getByTestId("diagnosis-reason-sheet")).toBeVisible();
    await page.getByTestId("diagnosis-detail-open").click();
    await expect(page.getByTestId("diagnosis-detail-sheet")).toBeVisible();

    /*
      押すのは端末の「戻る」。`page.goBack()` は使わない——あれは
      文書の読み込みを待つので、`pushState` だけで積んだ同じURLの
      履歴では待ち切れず、余分に戻ることがある（実際そうなった）。
      履歴を1つ戻すこと自体は、こちらのほうが正確に写せる。
    */
    const back = () => page.evaluate(() => window.history.back());

    // 1回目 … 奥の一枚だけ閉じる
    await back();
    await expect(page.getByTestId("diagnosis-detail-sheet")).toHaveCount(0);
    await expect(page.getByTestId("diagnosis-reason-sheet")).toBeVisible();

    // 2回目 … 一枚を閉じて、結果の画面へ。**切り替えは戻っていない**
    await back();
    await expect(page.getByTestId("diagnosis-reason-sheet")).toHaveCount(0);
    await expect(page.getByTestId("completion-view")).toBeVisible();
    await expect(page.getByTestId("chart-switch").first()).toHaveAttribute(
      "data-kind",
      "balance",
    );
  });

  test("×で閉じたあとも、「戻る」の数がずれない", async ({ page }) => {
    /*
      開くときに積んだ履歴は、×やEscで閉じたときにも戻す。戻さないと
      閉じたあとの1回目の「戻る」が空振りする（押しても何も起きない）。
    */
    await openDiagnosis(page);
    for (let guard = 0; guard < 8; guard += 1) {
      if (!(await answerOne(page))) break;
    }

    await page.getByTestId("chart-expand").click();
    await expect(page.getByTestId("diagnosis-reason-sheet")).toBeVisible();
    await page.getByTestId("diagnosis-reason-close").click();
    await expect(page.getByTestId("diagnosis-reason-sheet")).toHaveCount(0);

    // ここでの「戻る」は、診断そのものから出る（空振りしない）
    await page.evaluate(() => window.history.back());
    await page.waitForTimeout(400);
    await expect(page.getByTestId("completion-view")).toHaveCount(0);
  });

  test("添えたレッスンを押すと、その回が始まる", async ({ page }) => {
    /*
      押せる形にしてあるのに押せないと、見えているだけで届かない道になる。
      **診断を受けた記録も残ること**——ここを飛ばすと、受けたのに
      受けていないことになる（ホームのおすすめが既定のまま戻る）。
    */
    await openDiagnosis(page);
    for (let guard = 0; guard < 8; guard += 1) {
      if (!(await answerOne(page))) break;
    }

    await page.getByTestId("diagnosis-also-open").click();
    const also = page.getByTestId("diagnosis-also-pick").first();
    const label = (await also.innerText()).replace(/\s+/g, "");
    await also.click();

    // 診断から出て、そのレッスンが開いている
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
      帯は診断のあいだじゅう出しておく。**結果の画面でも。**

      結果を読んで「さっきの問いは何と答えたっけ」と思う人はいるし、
      おすすめを取らずに戻りたい人もいる。ここで帯を消すと、
      画面の中のボタン2つ以外に行き先が無くなる。

      そして結果の「×」では確かめない。「診断を終了しますか？」は
      **途中でやめる人**への一言で、答え終わった人には当てはまらない。
    */
    await openDiagnosis(page);
    for (let guard = 0; guard < 8; guard += 1) {
      if (!(await answerOne(page))) break;
    }
    await expect(page.getByTestId("completion-view")).toBeVisible();

    await expect(page.getByTestId("lesson-back")).toBeVisible();
    await expect(page.getByTestId("lesson-exit")).toBeVisible();

    // ←は最後の問いへ戻す。行き止まりにしない
    await page.getByTestId("lesson-back").click();
    await expect(page.getByTestId("completion-view")).toHaveCount(0);
    await expect(page.locator("[aria-pressed='true']").first()).toBeVisible();

    // 戻って結果へ着き直し、そこから×で出る（たしかめは挟まない）
    await page.getByTestId("primary-action").click();
    await expect(page.getByTestId("completion-view")).toBeVisible();
    await page.getByTestId("lesson-exit").click();
    await expect(page.getByTestId("diagnosis-leave-sheet")).toHaveCount(0);
    await expect(page.getByTestId("tab-bar")).toBeVisible();
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
    // 降りる道も、進む道のすぐ下にある
    await expect(
      page.getByRole("button", { name: "診断せずに始める" }),
    ).toBeVisible();
  });
});
