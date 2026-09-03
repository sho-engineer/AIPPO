/**
 * 章扉。
 *
 * Day1 は4つの段に分かれている。段が変わったことは、これまで進み具合の
 * 細い帯にしか出ていなかった——帯は1本の線なので、**変わったことには
 * 気づけても、何に変わったのかは言っていない**。押した次の瞬間に別の話が
 * 始まるので、「気づいたら次の学習画面にいる」状態だった。
 *
 * ここで見るのは、部品ではなく**実際に通ったときの姿**。
 *
 *   1. 4つの段の頭で、それぞれ1枚出ること
 *   2. 絵が画面そのもので、送らずに全部見えること
 *   3. 押せば進むこと（ボタンでも、画面のどこを押しても）
 *   4. 帯が、章扉で見せた名前と同じ言葉を出すこと
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/** 丸めのぶれ。影や余白の端数で数 px は動く。 */
const SLACK = 8;

async function start(page: Page) {
  await stubApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await page.getByTestId("continue-lesson").click();
}

/** いま章扉にいるなら、その章の名前。いなければ空。 */
async function coverTitle(page: Page): Promise<string> {
  if (!(await page.getByTestId("section-transition").count())) return "";
  return (
    await page.locator("#section-transition-title").innerText({ timeout: 500 })
  ).trim();
}

/** 次へ進む。答えが要る回は、その場にあるもので埋める。 */
async function advance(page: Page): Promise<boolean> {
  const primary = page.getByTestId("primary-action").first();
  if (!(await primary.count())) return false;

  const intro = page.getByTestId("lesson-intro-close");
  if (await intro.count()) await intro.click();

  const blocked = async () =>
    (await primary.isDisabled()) ||
    (await primary.getAttribute("aria-disabled")) === "true";

  if (await blocked()) {
    const box = page.locator("textarea:visible").first();
    if (await box.count()) {
      await box.fill("来週の打ち合わせの件、資料の確認をお願いします。");
    } else {
      const choice = page
        .locator("main button:visible")
        .filter({
          hasNotText:
            /レッスン一覧へ|もどる|くわしく|全文|変わったところ|記録|送っています|飛ばす|スキップ/,
        })
        .first();
      if (await choice.count()) await choice.click();
    }
    await page.waitForTimeout(300);
  }
  if (await blocked()) return false;
  await primary.click();
  await page.waitForTimeout(900);
  return true;
}

test.setTimeout(180_000);

test.describe("段が変わったことを、1枚で言う", () => {
  test("4つの段の頭に、それぞれ出る", async ({ page }) => {
    /*
      通しで拾う。**教材の並びを信じずに、実際に出たものを数える**
      ——章扉は骨格が挟むので、挟み損ねても教材データは無傷に見える。
    */
    await start(page);

    const covers: string[] = [];
    for (let step = 0; step < 30; step += 1) {
      const title = await coverTitle(page);
      if (title) covers.push(title);
      if (await page.getByTestId("completion-view").count()) break;
      if (!(await advance(page))) break;
    }

    expect(covers).toEqual([
      "まずは試してみよう",
      "相手を決めよう",
      "トーンを変えよう",
      "自分で仕上げよう",
    ]);
  });

  test("送らずに、1枚が全部見える", async ({ page }) => {
    /*
      1枚を見て次へ行くだけの画面で、送る先が無い。

      高さの式を間違えると、中身が何も無くても帯（44px）のぶんだけ
      はみ出す——`100dvh` を帯の**下**に置いていたとき、実測で
      ちょうど 44px 送れた。
    */
    await start(page);
    await expect(page.getByTestId("section-transition")).toBeVisible();

    const over = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(over).toBeLessThanOrEqual(SLACK);

    // 絵も「つづける」も、同じ画面の中にある
    const view = page.viewportSize()!;
    for (const target of ["section-transition-tap", "primary-action"]) {
      const box = await page.getByTestId(target).first().boundingBox();
      expect(box, `${target} が無い`).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(view.height + SLACK);
    }
  });

  test("余白が、絵の続きで埋まっている", async ({ page }) => {
    /*
      絵は縦長（941×1672）で、横長の画面では**高さで頭打ち**になる。
      402px 幅の実機で絵に使えるのは 295px しかなく、残りは左右の余白
      ——白い地の上に絵の四角い縁が浮いて見えていた。

      同じ絵を横に伸ばしてぼかし、背面へ敷いてある。

      色の一致は見ない。横に伸ばす以上、境目には絵の 25% あたりの色が
      来るので、前面の左端とは合わない（合わせようとすると背面を前面と
      同じ大きさにするしかなく、それでは余白が埋まらない）。**消したいのは
      硬い縁**のほうで、それはぼかしが受け持っている。

      ここで見るのは、余白が**本当に埋まっているか**。
    */
    await start(page);
    const cover = page.getByTestId("section-transition");
    await expect(cover).toBeVisible();
    await page.waitForTimeout(700);

    const layout = await page.evaluate(() => {
      /*
        絵はタップ面の**中**ではなく、同じ面に並べて敷いてある
        ——押せるものの中へ押せるものを入れないため。
      */
      const tap = document.querySelector<HTMLElement>(
        "[data-testid='section-transition-tap']",
      )!;
      const cover = document.querySelector<HTMLElement>(
        "[data-testid='section-transition']",
      )!;
      const backdrop = cover.querySelector<HTMLImageElement>("img[aria-hidden='true']");
      const main = cover.querySelector<HTMLImageElement>("img:not([aria-hidden])");
      const box = (el: Element | null) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      return {
        tap: box(tap)!,
        backdrop: box(backdrop),
        main: box(main),
        blurred: backdrop ? getComputedStyle(backdrop).filter : "",
        sameImage: backdrop?.getAttribute("src") === main?.getAttribute("src"),
      };
    });

    expect(layout.backdrop, "背面の1枚が無い").not.toBeNull();
    expect(layout.main, "前面の絵が無い").not.toBeNull();
    // 同じ絵を使う（通信は1回のまま。色も必ず似る）
    expect(layout.sameImage, "背面が別の絵を指している").toBe(true);
    expect(layout.blurred, "背面がぼけていない").toContain("blur");

    // 前面には左右の余白が出ている（出ていなければ埋めるものが無い）
    expect(layout.main!.left - layout.tap.left).toBeGreaterThan(4);

    /*
      その余白を、背面が**外まではみ出して**埋めている。

      「ちょうど覆う」では足りない。ぼかした絵は縁が薄まって消えるので、
      枠ぴったりだと**画面の端に地色がにじみ出す**。外へ追い出すには、
      枠より外まで届いていること。

      ここを `以上／以下` で書いていたときは、はみ出しを外しても検査が
      通ってしまった（実際に壊して確かめた）。
    */
    const bleed = 8;
    expect(layout.backdrop!.left, "左のぼかしの縁が画面の中に出る").toBeLessThan(
      layout.tap.left - bleed,
    );
    expect(layout.backdrop!.right, "右のぼかしの縁が画面の中に出る").toBeGreaterThan(
      layout.tap.right + bleed,
    );
    expect(layout.backdrop!.top, "上のぼかしの縁が画面の中に出る").toBeLessThan(
      layout.main!.top - bleed,
    );
    expect(layout.backdrop!.bottom, "下のぼかしの縁が画面の中に出る").toBeGreaterThan(
      layout.main!.bottom + bleed,
    );
  });

  test("「つづける」が、絵の中に重なっている", async ({ page }) => {
    /*
      前は縦2段だった——上が絵、下が独立したボタンの行。「絵」＋
      「別ブロックのボタン」に分かれて見えるうえ、ボタンの行が 80px
      取るぶん絵が小さくなっていた（393px の画面で絵は 295px）。

      いまはボタンを絵の箱の中へ重ねる。絵は 371px まで大きくなった。
    */
    await start(page);
    await expect(page.getByTestId("section-transition")).toBeVisible();
    await page.waitForTimeout(700);

    const main = (await page
      .locator("[data-testid='section-transition'] img:not([aria-hidden])")
      .boundingBox())!;
    const cta = (await page.getByTestId("primary-action").boundingBox())!;

    // 絵の中に収まっている（下にはみ出していない＝別ブロックではない）
    expect(cta.y + cta.height, "ボタンが絵の下へはみ出している").toBeLessThanOrEqual(
      main.y + main.height,
    );
    expect(cta.x, "ボタンが絵の左へはみ出している").toBeGreaterThanOrEqual(main.x);
    expect(
      cta.x + cta.width,
      "ボタンが絵の右へはみ出している",
    ).toBeLessThanOrEqual(main.x + main.width);

    // 下部にある（真ん中や上ではない）
    const fromBottom = main.y + main.height - (cta.y + cta.height);
    expect(fromBottom, "絵の下端から離れすぎている").toBeLessThan(main.height * 0.15);
    expect(fromBottom, "絵の下端に貼り付いている").toBeGreaterThan(8);

    // 中央にある。左右の余白がそろっていること
    const leftGap = cta.x - main.x;
    const rightGap = main.x + main.width - (cta.x + cta.width);
    expect(Math.abs(leftGap - rightGap), "左右の余白がそろっていない").toBeLessThanOrEqual(2);
    expect(leftGap, "左右の余白が無い").toBeGreaterThan(8);
  });

  test("画面のどこを押しても進む", async ({ page }) => {
    /*
      親指はふつう画面の下半分にあり、そこには絵しかない。
      下のボタンまで運ばせずに済むようにする。
    */
    await start(page);
    await expect(page.getByTestId("section-transition")).toBeVisible();

    await page.getByTestId("section-transition-tap").click();

    await expect(page.getByTestId("section-transition")).toHaveCount(0);
  });

  test("帯は、章扉で見せた名前と同じ言葉を出す", async ({ page }) => {
    /*
      共通の区切りの名前（試す・変える・深める・自分で使う）は、どの
      教材にも当たるように付けてある。当たるが、**その日に何をして
      いるのかは言っていない**。章扉で名前を見せた直後に帯が別の言葉を
      出すと、見たばかりの段の名前が画面から消える。
    */
    await start(page);
    // 章扉①を通り抜けると、帯のある画面に出る
    await page.getByTestId("primary-action").first().click();
    await page.waitForTimeout(700);

    const band = await page
      .getByTestId("lesson-progress")
      .first()
      .getAttribute("aria-valuetext");

    expect(band).toContain("4つのうち1つ目");
    expect(band).toContain("試す");
  });
});
