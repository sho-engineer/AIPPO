import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";

// Synthetic local-build interactions, not child/parent study evidence.
const iframe = 'iframe[title="AIPPO Kids AIぼうけん・学習プレビュー"]';
async function fits(el: Locator) {
  await expect(el).toBeVisible();
  await expect.poll(() => el.evaluate(e => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.left >= -2 && r.top >= -2 && r.right <= innerWidth + 2 && r.bottom <= innerHeight + 2;
  })).toBe(true);
  await el.click({ trial: true });
}
async function childGeometry(frame: FrameLocator) {
  await expect.poll(() => frame.locator("html").evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(2);
  for (const b of await frame.locator(".view button").all()) if (await b.isEnabled()) await fits(b);
}
async function seed(page: Page, frame: FrameLocator, mode: string, count: number) {
  await frame.locator("html").evaluate((_, { mode, count }) => {
    const done = Object.fromEntries(Array.from({ length: count }, (_, i) => [i, { at: "2026-10-15", assessmentVersion: 2, evidence: { knowledge: true, practice: true }, attempts: 1 }]));
    localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, challengeMode: mode, ageBand: "7-9", readingSupport: "on" }));
    localStorage.setItem("aippo_kids_journey_v1", JSON.stringify({ schema: 3, done, challenges: [{ at: "2026-10-15", mode: "advanced", task: "outing", conditions: {} }], daily: [] }));
  }, { mode, count });
  await page.reload();
}
async function finishLast(frame: FrameLocator) {
  await expect(frame.locator(".worldView")).toBeVisible();
  await frame.locator('[data-quest="24"]').click();
  await expect(frame.locator(".questHead .dots")).toHaveCount(0);
  await frame.locator('[data-test-answer="2"]').click();
  await frame.locator('[data-safe-prompt="safe"]').click();
  await frame.locator('[data-safe-person="adult"]').click();
  await frame.locator('[data-action="safe-submit"]').click();
  await expect(frame.locator(".success")).toBeVisible();
  await childGeometry(frame);
}
for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`Kids truthful counters and final next purpose ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto("/kids");
    const frame = page.frameLocator(iframe);
    await seed(page, frame, "guided", 2);
    await frame.locator(".worldHomeBtn").click();
    await expect(frame.locator(".homeHead .eyebrow")).toHaveText(/冒険\s*2\s*\/\s*25/);
    await childGeometry(frame);
    for (const mode of ["standard", "advanced"]) {
      await seed(page, frame, mode, 2);
      await expect(frame.locator(".homeHead .eyebrow")).toHaveText(/練習記録\s*1件/);
      await expect(frame.locator(".homeHead .eyebrow")).not.toContainText("/25");
      await childGeometry(frame);
    }
    await frame.locator('.top [data-nav="parent"]').click();
    await expect(frame.locator(".parentBottom button").first()).toHaveAttribute("data-action", "recent");
    await expect(frame.locator(".parentBottom button").first()).toHaveClass(/summaryEntry/);
    await childGeometry(frame);
    await frame.locator('[data-action="recent"]').click();
    await expect(frame.locator(".summaryModal")).toBeVisible();
    await frame.locator("[data-recent-close]").click();
    await seed(page, frame, "guided", 24);
    await finishLast(frame);
    await expect(frame.locator('[data-action="next"]')).toHaveText(/つぎの目的をえらぶ/);
    await expect(frame.locator('[data-action="daily"]')).toHaveText(/できたこと・記録を見る/);
    await frame.locator('[data-action="daily"]').click();
    await expect(frame.locator(".parentView")).toBeVisible();
    await frame.locator('.parentTop [data-nav="map"]').click();
    await finishLast(frame);
    await frame.locator('[data-action="next"]').click();
    await expect(frame.locator(".dailyModal")).toBeVisible();
    const records = await frame.locator("html").evaluate(() => JSON.parse(localStorage.getItem("aippo_kids_journey_v1")!));
    expect(records.daily).toHaveLength(0);
    expect(errors).toEqual([]);
  });
}
