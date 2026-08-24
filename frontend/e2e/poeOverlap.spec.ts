/**
 * ポーが吹き出しの下に隠れないこと。
 *
 * 何が起きていたか
 * ----------------
 * `PoHero` はポーを絶対配置で置き、しかも DOM では吹き出しより**前**に
 * 並べていた。重なった場所では、あとから通常の流れで置かれる吹き出し
 * （不透明な bg-surface を持つ）が上に描かれる。つまりポーが隠れる。
 *
 * 実測（390px・レッスン完了画面、修正前）:
 *   ポー     top 106 / bottom 218
 *   吹き出し  top 200 / bottom 270
 *   → 60 × 18px 重なり、elementFromPoint は po-hero-message を返した
 *
 * 題が長い画面（レッスンの導入など）では吹き出しが自然に下へ回るので
 * 起きない。**題が短い画面だけ**で起きるぶん、見落としやすかった。
 *
 * なぜ E2E なのか
 * ---------------
 * 重なりは実際の版面と字送りで決まる。jsdom は版面を持たないので、
 * 「重なっているか」も「どちらが手前か」も測れない。
 *
 * z-index で入れ替えないこと
 * --------------------------
 * ポーを前に出すと、今度は吹き出しの文字がポーの下に入って読めなくなる。
 * 直し方は重ね順ではなく、**重ならない高さを確保する**ほう。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/** iPhone の幅。ここを最優先にする。 */
const PHONE = { width: 390, height: 844 };

/** ポーと吹き出しが重なっているか。重なっていれば手前の要素も返す。 */
async function overlap(page: Page) {
  return page.evaluate(() => {
    const po = document.querySelector('[data-testid="po-avatar"]');
    const message = document.querySelector('[data-testid="po-hero-message"]');
    if (!po || !message) return null;

    const p = po.getBoundingClientRect();
    const m = message.getBoundingClientRect();
    const x = Math.min(p.right, m.right) - Math.max(p.left, m.left);
    const y = Math.min(p.bottom, m.bottom) - Math.max(p.top, m.top);
    const overlaps = x > 0 && y > 0;

    // 実際に重なっている点で、いちばん手前にいるのは誰か
    let front: string | null = null;
    if (overlaps) {
      const el = document.elementFromPoint(
        Math.max(p.left, m.left) + Math.min(x, 20) / 2,
        Math.max(p.top, m.top) + Math.min(y, 20) / 2,
      );
      front = el ? ((el as HTMLElement).closest("[data-testid]") as HTMLElement | null)
        ?.dataset.testid ?? el.tagName : null;
    }

    return { overlaps, front, overlapX: Math.round(x), overlapY: Math.round(y) };
  });
}

async function openRewrite(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await page.getByTestId("continue-lesson").click();
  await expect(page.getByTestId("lesson-header")).toBeVisible();
}

/** 完了画面まで進める。何歩かかるかは教材が決めるので、上限だけ置く。 */
async function runToEnd(page: Page, limit = 40): Promise<void> {
  for (let i = 0; i < limit; i += 1) {
    if (await page.getByTestId("completion-view").isVisible().catch(() => false)) return;

    const primary = page.getByTestId("primary-action").first();
    if (!(await primary.count())) break;

    if (await primary.isDisabled().catch(() => true)) {
      // 先に選ぶ・書くことが要る画面
      const choice = page.locator("button[aria-pressed]").first();
      if (await choice.count()) {
        await choice.click();
        continue;
      }
      const box = page.locator("textarea").first();
      if (await box.count()) {
        await box.fill("会議の日程について確認したいです。");
        continue;
      }
      break;
    }

    await primary.click();
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId("completion-view")).toBeVisible();
}

test.describe("ポーと吹き出しの重なり", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize(PHONE);
  });

  test("完了画面で、ポーが吹き出しに隠れない", async ({ page }) => {
    await openRewrite(page);
    await runToEnd(page);

    const result = await overlap(page);
    expect(result, "ポーか吹き出しが見つからない").not.toBeNull();
    expect(
      result!.overlaps,
      `ポーが吹き出しと重なっている（${result!.overlapX}×${result!.overlapY}px、手前は ${result!.front}）`,
    ).toBe(false);
  });

  test("レッスンの導入でも重ならない", async ({ page }) => {
    // 題が長い画面。ここは元々通っていたので、直しで壊していないことを見る
    await openRewrite(page);

    const result = await overlap(page);
    expect(result).not.toBeNull();
    expect(result!.overlaps).toBe(false);
  });

  test("ポーが画面から欠けない（全身が見えている）", async ({ page }) => {
    /*
      隠れないことと、見えていることは別。上下に切れていれば、
      重なっていなくてもキャラクターとしては読めない。
    */
    await openRewrite(page);
    await runToEnd(page);

    const visible = await page.evaluate(() => {
      const po = document.querySelector('[data-testid="po-avatar"]');
      if (!po) return null;
      const r = po.getBoundingClientRect();
      return {
        insideLeft: r.left >= 0,
        insideRight: r.right <= window.innerWidth + 1,
        hasSize: r.width > 40 && r.height > 40,
      };
    });

    expect(visible).not.toBeNull();
    expect(visible!.insideLeft, "ポーが左に見切れている").toBe(true);
    expect(visible!.insideRight, "ポーが右に見切れている").toBe(true);
    expect(visible!.hasSize, "ポーが小さすぎる").toBe(true);
  });
});
