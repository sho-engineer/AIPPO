/**
 * レッスンの絵。実機での見え方を確かめる。
 *
 * 絵は「探す」ための道具
 * ----------------------
 * 出る場所は決めてある。
 *
 *   ホームの今日の1本 … 中くらい（横いっぱいにはしない）
 *   探した結果・あとで見る … 行の左に小さく
 *   コースの道のり … **出さない**（順番に進む場所であって、探す場所ではない）
 *
 * ここで見るのは5つ。
 *
 *   1. 縦横比が 4:3 のまま出る（引き伸ばされていない＝ポーが歪まない）
 *   2. 今日の1本の絵が、1画面の大半を占めない
 *   3. 道のりには絵が1枚も出ない
 *   4. 横スクロールが出ない（iPhone の幅で）
 *   5. **絵があっても、近日公開の教材は始められない**
 *
 * 5つ目が肝心
 * -----------
 * 絵は、まだ開いていない教材のぶんも先に用意してある。公開状態は
 * 教材データの availability が決めるので、絵があることが「始められる」
 * の合図になってはいけない。ここを取り違えると、押した先に中身の無い
 * 教材が開く。
 *
 * 縦横比も占有率も jsdom では測れない（版面を持たない）ので、実機で見る。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/** iPhone の幅。ここを最優先にする。 */
const PHONE = { width: 390, height: 844 };

async function openHome(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("next-up")).toBeVisible();
}

async function openCourseDetail(page: Page): Promise<void> {
  await openHome(page);
  await page.getByTestId("open-path").click();
  await expect(page.getByTestId("lesson-timeline")).toBeVisible();
}

test.describe("レッスンの絵", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize(PHONE);
  });

  test("縦横比 4:3 のまま出る（引き伸ばさない）", async ({ page }) => {
    await openHome(page);
    // 探した結果にも絵が出る。ホームと合わせて両方見る
    await page.getByTestId("open-path").click();
    await page.getByTestId("lesson-search").fill("文章");

    const thumbs = page.getByTestId("lesson-thumbnail");
    await expect(thumbs.first()).toBeVisible();

    const ratios = await thumbs.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return +(r.width / r.height).toFixed(2);
      }),
    );

    expect(ratios.length).toBeGreaterThan(0);
    for (const ratio of ratios) {
      expect(ratio, "絵が引き伸ばされている（ポーが歪む）").toBeCloseTo(1.33, 1);
    }
  });

  test("今日の1本の絵が、1画面の大半を占めない", async ({ page }) => {
    /*
      前は横いっぱいに敷いていた。390px では 4:3 が約 260px の高さになり、
      題・ねらい・ボタンと合わせてカード1枚で1画面が埋まっていた。
    */
    await openHome(page);

    const card = page.getByTestId("next-up");
    await expect(card).toBeVisible();

    const height = (await card.boundingBox())!.height;
    expect(height, "今日のカードが高すぎる").toBeLessThan(PHONE.height * 0.45);

    const thumb = card.getByTestId("lesson-thumbnail");
    const box = (await thumb.boundingBox())!;
    const cardBox = (await card.boundingBox())!;
    expect(
      box.width / cardBox.width,
      "絵がカードの横幅を占めすぎている",
    ).toBeLessThan(0.5);
  });

  test("道のりには、絵を1枚も出さない", async ({ page }) => {
    /*
      ここは「順番に進む」場所。小さく並べた絵は中身が読めず、
      題を絵の中と外に二度書くことになる。
    */
    await openCourseDetail(page);

    await expect(
      page.getByTestId("lesson-timeline").getByTestId("lesson-thumbnail"),
    ).toHaveCount(0);
  });

  test("探した結果では、題の始まる位置がそろう", async ({ page }) => {
    /*
      用意できている絵は全レッスンぶんではない。何も置かずに空けると、
      そこだけ題が左へずれて、列がガタガタに見える。
    */
    await openCourseDetail(page);
    await page.getByTestId("lesson-search").fill("AI");
    await expect(page.getByTestId("lesson-thumbnail").first()).toBeVisible();

    const lefts = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>("[data-testid^='lesson-']"),
      ).filter((el) => el.tagName === "BUTTON");
      return rows
        .map((row) => {
          // 題は行の中でいちばん大きい文字。font-bold の span を拾う
          const title = row.querySelector<HTMLElement>(".font-bold");
          return title ? Math.round(title.getBoundingClientRect().left) : null;
        })
        .filter((x): x is number => x !== null);
    });

    expect(lefts.length).toBeGreaterThan(2);
    expect(new Set(lefts).size, `題の左端がそろっていない: ${lefts}`).toBe(1);
  });

  test("iPhone の幅で、横スクロールが出ない", async ({ page }) => {
    await openCourseDetail(page);

    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    expect(overflows, "横に見切れている").toBe(false);
  });

  test("絵があっても、近日公開の教材は始められない", async ({ page }) => {
    /*
      公開状態を決めるのは教材データ（availability）で、絵の有無ではない。
      絵だけ先に用意してあるコースが、それだけで開いてしまわないこと。
    */
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "はじめる" }).first().click();
    await page.getByRole("button", { name: "コース" }).first().click();

    const soon = page.locator("[data-testid^='course-']");
    const count = await soon.count();

    for (let i = 0; i < count; i += 1) {
      const card = soon.nth(i);
      const button = card.locator("button").first();
      if (await button.count()) {
        await expect(
          button,
          "近日公開のコースが押せる状態になっている",
        ).toBeDisabled();
      }
    }
  });
});
