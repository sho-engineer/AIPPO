/**
 * Day2「長い文章を短くまとめる」の通し。
 *
 * 見るのは、段ごとに条件を1つ足していく形が**実際に起きること**。
 *
 *     ① 条件なしで1回     … ここが比べる基準
 *     ② ＋出力形式        … 3つの箇条書きで
 *     ③ ＋読む人と目的    … 判断する上司向けに
 *     ④ 自分の文章に3つ   … 組み上げたものを、自分の題材へ
 *
 * 2本通す
 * -------
 * 台本（`qa-acceptance.md`）が求めているのは2つの道——**自分の文章を
 * 入れる人**と、**手元に無くて例文を使う人**。どちらも最後まで
 * 行けることを、別々に通す。
 *
 * 実APIは呼ばない。AI の揺れを持ち込むと、落ちたときに「壊れたのか、
 * AI の気分なのか」が分からなくなる。返す文は台本の Reference Output
 * をそのまま使う（`sample-materials.yaml`）。
 *
 * 第1リリースでは準備中
 * ---------------------
 * Day2 はまだ開いていない（`release_seeding.py` の
 * RELEASE_COMING_SOON）。検査のあいだだけ開ける——公開状態そのものは
 * `e2e/releaseGate.spec.ts` が別に見る。
 */

import { expect, test, type Page } from "@playwright/test";

import { openLessonById } from "./support/openLesson";
import { stubApi } from "./support/stubApi";

/** 台本の Reference Output。教材が期待している返り方をそのまま使う。 */
const BASIC =
  "社内調査では、情報検索の難しさや複数ツールへの重複入力が課題として挙がりました。" +
  "新しい情報共有ツールには多くの社員が前向きですが、操作やデータ移行への不安もあります。" +
  "まず営業部で1か月試験導入し、効果を確認する案が検討されています。";

const THREE_BULLETS = [
  "・情報を探す時間と、複数ツールへの重複入力が課題",
  "・新ツールには前向きな意見が多いが、操作や移行への不安もある",
  "・営業部20名で1か月試し、検索時間と利用率を確認する予定",
].join("\n");

const FOR_MANAGER = [
  "・68％が情報検索に時間がかかると回答し、54％が複数ツールへの重複入力を経験",
  "・新ツールの導入には62％が前向きだが、操作習得とデータ移行への不安がある",
  "・営業部20名で1か月試験導入し、検索時間と利用率を基に全社展開を判断する案",
].join("\n");

const OWN_RESULT = [
  "・営業部は資料の共有方法を変えたいと考えている",
  "・管理部は開催時間の短縮を求めている",
  "・次回までに方針を決める必要がある",
].join("\n");

const MY_TEXT =
  "来月の全社会議について、各部門から出た意見をまとめました。" +
  "営業部は資料の共有方法を変えたいと述べ、管理部は開催時間の短縮を求めています。" +
  "企画部からは事前アンケートの実施案が出ました。次回までに方針を決める必要があります。";

/** 何回目の生成かで、台本どおりに返す。 */
function replies(call: number): string {
  if (call === 1) return BASIC;
  if (call === 2) return THREE_BULLETS;
  if (call === 3) return FOR_MANAGER;
  return OWN_RESULT;
}

async function openDay2(page: Page, options: { fail?: number } = {}) {
  const api = await stubApi(page, {
    result: (call) => replies(call),
    ...(options.fail ? { failStatus: 503, failOnCall: options.fail } : {}),
  });
  await openLessonById(page, "summarize_text");
  return api;
}

/** 押す先を1つだけ追って、次の画面へ。答えが要る回は、その場で埋める。 */
async function step(page: Page, fill?: () => Promise<void>) {
  const primary = page.getByTestId("primary-action").first();
  if ((await primary.getAttribute("aria-disabled")) === "true") {
    if (fill) await fill();
    else await page.locator("main [aria-pressed]").first().click();
    await page.waitForTimeout(150);
  }
  await primary.click({ force: true });
  await page.waitForTimeout(400);
}

/** いまの見出し。 */
const heading = (page: Page) => page.locator("main h1").first();

/**
 * その見出しの画面まで、押す先を1つだけ追って進む。
 *
 * **履歴で戻らない。** 戻ってから確かめると、見ているのは「戻った
 * ときの画面」であって、通ってきたときの画面ではない。
 */
async function toScreen(page: Page, title: string) {
  for (let guard = 0; guard < 30; guard += 1) {
    if ((await heading(page).innerText()).replace(/\s+/g, "") === title) return;
    await step(page);
  }
  await expect(heading(page)).toHaveText(title);
}

/** 3つの段を通って、自分の文章の回（Section 4）まで行く。 */
async function toOwnText(page: Page) {
  await step(page); // 今日つくるもの
  await step(page); // 章扉①
  await step(page); // 調査資料 → 短くまとめる
  await step(page); // 1回目の結果
  await step(page); // 要約
  await step(page); // 章扉②
  await step(page); // 形を足す
  await step(page); // 3つの要点になった
  await step(page); // 出力形式の指定
  await step(page); // 章扉③
  await step(page); // 読む人と目的を足す
  await step(page); // 判断材料が残った
  await step(page); // コンテキスト
  await step(page); // 章扉④
  await expect(heading(page)).toHaveText("まとめたい文章を用意しよう");
}

/** 条件を3つ選んで送り、仕上がりの画面まで。 */
async function toOwnResult(page: Page) {
  await step(page); // 読む人
  await step(page); // 目的
  await step(page); // 形
  await step(page); // AIへの指示 → 送る
  await expect(heading(page)).toHaveText("使える要約ができた");
}

test.setTimeout(180_000);

test.describe("Day2 の通し", () => {
  test("**例文で、最後まで通せる**", async ({ page }) => {
    /*
      手元に長い文章が無い日でも終われること。ここが通らないと、
      最後の段は「自分の文章がある人だけの回」になる。
    */
    const api = await openDay2(page);
    await toOwnText(page);

    // 例文を使う。空のままでは送れない
    await expect(page.getByTestId("primary-action")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.getByRole("button", { name: "例文を使う" }).click();
    await expect(page.getByTestId("primary-action")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await step(page);
    await toOwnResult(page);
    await step(page); // 3つのAI技をGET！
    await expect(page.getByTestId("skill-recap-count")).toHaveText("3 / 3");

    await step(page); // 完了画面
    await expect(page.getByTestId("completion-view")).toBeVisible();
    expect(api.calls).toHaveLength(4);
  });

  test("**自分の文章で、最後まで通せる**", async ({ page }) => {
    const api = await openDay2(page);
    await toOwnText(page);

    await page.locator("textarea:visible").first().fill(MY_TEXT);
    await step(page);
    await toOwnResult(page);

    // 送ったのは自分の文章。例文に差し替わっていない
    expect(api.calls[3].input.original_text).toBe(MY_TEXT);

    await step(page);
    await step(page);
    await expect(page.getByTestId("completion-view")).toBeVisible();
  });

  test("条件は、段ごとに1つずつ積み上がる", async ({ page }) => {
    /*
      **前の条件を捨てない。** 捨てると、3回目に起きた変化が
      「目的を足したから」なのか「形が外れたから」なのか分からない。
    */
    const api = await openDay2(page);
    await toOwnText(page);

    expect(api.calls).toHaveLength(3);
    // ① 条件なし。ここが比べる基準になる
    expect(api.calls[0].input.format ?? "").toBe("");
    expect(api.calls[0].input.purpose ?? "").toBe("");
    // ② 形だけ
    expect(api.calls[1].input.format).toBe("3つの箇条書きで");
    expect(api.calls[1].input.purpose ?? "").toBe("");
    // ③ 形はそのまま、読む人と目的が足される
    expect(api.calls[2].input.format).toBe("3つの箇条書きで");
    expect(api.calls[2].input.purpose).toBe(
      "新しいツールを試すか判断する上司向けに",
    );
    // 4回とも同じ頼み方
    expect(api.calls.map((call) => call.action)).toEqual([
      "summarize",
      "summarize",
      "summarize",
    ]);
  });

  test("自分の文章の回は、選んだ3つがそのまま送られる", async ({ page }) => {
    const api = await openDay2(page);
    await toOwnText(page);
    await page.locator("textarea:visible").first().fill(MY_TEXT);
    await step(page);
    await toOwnResult(page);

    const sent = api.calls[3].input;
    expect(sent.audience).toBeTruthy();
    expect(sent.purpose).toBeTruthy();
    expect(sent.format).toBeTruthy();
    /*
      固定の題材で選んだ条件を持ち込まない。最後の段は自分で選び直す
      （教材データの鍵が別にしてある）。
    */
    expect(sent.purpose).not.toBe("新しいツールを試すか判断する上司向けに");
  });
});

test.describe("比べ方", () => {
  test("1回目は比べない。返ってきたまとめだけを出す", async ({ page }) => {
    await openDay2(page);
    await toScreen(page, "大事な内容が短くなった");

    // まだ何も足していないので、「何を変えた？」は出ない
    await expect(page.getByTestId("changed-condition")).toHaveCount(0);
    await expect(page.getByTestId("result-compare")).toBeVisible();
  });

  test("何を変えた・どう変わった・代表例が、この順で出る", async ({ page }) => {
    /*
      画像で説明しない。**実際に返ってきた2つの文章から**取り出す
      （`course/changePairs.ts`）。固定の例文にすると、その人の結果に
      出ていない変化を「変わったところ」として見せることになる。
    */
    await openDay2(page);
    await toScreen(page, "3つの要点になった");

    await expect(page.getByTestId("changed-condition")).toContainText(
      "3つの箇条書きで",
    );
    await expect(page.getByTestId("change-note")).toContainText(
      "要点を素早く確認できる形になった",
    );
    // 代表例は、実際の2つのまとめから取れたもの
    await expect(page.getByTestId("change-pairs")).toBeVisible();
    /*
      比べる相手は**1つ前のまとめ**。元の調査資料と比べていたら、
      対が取れずに「全体が書き直されました」だけになる。
    */
    await expect(page.getByTestId("change-pairs-empty")).toHaveCount(0);
  });

  test("上司向けの段では、判断に使う数字が残る", async ({ page }) => {
    /*
      台本がこの段に求めているのは「判断材料が残ること」。
      画面へ出たものの中に、数字がそのまま載っていること。
    */
    await openDay2(page);
    await toScreen(page, "判断材料が残った");

    await expect(page.getByTestId("changed-condition")).toContainText(
      "新しいツールを試すか判断する上司向けに",
    );
    await page.getByTestId("open-full-text").click();
    const sheet = page.getByTestId("full-text-sheet");
    for (const fact of ["68％", "54％", "62％", "20名", "1か月"]) {
      await expect(sheet, `「${fact}」が残っていない`).toContainText(fact);
    }
  });

  test("長い文章は、カードの中で送らせない", async ({ page }) => {
    /*
      300字の調査資料を面の中で送らせると、行の途中で切れる。
      頭だけ出して、全文は別の一枚で読む。
    */
    await openDay2(page);
    await toScreen(page, "社内の情報共有に関する調査");

    // 架空の資料だと分かる名札が付いている
    await expect(page.getByTestId("source-preview")).toContainText(
      "Lesson用サンプル",
    );

    const scrollable = await page.evaluate(() => {
      const box = document.querySelector("[data-testid='source-preview']");
      if (!box) return -1;
      return box.scrollHeight - box.clientHeight;
    });
    expect(scrollable).toBeLessThanOrEqual(1);
  });
});

test.describe("やり直せる", () => {
  test("結果から条件へ戻れ、入れた文章も選んだ条件も残る", async ({ page }) => {
    const api = await openDay2(page);
    await toOwnText(page);
    await page.locator("textarea:visible").first().fill(MY_TEXT);
    await step(page);
    await toOwnResult(page);

    const before = api.calls[3].input;

    await page.getByRole("button", { name: "条件を直す" }).click();
    await expect(heading(page)).toHaveText("誰が読みますか？");
    // さっき選んだものが、選ばれたまま残っている
    await expect(page.locator("[aria-pressed='true']").first()).toBeVisible();

    /*
      条件を**変えて**から進む。

      変えずに押し切ったときは、同じ内容をもう一度送らない
      （`useCourseLesson` の `reuse`）——待たされるうえ、費用も倍に
      なる。ここで見たいのは「直した条件で、同じ文章がもう一度
      まとまる」ほうなので、1つ選び直す。
    */
    const choices = page.locator("main [aria-pressed]");
    const at = await choices.count();
    for (let index = 0; index < at; index += 1) {
      if ((await choices.nth(index).getAttribute("aria-pressed")) === "false") {
        await choices.nth(index).click();
        break;
      }
    }
    await page.waitForTimeout(200);

    await step(page);
    await step(page);
    await step(page);
    await step(page); // もう一度送る

    await expect(heading(page)).toHaveText("使える要約ができた");
    expect(api.calls).toHaveLength(5);
    // 文章は消えていない
    expect(api.calls[4].input.original_text).toBe(before.original_text);
  });

  test("自分の文章を飛ばしても、空のまま送らない", async ({ page }) => {
    /*
      「今回はスキップする」の先には、入れたはずの文章を送る画面が
      並んでいる。1歩進めるだけだと、条件を選ばされ、確認まで来て
      **空の本文を AI へ送る**ことになる——本物のサーバーは本文の無い
      依頼を弾くので、飛ばした人だけが自分のせいではない失敗の画面に出る。

      飛ぶ先は教材が持つ（`meta.skipTo`）。
    */
    const api = await openDay2(page);
    await toOwnText(page);
    const before = api.calls.length;

    await page.getByRole("button", { name: "今回はスキップする" }).click();
    await page.waitForTimeout(400);

    // 技を受け取るところへ出る。途中の条件も送信も挟まらない
    await expect(heading(page)).toHaveText("3つのAI技をGET！");

    await step(page);
    await expect(page.getByTestId("completion-view")).toBeVisible();
    expect(api.calls, "飛ばしたのに送っている").toHaveLength(before);
  });

  test("AIが落ちても、入れた文章は消えない", async ({ page }) => {
    const api = await openDay2(page, { fail: 4 });
    await toOwnText(page);
    await page.locator("textarea:visible").first().fill(MY_TEXT);
    await step(page);
    await step(page);
    await step(page);
    await step(page);
    await step(page); // ここで失敗する

    await expect(page.getByTestId("failure-rescue")).toBeVisible();
    expect(api.calls).toHaveLength(4);

    // 押し直せば、同じ文章のまま送り直せる
    await page.getByTestId("rescue-retry").click();
    await page.waitForTimeout(600);
    expect(api.calls[api.calls.length - 1].input.original_text).toBe(MY_TEXT);
  });
});

test.describe("終わり方", () => {
  test("3つの技を受け取り、Homeへ戻る（Day3は自動で始まらない）", async ({
    page,
  }) => {
    await openDay2(page);
    await toOwnText(page);
    await page.getByRole("button", { name: "例文を使う" }).click();
    await step(page);
    await toOwnResult(page);

    await step(page);
    await expect(page.getByTestId("skill-recap")).toContainText("要約");
    await expect(page.getByTestId("skill-recap")).toContainText("出力形式の指定");
    await expect(page.getByTestId("skill-recap")).toContainText("コンテキスト");

    await step(page);
    await expect(page.getByTestId("completion-view")).toBeVisible();

    await page.getByTestId("primary-action").first().click();

    /*
      押した先は「今日ここまで」の画面。**次の1本は始まっていない。**

      行き先を自分で選ぶ形にしてある——押さなければ、Day3 は
      始まらない（帯の題は Day2 のまま）。
    */
    await expect(page.getByTestId("day-complete")).toBeVisible();
    await expect(page.getByTestId("lesson-header")).toContainText(
      "長い文章を短くまとめる",
    );

    // 出口があること。押すと、レッスンの外へ出る
    await page.getByTestId("day-complete-back").click();
    await expect(page.getByTestId("day-complete")).toHaveCount(0);
  });
});

test.describe("スマホの見え方", () => {
  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [430, 932],
  ]) {
    test(`${width}×${height} で、横にはみ出さない`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "mobile", "スマホの見え方だけ見る");
      await page.setViewportSize({ width, height });

      await openDay2(page);
      const seen: string[] = [];

      for (let guard = 0; guard < 30; guard += 1) {
        const title = (await heading(page).innerText().catch(() => "")).replace(
          /\s+/g,
          "",
        );
        if (title) seen.push(title);

        /*
          横は1pxも許さない。縦は `step-stage` が送れる（画面の逃げ道）
          が、横に送れるのは**作りが壊れている**ときだけ。
        */
        const wide = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(wide, `${width}×${height}「${title}」が ${wide}px 横へ出ている`)
          .toBeLessThanOrEqual(1);

        /*
          面の中で送らせない。送ってよいのは `step-stage` だけで、
          その中のカードが自前の送りを持ったら作りが崩れている。

          入力欄（textarea）は別。あれは利用者が書く場所なので、
          長く書けば中で送れて当たり前。
        */
        const nested = await page.evaluate(() => {
          const bad: string[] = [];
          for (const el of document.querySelectorAll("main *")) {
            if (el.tagName === "TEXTAREA") continue;
            const style = getComputedStyle(el);
            if (!/auto|scroll/.test(style.overflowY)) continue;
            if (el.getAttribute("data-testid") === "step-stage") continue;
            if (el.scrollHeight > el.clientHeight + 1) {
              bad.push(el.getAttribute("data-testid") ?? el.tagName);
            }
          }
          return bad;
        });
        expect(nested, `${width}×${height}「${title}」でカードの中が送れる`)
          .toEqual([]);

        /*
          押せる部品が、ほかのものに覆われていないこと。

          縦に縮む面の中に「縮まないもの」が並んでいると、面ごと
          押し潰されて**中身が箱の外へはみ出し、下の注意書きが
          ボタンの上へ重なる**（320×568 で実測。「全文を見る」が
          23px 隠れていた）。見えているのに押せない部品は、
          押す場所が無いのと同じ。
        */
        const covered = await page.evaluate(() => {
          const hidden: string[] = [];
          for (const el of document.querySelectorAll("main button:not([disabled])")) {
            /*
              畳んである中身は見ない。閉じた `<details>` の中の
              ボタンは、**押せないのが正しい**（開けば押せる）。
            */
            const fold = el.closest("details");
            if (fold && !fold.open && !el.closest("summary")) continue;

            const box = el.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) continue;
            const x = box.left + box.width / 2;
            const y = box.top + box.height / 2;
            if (y < 0 || y > window.innerHeight) continue;

            /*
              送る先にあるものは見ない。**送れば出てくる**もので、
              覆われているのとは違う（`step-stage` が画面の逃げ道）。
              見たいのは「いま見えている場所にあるのに押せない」もの。
            */
            const stage = el.closest("[data-testid='step-stage']");
            if (stage) {
              const view = stage.getBoundingClientRect();
              if (y < view.top || y > view.bottom) continue;
            }
            const top = document.elementFromPoint(x, y);
            if (top && !el.contains(top) && !top.contains(el)) {
              hidden.push((el.textContent ?? "").trim().slice(0, 12));
            }
          }
          return hidden;
        });
        expect(covered, `${width}×${height}「${title}」で覆われている押し場所`)
          .toEqual([]);

        // 押す場所は、いつでも画面の中にある
        const cta = page.getByTestId("primary-action").first();
        if (!(await cta.count())) break;
        const box = await cta.boundingBox();
        expect(box, `${title} で押す場所が見えない`).not.toBeNull();
        expect(
          box!.y + box!.height,
          `${width}×${height}「${title}」で押す場所が画面の外`,
        ).toBeLessThanOrEqual(height + 1);

        if (await page.getByTestId("completion-view").count()) break;
        await step(page, async () => {
          const box_ = page.locator("textarea:visible").first();
          if (await box_.count()) await box_.fill(MY_TEXT);
          else await page.locator("main [aria-pressed]").first().click();
        });
      }

      await expect(page.getByTestId("completion-view")).toBeVisible();
      expect(seen.length, "通せていない").toBeGreaterThan(10);
    });
  }
});
