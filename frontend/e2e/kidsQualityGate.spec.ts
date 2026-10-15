import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { kidsViewports } from "./kidsViewportMatrix";

/** Local Chromium geometry and interaction evidence; not a child comprehension study.
 * Existing Playwright configuration retains screenshots only when a test fails.
 * Test input is synthetic and does not contain user data or call external AI.
 */
const sizes = kidsViewports;
const iframe = 'iframe[title="AIPPO Kids AIぼうけん・学習プレビュー"]';
const slack = 2;

async function noHorizontalOverflow(frame: FrameLocator, page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(slack);
  await expect.poll(() => frame.locator("html").evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(slack);
}

async function fitsViewportAndContainer(locator: Locator, container: string) {
  await expect(locator).toBeVisible();
  await expect.poll(() => locator.evaluate((element, args) => {
    const r = element.getBoundingClientRect();
    const parent = element.closest(args.container);
    if (!parent) return ["missing container"];
    const bounds = parent.getBoundingClientRect();
    const issues = [];
    if (r.width <= 0 || r.height <= 0) issues.push("zero area");
    if (r.left < -args.slack || r.top < -args.slack || r.right > innerWidth + args.slack || r.bottom > innerHeight + args.slack) issues.push("outside viewport");
    if (r.left < bounds.left - args.slack || r.top < bounds.top - args.slack || r.right > bounds.right + args.slack || r.bottom > bounds.bottom + args.slack) issues.push("outside " + args.container);
    return issues;
  }, { container, slack })).toEqual([]);
}

async function headerAndImages(frame: FrameLocator) {
  const logo = frame.locator(".brandLogo");
  await fitsViewportAndContainer(logo, ".top");
  await expect.poll(() => logo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => logo.evaluate((image) => {
    const r = image.getBoundingClientRect();
    const header = image.closest(".top")!.getBoundingClientRect();
    return Math.abs((r.left + r.right) / 2 - (header.left + header.right) / 2);
  })).toBeLessThanOrEqual(slack);
  const characters = frame.locator(".po img");
  // The parent pyramid intentionally has no character image.
  if (!(await frame.locator(".parentView").count())) expect(await characters.count()).toBeGreaterThan(0);
  for (const image of await characters.all()) {
    await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  for (const button of await frame.locator(".top button").all()) await fitsViewportAndContainer(button, ".top");
}

async function ordinaryScreen(frame: FrameLocator, page: Page, selectors: string) {
  await noHorizontalOverflow(frame, page);
  await headerAndImages(frame);
  const controls = frame.locator(selectors);
  expect(await controls.count()).toBeGreaterThan(0);
  for (const button of await controls.all()) {
    await fitsViewportAndContainer(button, ".shell");
    if (await button.isEnabled()) await button.click({ trial: true });
  }
}

/** Adult dialog/settings may scroll. Verify reachability after scrolling instead
 * of treating every offscreen adult control as child-screen clipping.
 */
async function reachableAdultControl(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await fitsViewportAndContainer(control, ".shell");
  await control.click({ trial: true });
}

for (const viewport of sizes) {
  test(`Kids primary flow fits ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      // Clear only Kids records; the standard app is not part of this test.
      localStorage.removeItem("aippo_kids_journey_v1");
      localStorage.removeItem("aippo_kids_settings_v1");
    });
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.goto("/kids");
    await expect(page.locator(iframe)).toBeVisible();
    const frame = page.frameLocator(iframe);
    await expect(frame.locator(".homeTitle")).toContainText("AI");
    await ordinaryScreen(frame, page, ".homeView button");
    if (viewport.width === 844 && testInfo.project.name === 'desktop') await page.screenshot({ path: testInfo.outputPath('landscape-home.png') });

    await frame.locator('[data-action="start"]').click();
    await expect(frame.locator(".guardianDialog")).toBeVisible();
    await noHorizontalOverflow(frame, page);
    await expect(frame.locator(".guardianDialog")).toContainText("シミュレーション");
    await frame.locator("#first-mode").selectOption("guided");
    for (const button of await frame.locator(".guardianDialog button").all()) await reachableAdultControl(button);
    await frame.locator('[data-guardian="ok"]').click();

    await expect(frame.locator(".worldView")).toBeVisible();
    await ordinaryScreen(frame, page, ".worldView button");
    if (viewport.width === 844 && testInfo.project.name === 'desktop') await page.screenshot({ path: testInfo.outputPath('landscape-map.png') });
    await frame.locator('[data-action="current"]').click();
    await expect(frame.locator(".questTitle")).toContainText("いろ");
    await ordinaryScreen(frame, page, '.view [data-select], .view [data-nav], .view .actionBar button');
    await frame.locator('[data-select="color:blue"]').click();
    await fitsViewportAndContainer(frame.locator('[data-action="submit"]'), ".shell");
    await frame.locator('[data-action="submit"]').click();
    await expect(frame.locator(".resultNotice")).toContainText("つたわった");
    await ordinaryScreen(frame, page, ".view .actionBar button, .view [data-nav]");
    await frame.locator('[data-action="next"]').click();
    await expect(frame.locator(".success")).toBeVisible();
    await ordinaryScreen(frame, page, ".view button");
    await frame.locator('[data-action="next"]').click();

    await frame.locator('.top [data-nav="parent"]').click();
    await expect(frame.locator(".parentView")).toBeVisible();
    await noHorizontalOverflow(frame, page);
    await headerAndImages(frame);
    // Adult-only details can scroll; every control must remain reachable.
    for (const button of await frame.locator(".parentView button").all()) await reachableAdultControl(button);
    await frame.locator('[data-action="recent"]').click();
    await expect(frame.locator(".summaryModal")).toContainText("自己申告");
    await noHorizontalOverflow(frame, page);
    await reachableAdultControl(frame.locator("[data-recent-close]"));
    await frame.locator("[data-recent-close]").click();

    await frame.locator('.top [data-nav="settings"]').click();
    await expect(frame.locator(".settingsView")).toBeVisible();
    await noHorizontalOverflow(frame, page);
    await headerAndImages(frame);
    for (const button of await frame.locator(".settingsView button").all()) await reachableAdultControl(button);
    await frame.locator('[data-action="settings-done"]').click();
    await expect(frame.locator(".homeView")).toBeVisible();
    expect(failures).toEqual([]);
  });
}
