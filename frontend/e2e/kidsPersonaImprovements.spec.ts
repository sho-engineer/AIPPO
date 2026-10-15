import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";

// Synthetic local-build interactions, not observations of actual children/parents.
const iframe = 'iframe[title="AIPPO Kids AIぼうけん・学習プレビュー"]';
async function boot(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/kids");
  const frame = page.frameLocator(iframe);
  await frame.locator("html").evaluate(() => {
    localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, ageBand: "7-9", challengeMode: "guided", readingSupport: "on" }));
    localStorage.removeItem("aippo_kids_journey_v1");
  });
  await page.reload();
  await expect(frame.locator(".homeView")).toBeVisible();
  return frame;
}
async function fits(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect.poll(() => locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.left >= -2 && r.top >= -2 && r.right <= innerWidth + 2 && r.bottom <= innerHeight + 2;
  })).toBe(true);
}
async function click(frame: FrameLocator, selector: string, adult = true) {
  const el = frame.locator(selector);
  if (adult) await el.scrollIntoViewIfNeeded();
  await fits(el); await el.click();
  await expect.poll(() => frame.locator("html").evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(2);
}
async function finishSimple(frame: FrameLocator, kind: string, value: string) {
  await click(frame, `[data-select="${kind}:${value}"]`, false);
  await click(frame, '[data-action="submit"]', false);
  await expect(frame.locator(".resultNotice")).toContainText("つたわった");
  await click(frame, '[data-action="next"]', false);
  await expect(frame.locator(".success")).toBeVisible();
  await click(frame, '[data-action="next"]', false);
}
async function finishAdvanced(frame: FrameLocator, decision: string) {
  await click(frame, `[data-ch-decision="${decision}"]`);
  if (decision === "revise") await click(frame, '[data-ch-fix="correct"]');
  await click(frame, '[data-ch-reason="correct"]');
  await click(frame, '[data-ch-verify="correct"]');
  await click(frame, '[data-ch-support="self"]');
  await expect(frame.locator(".challengeModal")).toContainText("この練習で確認したこと");
  await click(frame, "[data-ch-close]");
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`Persona readings persist independently at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    const frame = await boot(page);
    await click(frame, '.top [data-nav="settings"]', false);
    await frame.locator("#child-age").selectOption("7-9");
    await frame.locator("#child-reading").selectOption("on");
    await click(frame, '[data-action="profile-save"]');
    await frame.locator("html").evaluate(() => {
      // Synthetic completed prerequisites expose the safety reading sample.
      const done = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i, { assessmentVersion: 2, evidence: { knowledge: true, practice: true }, at: "2026-10-15", attempts: 1 }]));
      localStorage.setItem("aippo_kids_journey_v1", JSON.stringify({ schema: 3, done }));
    });
    await page.reload();
    // Completed guided prerequisites resume directly on the current world map.
    await expect(frame.locator(".worldView")).toBeVisible();
    await expect(frame.locator('[data-world="4"]')).toHaveAttribute("aria-pressed", "true");
    await click(frame, '[data-quest="23"]', false);
    await click(frame, '[data-literacy="0"]', false);
    await expect(frame.locator(".testFeedback rt").first()).toBeVisible();
    await click(frame, '.top [data-nav="settings"]', false);
    await expect(frame.locator("#child-age")).toHaveValue("7-9");
    await expect(frame.locator("#child-reading")).toHaveValue("on");
    await frame.locator("#child-reading").selectOption("off");
    await click(frame, '[data-action="profile-save"]');
    await page.reload();
    await expect(frame.locator(".worldView")).toBeVisible();
    await expect(frame.locator('[data-world="4"]')).toHaveAttribute("aria-pressed", "true");
    await click(frame, '[data-quest="23"]', false);
    await click(frame, '[data-literacy="0"]', false);
    await expect(frame.locator(".testFeedback rt")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test(`Persona same-day recent and first/latest records at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const frame = await boot(page);
    await click(frame, '[data-action="start"]', false);
    await click(frame, '[data-quest="0"]', false);
    await finishSimple(frame, "color", "blue");
    await click(frame, '[data-quest="1"]', false);
    await finishSimple(frame, "place", "moon");
    await click(frame, '.top [data-nav="parent"]', false);
    await click(frame, '[data-action="recent"]', false);
    await expect(frame.locator(".summaryModal .dailyRecord").first()).toContainText("ばしょ");
    await click(frame, "[data-recent-close]");
    await click(frame, '.parentTop [data-nav="map"]', false);
    await click(frame, '[data-quest="0"]', false);
    await finishSimple(frame, "color", "blue");
    await click(frame, '.top [data-nav="parent"]', false);
    await click(frame, '[data-action="recent"]', false);
    await expect(frame.locator(".summaryModal .dailyRecord").first()).toContainText("いろ");
    await click(frame, "[data-recent-record]");
    const first = frame.locator(".summaryModal .dailyRecord").first();
    await expect(first).toContainText("初回クリア"); await expect(first).toContainText("直近の練習");
    await click(frame, "[data-close]");
    const saved = await frame.locator("html").evaluate(() => JSON.parse(localStorage.getItem("aippo_kids_journey_v1")!));
    expect(saved.done[0].sequence).toBeLessThan(saved.latestAttempts[0].sequence);
    expect(saved.done[1].sequence).toBeLessThan(saved.latestAttempts[0].sequence);
  });

  test(`Persona distinguishes hold revise adopt at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const frame = await boot(page);
    await click(frame, '[data-action="challenge"]', false);
    await click(frame, '[data-ch-mode="advanced"]'); await click(frame, '[data-ch-task="sources"]');
    for (let i = 0; i < 3; i++) await click(frame, '[data-ch-condition="0"]');
    await click(frame, '[data-ch-issue="when"]'); await click(frame, "[data-ch-compare]");
    await click(frame, '[data-ch-decision="adopt"]');
    await expect(frame.locator(".challengeFeedback")).not.toBeEmpty();
    await finishAdvanced(frame, "hold");
    await click(frame, '[data-action="challenge"]', false);
    await click(frame, '[data-ch-mode="advanced"]'); await click(frame, '[data-ch-task="outing"]');
    for (let i = 0; i < 3; i++) await click(frame, '[data-ch-condition="0"]');
    await click(frame, '[data-ch-issue="budget"]'); await click(frame, '[data-ch-issue="time"]');
    await click(frame, "[data-ch-compare]"); await finishAdvanced(frame, "revise");
    await page.reload();
    await click(frame, '[data-action="challenge"]', false);
    await click(frame, ".challengeModal details summary");
    await click(frame, '[data-ch-history="1"]');
    await click(frame, "[data-history-replay]");
    await click(frame, '[data-ch-issue="none"]'); await click(frame, "[data-ch-compare]");
    await finishAdvanced(frame, "adopt");
    const saved = await frame.locator("html").evaluate(() => JSON.parse(localStorage.getItem("aippo_kids_journey_v1")!));
    expect(saved.challenges.slice(-3).map((r: { decisionSelected: string }) => r.decisionSelected)).toEqual(["hold", "revise", "adopt"]);
  });
}
