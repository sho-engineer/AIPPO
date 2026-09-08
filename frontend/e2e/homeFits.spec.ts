/**
 * ホームが、**送らずに全部見える**こと。
 *
 * なぜ要るか
 * ----------
 * ホームは毎日ひらく場所で、置いてあるものは主役（今日の1本）を除けば
 * どれも「ここまでの自分」の話。送らないと見えないなら、置いていないのと
 * ほとんど変わらない。実測では 910px あり、390×844 で 178px、
 * iPhone の Safari（402×660）で 362px はみ出していた。
 *
 * 2つの数を見る
 * -------------
 *   はみ出し … ページそのものが送れるか。0 でないと「1画面」ではない
 *   食い込み … いちばん下の行が、固定の下タブに潜っていないか
 *
 * 後者が要る理由は、**送れないこととは別の話**だから。下の余白が
 * 足りなければページは伸びずに、行だけが帯の下に隠れる。数の上は
 * 0 のまま、画面では読めない。
 *
 * 下の余白は下タブに追従させてある
 * --------------------------------
 * `pb-[calc(4.5rem+env(safe-area-inset-bottom))]`。下タブ自身が
 * `pb-[max(0.5rem,env(safe-area-inset-bottom))]` を持っていて、
 * **ホームバーのある端末では 95px まで伸びる**（`AppShell.tsx`）。
 * Chromium は安全域を 0 で返すので、固定の数で合わせると実機で潜る。
 *
 * 低い持ち方では2つ畳む
 * ---------------------
 * 今日の1本のねらい書き（`min-height:700px`）と「ほかにも見る」
 * （`min-height:800px`）。どちらも行き止まりにはならないので、
 * ここでは**畳まれていること**ではなく、収まっていることだけを見る。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/** 下タブに潜っていないか見るときの、丸めのぶれ。 */
const SLACK = 2;

async function openHome(page: Page): Promise<void> {
  await stubApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await expect(page.getByTestId("next-up")).toBeVisible();
}

async function fit(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const tab = document.querySelector("[data-testid='tab-bar']");
    const rows = [...(main?.children ?? [])] as HTMLElement[];
    /*
      いちばん下の「見えている」行。畳んだ節（`display:none`）は
      高さが 0 になるので、そこを底として測らない。
    */
    const shown = rows.filter((el) => el.getBoundingClientRect().height > 0);
    const last = shown[shown.length - 1];
    return {
      over: document.documentElement.scrollHeight - window.innerHeight,
      under: tab
        ? Math.round(
            last.getBoundingClientRect().bottom - tab.getBoundingClientRect().top,
          )
        : 0,
      rows: shown.length,
    };
  });
}

/*
  持ち方を4つ。**幅と高さの両方を変える。**

  高さだけを変えても足りない。360px では題や札が折り返して縦に伸びる
  ので、同じ高さでも収まり方が変わる（実際 360×780 だけが遅れて落ちた）。

  402×660 は iPhone の Safari で上下の帯が出ている状態。ここがいちばん
  きつく、レッスンの画面でも同じ数字を使っている（`stepFits.spec.ts` に
  どこから来た数字かを書いてある）。
*/
const SIZES = [
  { width: 390, height: 844, name: "iPhone 390×844" },
  { width: 430, height: 932, name: "iPhone 430×932" },
  { width: 402, height: 660, name: "iPhone Safari 402×660" },
  { width: 360, height: 780, name: "Android 360×780" },
];

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("ホームは、送らずに全部見える", async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "mobile", "スマホの見え方だけ見る");
      await openHome(page);

      const seen = await fit(page);
      expect(seen.rows, "ホームの節が並んでいない").toBeGreaterThan(2);
      expect(seen.over, `${size.name} で ${seen.over}px 送れる`).toBeLessThanOrEqual(0);
      expect(
        seen.under,
        `${size.name} で、いちばん下の行が下タブに ${seen.under}px 潜っている`,
      ).toBeLessThanOrEqual(SLACK);
    });
  });
}

test.describe("いちばん低い持ち方で畳むもの", () => {
  test.use({ viewport: { width: 402, height: 660 } });

  test("主役と、始めるボタンは畳まない", async ({ page }, testInfo) => {
    /*
      畳んでよいのは「ここまでの自分」の話まで。**今日の1本と、
      それを始めるボタンは、どの持ち方でも必ず出す。**
      ここが消えたら、ホームである意味が無くなる。
    */
    test.skip(testInfo.project.name !== "mobile", "スマホの見え方だけ見る");
    await openHome(page);

    await expect(page.getByTestId("home-greeting")).toBeVisible();
    await expect(page.getByTestId("next-up")).toBeVisible();
    await expect(page.getByTestId("continue-lesson")).toBeInViewport();
    // 記録と数字も残す（畳むのはねらい書きと「ほかにも見る」だけ）
    await expect(page.getByTestId("progress-summary")).toBeVisible();
    await expect(page.getByTestId("skill-summary")).toBeVisible();
    // 道のりへの入口は、「ほかにも見る」を畳んでも残る
    await expect(page.getByTestId("open-path")).toBeVisible();
  });
});
