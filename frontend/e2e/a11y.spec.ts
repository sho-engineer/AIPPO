import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/**
 * アクセシビリティの自動検査。
 *
 * 目視では気づけないもの（コントラスト不足、名前の無いボタン、
 * 見出しの飛び、読み上げに届かない更新）を機械に拾わせる。
 *
 * 対象は WCAG 2.1 の A / AA。市場に出すなら最低限ここは満たす。
 * 自動検査で拾えるのは全体の一部だが、拾えるものを見逃さないための土台。
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * 動きが終わるのを待つ。
 *
 * 画面が変わるとき、中身は薄い状態から浮かび上がってくる（animate-slide-in）。
 * その途中で測ると、文字の色が下地と混ざった色として読まれ、
 * 出ていないコントラスト不足が出たことになる。
 * 実際に人が読むのは動きが終わったあとなので、そこで測る。
 */
async function settle(page: Page) {
  await page.evaluate(async () => {
    // ずっと続く動き（ポーがゆれるなど）は終わりを待てない。
    // 一度きりの動きだけを待ち、念のため上限も置く。
    const once = document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getComputedTiming();
      return timing !== undefined && timing.iterations !== Infinity;
    });

    await Promise.race([
      Promise.all(once.map((animation) => animation.finished.catch(() => undefined))),
      new Promise((resolve) => window.setTimeout(resolve, 1500)),
    ]);
  });
}

async function scan(page: Page) {
  await settle(page);
  return new AxeBuilder({ page }).withTags(TAGS).analyze();
}

/** 違反を読める形にする。件数だけでは直せない。 */
function describe(violations: Awaited<ReturnType<typeof scan>>["violations"]) {
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help}\n` +
        v.nodes
          .map(
            (n) =>
              `    ${n.target.join(" ")}\n` +
              `      ${(n.failureSummary ?? "").replace(/\n/g, "\n      ")}`,
          )
          .join("\n"),
    )
    .join("\n");
}

async function openCourse(page: Page) {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  // 「はじめる」の行き先はホーム。レッスンの一覧は下タブの「教材一覧」にある
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await page.getByRole("button", { name: "教材一覧" }).click();
  await expect(page.getByTestId("lesson-rewrite_text")).toBeVisible();
}

async function next(page: Page) {
  await page.getByTestId("primary-action").click();
}

/**
 * 結果の画面（1回目の結果を見ながら観察するところ）まで進める。
 *
 * 最初の1回は相手を選ぶだけで送れる。ここが結果を最初に見る画面になる。
 */
async function openResult(page: Page) {
  await openCourse(page);
  await page.getByTestId("lesson-rewrite_text").click();
  await next(page); // 完成イメージ
  await page.getByRole("button", { name: "上司", exact: true }).click();
  await next(page); // 送る → 生成 → 観察
  await expect(page.getByTestId("result-compare")).toBeVisible();
}

/** 文章を打ち込む画面（自分の文章）まで進める。 */
async function openLesson(page: Page) {
  await openResult(page);
  await next(page); // 観察 → 解説1
  await next(page);
  await next(page);
  await next(page); // 解説3 → 条件を足す
  await page.getByRole("button", { name: "もっと短く", exact: true }).click();
  await next(page); // 送る → 見比べ
  await next(page); // 見比べ → 安全の確認
  await next(page); // 安全の確認 → 自分の文章
  await expect(page.getByRole("textbox")).toBeVisible();
}

test.describe("アクセシビリティ", () => {
  test("トップ画面", async ({ page }) => {
    await stubApi(page);
    await page.goto("/");

    const { violations } = await scan(page);
    expect(describe(violations)).toBe("");
  });

  test("コース一覧", async ({ page }) => {
    await stubApi(page);
    await openCourse(page);

    const { violations } = await scan(page);
    expect(describe(violations)).toBe("");
  });

  test("レッスンの入力画面", async ({ page }) => {
    await stubApi(page);
    await openLesson(page);

    const { violations } = await scan(page);
    expect(describe(violations)).toBe("");
  });

  test("結果の比較画面", async ({ page }) => {
    await stubApi(page);
    await openResult(page);

    const { violations } = await scan(page);
    expect(describe(violations)).toBe("");
  });

  test("送信前の確認（機密チェック）", async ({ page }) => {
    // 割り込んで出す画面ほど、読み上げから外れやすい
    await stubApi(page);
    await openLesson(page);
    await page
      .getByRole("textbox")
      .fill("連絡先は tanaka@example.co.jp です。ご確認をお願いします。");
    await next(page); // 自分の文章 → 誰が読みますか
    await next(page); // → どう変えたいですか
    await next(page); // → AIにはこう伝えます
    await next(page); // 送る
    await expect(page.getByTestId("privacy-dialog")).toBeVisible();

    const { violations } = await scan(page);
    expect(describe(violations)).toBe("");
  });

  test("キーボードだけでレッスンを始められる", async ({ page }) => {
    // マウスを使えない人が最初の一歩で詰まらないこと
    await stubApi(page);
    await page.goto("/");

    // ボタンの見た目には矢印などが混ざる。実際の中身と突き合わせる
    const start = page.getByRole("button", { name: "はじめる" }).first();
    const startLabel = (await start.textContent())?.trim() ?? "";

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const label = await page.evaluate(
        () => document.activeElement?.textContent?.trim() ?? "",
      );
      if (label === startLabel) break;
    }

    const focused = await page.evaluate(
      () => document.activeElement?.textContent?.trim() ?? "",
    );
    expect(focused, "「はじめる」までタブで到達できない").toBe(startLabel);

    await page.keyboard.press("Enter");
    // 押した先はホーム。そこから続きへ入るボタンが出ていること
    await expect(page.getByTestId("progress-summary")).toBeVisible();
    await expect(page.getByTestId("continue-lesson")).toBeVisible();
  });

  test("ポーが画面の外へはみ出さない", async ({ page }) => {
    // はみ出すと発言が読めず、ポー自身も見えなくなる。
    // 発言が長いときに起きるので、長めの発言で確かめる。
    await stubApi(page, {
      tutor: {
        message:
          "読む相手を伝えると、AIの直し方が変わります。" +
          "たとえば「社外のお客様に」「ていねいに」「3行くらいで」のように、" +
          "相手と言い方と長さをまとめて伝えてみましょう。",
      },
    });
    await openResult(page);

    const viewport = page.viewportSize()!;
    const box = (await page.getByTestId("po-avatar").boundingBox())!;

    expect(box.x, "左へはみ出している").toBeGreaterThanOrEqual(-1);
    expect(
      box.x + box.width,
      "右へはみ出していて発言が読めない",
    ).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.height, "縦に伸びすぎて下の内容を覆う").toBeLessThan(
      viewport.height * 0.5,
    );

    // ポー自身も見えていること
    const poeImage = page.getByAltText("AIPPOの案内役 ポー");
    const imageBox = (await poeImage.boundingBox())!;
    expect(imageBox.x + imageBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(imageBox.width).toBeGreaterThan(0);
  });

  test("ポーが「次にやること」を覆わない", async ({ page }) => {
    // 覆われると、次の一手が見えなくなる（憲章 原則 I）。
    // 画面を一番下までスクロールした状態が一番きわどい。
    await stubApi(page);
    await openLesson(page);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const action = page.getByTestId("primary-action");
    const actionBox = (await action.boundingBox())!;
    const poeBox = (await page.getByTestId("po-avatar").boundingBox())!;

    const overlaps =
      actionBox.x < poeBox.x + poeBox.width &&
      actionBox.x + actionBox.width > poeBox.x &&
      actionBox.y < poeBox.y + poeBox.height &&
      actionBox.y + actionBox.height > poeBox.y;

    expect(overlaps, "ポーが次にやることを覆っている").toBe(false);
  });

  test("動きを減らす設定のときは動かさない", async ({ page }) => {
    // 動きで気分が悪くなる人がいる。端末の設定に必ず従う。
    await page.emulateMedia({ reducedMotion: "reduce" });
    await stubApi(page);
    await page.goto("/");

    await expect(page.getByAltText("AIPPOの案内役 ポー")).toBeVisible();

    const moving = await page.evaluate(() =>
      [...document.querySelectorAll("*")]
        .map((el) => getComputedStyle(el).animationDuration)
        .filter((d) => parseFloat(d) > 0.05),
    );
    expect(moving, `${moving.length} 個がまだ動いている`).toEqual([]);

    // 止めた結果、遅らせて出していたものが消えてしまわないこと
    await expect(
      page.getByRole("button", { name: "はじめる" }).first(),
    ).toBeVisible();
  });

  test("タイトル画面が最初の1画面に収まる", async ({ page }) => {
    // ゲームのタイトル画面として作っている以上、
    // スクロールしないと始められないのでは形になっていない。
    await stubApi(page);
    await page.goto("/");

    const viewport = page.viewportSize()!;
    const start = page.getByRole("button", { name: "はじめる" }).first();
    const box = (await start.boundingBox())!;

    expect(
      box.y + box.height,
      "スクロールしないと「はじめる」が見えない",
    ).toBeLessThanOrEqual(viewport.height);

    // ロゴとポーも、同じ1画面の中に収まっていること
    for (const target of [
      page.getByTestId("brand-logo"),
      page.getByAltText("AIPPOの案内役 ポー"),
    ]) {
      const targetBox = (await target.boundingBox())!;
      expect(targetBox.y + targetBox.height).toBeLessThanOrEqual(
        viewport.height,
      );
    }

    // 下の2行が重ならないこと。
    // 送り先の案内を画面の下端へ貼り付けていたときは、
    // 縦 800px 前後の画面で注記と重なって文字が二重になっていた。
    const hint = (await page.getByText(/登録は必要ありません/).boundingBox())!;
    const cue = (await page.getByText(/この先に、やることが3つ/).boundingBox())!;
    expect(cue.y, "注記と送り先の案内が重なっている").toBeGreaterThanOrEqual(
      hint.y + hint.height,
    );
  });

  test("丸ゴシックが実際に使われている", async ({ page }) => {
    // 読み込みに失敗しても、端末のフォントで表示されてしまうので気づけない。
    // 「用意したファイルが実際に使われたか」を確かめる。
    const fontRequests: string[] = [];
    page.on("response", (res) => {
      if (res.url().includes("/fonts/") && res.status() === 200) {
        fontRequests.push(res.url());
      }
    });

    await stubApi(page);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);

    expect(fontRequests.length, "フォントが読み込まれていない").toBeGreaterThan(0);

    const used = await page.evaluate(() =>
      getComputedStyle(document.body).fontFamily,
    );
    expect(used).toContain("Zen Maru Gothic");

    // 端末に無い場合に備えて、代わりの丸ゴシックが並んでいること
    expect(used).toContain("Hiragino Maru Gothic ProN");
  });

  test("最初の1画面で読み込むフォントが重すぎない", async ({ page }) => {
    // 日本語のフォントは全部で 3MB ある。
    // 分割が効いていないと、最初に開いた人がそれを全部待たされる。
    let bytes = 0;
    page.on("response", async (res) => {
      if (!res.url().includes("/fonts/") || res.status() !== 200) return;
      const body = await res.body().catch(() => null);
      if (body) bytes += body.length;
    });

    await stubApi(page);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);

    expect(
      bytes,
      `最初の1画面で ${Math.round(bytes / 1024)}KB 読み込んでいる`,
    ).toBeLessThan(600 * 1024);
  });

  test("読み上げの邪魔をしない", async ({ page }) => {
    // 書きかけの文章を読み上げに割り込ませると、
    // スクリーンリーダーの利用者は最後まで聞けない。
    await stubApi(page);
    await openLesson(page);

    const live = page.locator("[aria-live]");
    await expect(live).toHaveCount(1); // ポーの吹き出しだけ
    await expect(live).toHaveAttribute("aria-live", "polite");
  });
});
