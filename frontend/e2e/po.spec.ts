/**
 * ポーの絵が、代用ではなく本人の絵で出ること。
 *
 * 絵は2段の代用を持っている（`src/po/assets.ts` の `PO_FALLBACK`）。
 * 読めなければ近い絵へ、それも駄目なら丸いプレースホルダーへ倒れる。
 * 壊れた画像を出さないための作りだが、**代用は黙って起きる**。
 *
 * そのため「絵を置き忘れた」「置き場所を片方だけ直した」を、
 * 画面を見ただけでは見分けられない。ポーは出ているように見える。
 * 気づくのは、その表情をよく見る誰かになる。
 *
 * `poeAssets.test.ts` はファイルの有無と一致を見張るが、
 * *画面がその絵を実際に読んだか* までは見ない。ここで見る。
 */

import { expect, test, type Page, type Locator } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/**
 * 進めない状態か。
 *
 * `disabled` だけを見ない。答えが足りないときのボタンは、押せる形のまま
 * `aria-disabled` で「まだ進めない」を表している（押した人に理由を返すため）。
 * 属性だけで見分けると、押しても進まないボタンを押し続けることになる。
 */
async function blocked(primary: Locator): Promise<boolean> {
  if (await primary.isDisabled()) return true;
  return (await primary.getAttribute("aria-disabled")) === "true";
}

const SAMPLE = "来週の打ち合わせの件、資料の確認をお願いします。";

/** 文章を書き直す教材まで。端末に残った下書きは毎回消す。 */
async function openRewrite(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-rewrite_text").click();
  await expect(page.getByTestId("primary-action").first()).toBeVisible();
}

/** 1歩進める。進めなければ false。（lesson.spec.ts と同じ考え方） */
async function advance(page: Page): Promise<boolean> {
  const primary = page.getByTestId("primary-action").first();
  if (!(await primary.isVisible().catch(() => false))) return false;

  if (await blocked(primary)) {
    const box = page.locator("textarea:visible").first();
    if (await box.count()) {
      await box.fill(SAMPLE);
    } else {
      const choice = page
        .locator("main button:visible")
        .filter({
          hasNotText:
            /レッスン一覧へ|もどる|くわしく|変わったところ|記録|全文|送っています|飛ばす|スキップ|あとにする/,
        })
        .first();
      if (await choice.count()) await choice.click();
    }
    await page.waitForTimeout(80);
  }
  if (await blocked(primary)) return false;

  await primary.click();
  return true;
}

test.describe("ポーの絵", () => {
  test("出た表情は、それぞれ自分の絵を読んでいる", async ({ page }) => {
    await stubApi(page);
    await openRewrite(page);

    /*
      表情ごとに、出た絵を**ぜんぶ**集める（1枚だけ見ない）。

      1枚だけ見ると、取った瞬間で結果が変わる。ポーは動くので、
      同じ表情でも複数の絵を正しく行き来する。

        まばたき … どの表情でも、140ミリ秒だけ blink へ替わる
        口の動き … talking のときは 160ミリ秒ごとに neutral と
                   交互に出して、口が動いて見えるようにしている

      つまり「talking なのに neutral を読んでいる」のは、
      多くの場合**正しい動き**の途中を捉えただけになる。実際これで
      検査が落ちたり通ったりしていた（CI で落ち、手元では通る）。

      見たいのは「その表情の絵を、一度でもちゃんと読めているか」。
      読めていなければ代用へ倒れており、自分の絵は一度も出てこない。
      口が閉じている間も取りこぼさないよう、少し間を置いて何度か見る。
    */
    const loaded = new Map<string, Set<string>>();

    const sample = async () => {
      const avatar = page.getByTestId("po-avatar").first();
      if (!(await avatar.isVisible().catch(() => false))) return;

      // 表情と絵は**一度に**取る。別々に取ると、その間に描き直されて
      // 「ある瞬間の表情」と「別の瞬間の絵」を突き合わせることになる
      const seen = await avatar
        .evaluate((node) => ({
          emotion: node.getAttribute("data-emotion"),
          src: node.querySelector("img")?.getAttribute("src") ?? null,
        }))
        .catch(() => null);
      if (!seen?.emotion || !seen.src) return;

      const already = loaded.get(seen.emotion) ?? new Set<string>();
      already.add(seen.src);
      loaded.set(seen.emotion, already);
    };

    for (let i = 0; i < 40; i++) {
      // 口の動き（160ミリ秒ごと）の両方の側を、必ずまたぐ
      for (let shot = 0; shot < 3; shot++) {
        await sample();
        await page.waitForTimeout(90);
      }
      if (await page.getByTestId("completion-view").isVisible().catch(() => false)) break;
      if (!(await advance(page))) break;
    }

    // 代用へ倒れていれば、自分の絵は一度も出てこない
    for (const [emotion, srcs] of loaded) {
      const own = [...srcs].some((src) => src.includes(`${emotion}.webp`));
      expect(
        own,
        `${emotion} が自分の絵を一度も読んでいない（出たのは ${[...srcs].join(" / ")}）`,
      ).toBe(true);
    }

    // 集められていないと、上の検査が素通りする
    expect(loaded.size, "表情がほとんど出ていない。通せていない可能性がある").toBeGreaterThan(2);
  });

  test("毎画面には出ない（出る場面のほうが少ない）", async ({ page }) => {
    /*
      ここが本題。前は19画面のうち17画面にポーが居た。
      居るのが当たり前になると、居ること自体が何も言わなくなる。

      決めているのは src/course/poPresence.ts だが、そこを直しても
      画面が別の場所でポーを描いていれば意味がない。**実際に通して
      数える。**

      送信中は数えない。押していないのに勝手に出入りするので、
      取った瞬間で結果が変わる。
    */
    await stubApi(page);
    await openRewrite(page);

    let screens = 0;
    let withPo = 0;
    const scenes = new Set<string>();

    /*
      刻み方は、上の検査と同じにする。切り替えの動き（220〜350ms）と
      自動で送る回をまたぐには、1歩ごとに少し置いて何度か見るのが要る。
      置かずに押すと、動いている最中のボタンを押して通しが止まる。
    */
    for (let i = 0; i < 40; i++) {
      let scene: string | null = null;
      let thinking = false;
      for (let shot = 0; shot < 3; shot++) {
        if (await page.locator('[data-po-scene="thinking"]').count()) thinking = true;
        /*
          先に数える。`getAttribute` は**要素が現れるまで待つ**ので、
          ポーが居ない画面でそのまま呼ぶと、居ないことを確かめるために
          既定の待ち時間ぶん止まる。ここでは「居ないこと」も答えの
          ひとつなので、待ってはいけない。
        */
        const here = page.locator("[data-po-scene]").first();
        const found = (await here.count())
          ? await here.getAttribute("data-po-scene")
          : null;
        if (found) scene = found;
        await page.waitForTimeout(90);
      }

      // 送っている最中は数えない。押していないのに出入りする
      if (!thinking) {
        screens += 1;
        if (scene) {
          withPo += 1;
          scenes.add(scene);
        }
      }

      if (await page.getByTestId("completion-view").isVisible().catch(() => false)) break;
      if (!(await advance(page))) break;
    }

    expect(screens, "1本を通せていない").toBeGreaterThan(10);
    expect(
      withPo * 2,
      `${screens}画面のうち${withPo}画面にポーが居る`,
    ).toBeLessThan(screens);

    // 出ない側へ倒れきってもいけない。はじまりとおわりには居ること
    expect([...scenes]).toContain("start");
    expect([...scenes]).toContain("celebrate");
  });

  test("まばたきで blink の絵へ切り替わる", async ({ page }) => {
    /*
      まばたきは5〜8秒に1回、140ミリ秒だけ。
      1回取り逃しても次が来るよう、待つ時間は2回ぶん取る。
    */
    await stubApi(page);
    await openRewrite(page);

    const image = page.getByTestId("po-avatar").first().locator("img").first();
    await expect(image).toBeVisible();

    await expect(async () => {
      expect(await image.getAttribute("src")).toContain("blink.webp");
    }).toPass({ timeout: 20_000, intervals: [50] });
  });
});
