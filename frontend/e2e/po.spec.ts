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

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

const SAMPLE = "来週の打ち合わせの件、資料の確認をお願いします。";

/** 文章を書き直す教材まで。端末に残った下書きは毎回消す。 */
async function openRewrite(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).click();
  await page.getByTestId("lesson-rewrite_text").click();
  await expect(page.getByTestId("primary-action").first()).toBeVisible();
}

/** 1歩進める。進めなければ false。（lesson.spec.ts と同じ考え方） */
async function advance(page: Page): Promise<boolean> {
  const primary = page.getByTestId("primary-action").first();
  if (!(await primary.isVisible().catch(() => false))) return false;

  if (await primary.isDisabled()) {
    const box = page.locator("textarea:visible").first();
    if (await box.count()) {
      await box.fill(SAMPLE);
    } else {
      const choice = page
        .locator("main button:visible")
        .filter({
          hasNotText: /レッスン一覧へ|もどる|くわしく|送っています|飛ばす|スキップ|あとにする/,
        })
        .first();
      if (await choice.count()) await choice.click();
    }
    await page.waitForTimeout(80);
  }
  if (await primary.isDisabled()) return false;

  await primary.click();
  return true;
}

test.describe("ポーの絵", () => {
  test("出た表情は、それぞれ自分の絵を読んでいる", async ({ page }) => {
    await stubApi(page);
    await openRewrite(page);

    // 通しで出た表情と、そのとき実際に読んだ絵を集める
    const loaded = new Map<string, string>();
    for (let i = 0; i < 40; i++) {
      const avatar = page.getByTestId("po-avatar").first();
      if (await avatar.isVisible().catch(() => false)) {
        const emotion = await avatar.getAttribute("data-emotion");
        const src = await avatar
          .locator("img")
          .first()
          .getAttribute("src")
          .catch(() => null);
        if (emotion && src && !loaded.has(emotion)) loaded.set(emotion, src);
      }
      if (await page.getByTestId("completion-view").isVisible().catch(() => false)) break;
      if (!(await advance(page))) break;
      await page.waitForTimeout(120);
    }

    // 代用へ倒れていれば、別の表情の絵を読んでいる
    for (const [emotion, src] of loaded) {
      expect(src, `${emotion} が自分の絵ではなく ${src} を読んでいる`).toContain(
        `${emotion}.webp`,
      );
    }

    // 集められていないと、上の検査が素通りする
    expect(loaded.size, "表情がほとんど出ていない。通せていない可能性がある").toBeGreaterThan(2);
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
