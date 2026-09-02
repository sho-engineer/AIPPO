/**
 * レッスンの1画面が、**1画面に収まっていること**。
 *
 * 1画面＝1アクション（支給資料 ③）。押す場所を探して縦に送らせない。
 *
 * 何が起きていたか
 * ----------------
 * Pixel 5（393×727）で実測すると、レッスン15画面のうち**14画面が
 * はみ出していた**。うち8画面はぴったり 44px——帯（44px）の下に
 * 「画面の高さぶん」の面（`min-h-screen`）を置いていたので、中身が
 * 何も無くても帯のぶんだけ必ず溢れる作りだった。残りは中身が多い。
 *
 * いまは帯の下いっぱいの高さを取り、縦に3つ積む（`StepShell`）。
 *
 *     進み具合・見出し・ポー   … 動かない
 *     その回の中身            … ここだけ伸び縮みする
 *     次にやること            … 動かない
 *
 * 2つの数を見る
 * -------------
 *   page … ページそのものが送れるか。**ここが 0 でないと話にならない**
 *   body … 中身の枠が送れるか。0 なら「1画面で完結」できている
 *
 * `scrollHeight` だけでは足りない
 * -------------------------------
 * 入れ子の flex（`flex-1 min-h-0`）が縮み切ると、中身は枠の外へ
 * 描かれるが `scrollHeight` は増えない——**数の上は 0 のまま、画面では
 * 重なって見える**。実際にそれで「収まった」と誤読した。箱ごとに
 * 「中身が箱より高いか」も見る。
 *
 * 完了画面も同じ決まりで測る
 * --------------------------
 * 前は「まとめの画面だから」と外していた（3036px あった）。いまは
 * 残すものを3つに絞り、進み具合・アンケート・応用例・次におすすめは
 * 「このレッスンの記録」の一枚へ移したので、ほかの回と同じ土俵に乗る。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/** 丸めのぶれ。影や余白の端数で数 px は動く。 */
const SLACK = 8;

interface Fit {
  title: string;
  /** ページそのもののはみ出し（px）。 */
  page: number;
  /** 中身の枠のはみ出し（px）。 */
  body: number;
  /** 枠から食み出して描かれている箱の、最大のはみ出し（px）。 */
  box: number;
}

async function fit(p: Page): Promise<Fit> {
  return p.evaluate(() => {
    const heading = document.querySelector("main h1");
    const region = document.querySelector<HTMLElement>(
      "[data-testid='step-shell'] .overflow-y-auto",
    );
    return {
      title: (heading?.textContent ?? "").trim().slice(0, 24),
      page: document.documentElement.scrollHeight - window.innerHeight,
      body: region ? region.scrollHeight - region.clientHeight : 0,
      box: region
        ? Math.max(
            0,
            ...Array.from(region.querySelectorAll("*")).map((node) => {
              const el = node as HTMLElement;
              // 自分で送れる箱は、はみ出していない
              if (getComputedStyle(el).overflowY !== "visible") return 0;
              if (el.clientHeight === 0) return 0;
              return el.scrollHeight - el.clientHeight;
            }),
          )
        : 0,
    };
  });
}

/** 次へ進む。答えが要る回は、その場にあるもので埋める。 */
async function advance(p: Page): Promise<boolean> {
  const primary = p.getByTestId("primary-action").first();
  if (!(await primary.count())) return false;

  const blocked = async () =>
    (await primary.isDisabled()) ||
    (await primary.getAttribute("aria-disabled")) === "true";

  if (await blocked()) {
    const box = p.locator("textarea:visible").first();
    if (await box.count()) {
      await box.fill("来週の打ち合わせの件、資料の確認をお願いします。");
    } else {
      const choice = p
        .locator("main button:visible")
        .filter({
          hasNotText:
            /レッスン一覧へ|もどる|くわしく|変わったところ|記録|全文|送っています|飛ばす|スキップ/,
        })
        .first();
      if (await choice.count()) await choice.click();
    }
    await p.waitForTimeout(300);
  }
  if (await blocked()) return false;
  await primary.click();
  /*
    落ち着くまで待つ。届いた合図（`StepDone`）は 1.8 秒で消えるので、
    それより前に測ると、消える途中の高さを見てしまう。
  */
  await p.waitForTimeout(2100);
  return true;
}

test.setTimeout(180_000);

/** レッスンを最後まで通し、画面ごとに測る。 */
async function walk(p: Page): Promise<Fit[]> {
  await stubApi(p);
  await p.goto("/");
  await p.evaluate(() => window.localStorage.clear());
  await p.reload();
  await p.getByRole("button", { name: "はじめる" }).first().click();
  await p.getByTestId("continue-lesson").click();
  await expect(p.getByTestId("lesson-header")).toBeVisible();
  await p.waitForTimeout(2100);

  const seen: Fit[] = [];
  for (let step = 0; step < 30; step += 1) {
    seen.push(await fit(p));
    /*
      完了画面も測る。**まとめの画面ではなくなった**——できるように
      なったこと・覚えたAI技・成果物の3つだけを残し、進み具合や
      アンケートは「このレッスンの記録」の一枚へ移した。
    */
    if (await p.getByTestId("completion-view").count()) break;
    if (!(await advance(p))) break;
  }
  return seen;
}

function assertFits(seen: Fit[], where: string) {
  expect(seen.length, "レッスンの画面を1つも通らなかった").toBeGreaterThan(10);
  for (const screen of seen) {
    expect(
      screen.page,
      `${where}「${screen.title}」ページが ${screen.page}px 送れる`,
    ).toBeLessThanOrEqual(1);
    expect(
      screen.body,
      `${where}「${screen.title}」中身が ${screen.body}px 送れる`,
    ).toBeLessThanOrEqual(SLACK);
    expect(
      screen.box,
      `${where}「${screen.title}」枠から ${screen.box}px 食み出した箱がある`,
    ).toBeLessThanOrEqual(SLACK);
  }
}

test("レッスンのどの画面も、1画面に収まる", async ({ page }, testInfo) => {
  assertFits(await walk(page), testInfo.project.name);
});

/*
  いちばん低くなる持ち方でも測る。

  なぜ要るか
  ----------
  Pixel 5（393×727）だけで測っていたので、**それより低い画面が
  検査されていなかった**。実機（iPhone 16 Pro・Safari）の録画を見ると、
  最初の画面に縦の送りが出ていて「くわしく見る」がボタンに切られていた。

  どこから 402×660 か
  -------------------
  録画のフレームを測ると、Safari の上下の帯を除いた見える範囲は
  1206×2051px（実機の点）＝ **402×684**（CSS の点）だった。

  そこから 24px 引いて 660 にしてある。実機には下の安全域（ホームバー）が
  あり、ボタンの下余白が `max(0.75rem, env(safe-area-inset-bottom))` で
  12px から増えることがある。Chromium はこの値を 0 で返すので、
  同じきつさにならない。**引いた分は安全のための余裕**で、
  実機の値をそのまま写したものではない。

  スマホの見え方だけ見る。パソコンでこの高さを測っても意味がない。
*/
test.describe("いちばん低い持ち方（iPhone の Safari、上下の帯あり）", () => {
  test.use({ viewport: { width: 402, height: 660 } });

  test("その高さでも、どの画面も1画面に収まる", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "スマホの見え方だけ見る");
    assertFits(await walk(page), "iPhone 402×660");
  });
});

test("完了画面でも、次にやることは画面に残る", async ({ page }) => {
  /*
    まとめの画面は縦に長い。**それでも「次にやること」は画面から
    出ていかない**——前は下端に固定して浮かせていたので、中身が
    長いほど下の余白（`pb-40`）と食い違い、余ったり足りなかったりした。
    いまは柱の中に並んでいるので、長さに関係なく必ず見えている。
  */
  await stubApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await page.getByTestId("continue-lesson").click();
  await expect(page.getByTestId("lesson-header")).toBeVisible();

  for (let step = 0; step < 30; step += 1) {
    if (await page.getByTestId("completion-view").count()) break;
    if (!(await advance(page))) break;
  }

  await expect(page.getByTestId("completion-view")).toBeVisible();
  // ページそのものは送れない。送れるのは中身の枠だけ
  const page_ = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  expect(page_, `完了画面でページが ${page_}px 送れる`).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("primary-action").first()).toBeInViewport();
});
