import { expect, test, type Locator, type Page } from "@playwright/test";

// Synthetic browser interaction/fault tests, not a child comprehension study.
// Native media is checked separately from deterministic media-event injection.
const seenKey = "aippo_title_opening_v1";
const layer = ".openingLayer";

async function anonymousSession(page: Page) {
  await page.route("**/api/v1/accounts/**", (route) => route.fulfill({
    status: 401, contentType: "application/json", body: '{"detail":"Not authenticated"}',
  }));
}

async function titleReady(page: Page) {
  await expect(page.locator(".posterTitle")).toBeVisible();
  await expect(page.locator(layer)).toHaveCount(0);
  await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
  await expect(page.locator('[data-action="poster-start"]:visible')).toBeEnabled();
}

async function controlledMedia(page: Page, mode: "playing" | "pending" | "reject") {
  await page.addInitScript((behavior) => {
    // Avoid network/codec timing in explicit failure tests. Native playback has
    // its own test below, so injected events cannot certify the video asset.
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      configurable: true,
      get() { return this.getAttribute("data-test-source") || ""; },
      set(value: string) { this.setAttribute("data-test-source", value); },
    });
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.pause = function () {};
    HTMLMediaElement.prototype.play = function () {
      if (behavior === "reject") return Promise.reject(new DOMException("Injected autoplay denial", "NotAllowedError"));
      if (behavior === "playing") this.dispatchEvent(new Event("playing"));
      return Promise.resolve();
    };
  }, mode);
}

async function hitTarget(button: Locator) {
  await expect(button).toBeVisible();
  expect(await button.evaluate((element) => {
    const r = element.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      largeEnough: r.width >= 44 && r.height >= 44,
      inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
      unobstructed: hit === element || (hit !== null && element.contains(hit)),
    };
  })).toEqual({ largeEnough: true, inside: true, unobstructed: true });
  await button.click({ trial: true });
}

test.beforeEach(async ({ page }) => {
  await anonymousSession(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
});

test("native first visit plays a muted four-second asset and returns to usable title", async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("ended", (event) => {
      if (event.target instanceof HTMLVideoElement) document.documentElement.dataset.nativeOpeningEnded = String(event.target.currentTime);
    }, true);
  });
  await page.goto("/kids-title/");
  const video = page.locator(`${layer} video`);
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).duration)).toBeGreaterThanOrEqual(3.8);
  expect(await video.evaluate((v) => {
    const media = v as HTMLVideoElement;
    return { muted: media.muted, inline: media.playsInline, duration: media.duration };
  })).toMatchObject({ muted: true, inline: true });
  expect(await video.evaluate((v) => (v as HTMLVideoElement).duration)).toBeLessThanOrEqual(4.2);
  await expect(page.locator(layer)).toHaveCount(0, { timeout: 7_000 });
  expect(Number(await page.locator("html").getAttribute("data-native-opening-ended"))).toBeGreaterThanOrEqual(3.8);
  await titleReady(page);
  expect(await page.evaluate((key) => localStorage.getItem(key), seenKey)).toBe("seen");
  await page.reload();
  await titleReady(page);
  await expect(page.locator(layer)).toHaveCount(0);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 664 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1363, height: 936 }]) {
  test(`opening lands on the same artwork without a layout jump ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await controlledMedia(page, "playing");
    await page.goto("/kids-title/");
    const video = page.locator(`${layer} video`);
    const landing = page.locator('.openingLanding');
    await expect.poll(() => landing.evaluate(e => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    async function sameArtworkRectangle() {
      const expected = await page.locator('.posterArtwork').boundingBox();
      const actual = await page.locator('.openingArtboard').boundingBox();
      expect(expected).not.toBeNull(); expect(actual).not.toBeNull();
      for (const field of ['x', 'y', 'width', 'height'] as const) expect(actual![field]).toBeCloseTo(expected![field], 0);
    }
    await sameArtworkRectangle();
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
    await expect.poll(async () => {
      const a = await page.locator('.posterArtwork').boundingBox();
      const b = await page.locator('.openingArtboard').boundingBox();
      return Math.max(...(['x', 'y', 'width', 'height'] as const).map(k => Math.abs(a![k] - b![k])));
    }).toBeLessThan(1);
    await video.evaluate(e => { const v = e as HTMLVideoElement; v.currentTime = 3.4; v.dispatchEvent(new Event('timeupdate')); });
    await expect(landing).toHaveCSS('opacity', '1');
    await sameArtworkRectangle();
    const before = await page.locator('.posterArtwork').boundingBox();
    await video.dispatchEvent('ended');
    await titleReady(page);
    expect(await page.locator('.posterArtwork').boundingBox()).toEqual(before);
    await hitTarget(page.locator('[data-action="poster-start"]:visible'));
    await expect(page.locator('#poster-start-hint')).toContainText('登録なし');
  });
}

test("skip, return from settings and reload keep the title usable without a replay button", async ({ page }) => {
  await controlledMedia(page, "playing");
  await page.goto("/kids-title/");
  await hitTarget(page.locator("[data-opening-skip]"));
  await page.locator("[data-opening-skip]").click();
  await titleReady(page);
  await page.locator('[data-action="poster-settings"]:visible').click();
  await expect(page.locator(".settingsView")).toBeVisible();
  await page.locator('[data-action="settings-done"]').click();
  await titleReady(page);
  await expect(page.locator('[data-opening-replay]')).toHaveCount(0);
  await page.reload();
  await titleReady(page);
});

test("revisit uses a thirty-minute inactivity gap and recent interactions reset it", async ({ page }) => {
  await controlledMedia(page, "playing");
  await page.clock.install({ time: new Date('2026-10-17T12:00:00Z') });
  await page.goto('/kids-title/');
  await page.locator('[data-opening-skip]').click();
  await page.clock.fastForward(29 * 60 * 1000);
  await page.locator('[data-action="poster-settings"]:visible').click();
  await page.locator('[data-action="settings-done"]').click();
  await page.clock.fastForward(2 * 60 * 1000);
  await page.reload();
  await titleReady(page);
  await page.clock.fastForward(30 * 60 * 1000);
  await page.reload();
  await expect(page.locator(layer)).toBeVisible();
  await page.locator('[data-opening-skip]').click();
  await titleReady(page);
  await page.reload();
  await titleReady(page);
  await expect(page.locator('[data-opening-replay]')).toHaveCount(0);
});

for (const failure of ["error", "load-timeout", "stall", "play-reject", "maximum-duration"] as const) {
  test(`opening ${failure} falls back without blocking entry`, async ({ page }) => {
    await controlledMedia(page, failure === "play-reject" ? "reject" : failure === "load-timeout" ? "pending" : "playing");
    await page.clock.install();
    await page.goto("/kids-title/");
    if (failure !== "play-reject") {
      await expect(page.locator(layer)).toBeVisible();
      if (failure === "error") await page.locator(`${layer} video`).dispatchEvent("error");
      if (failure === "stall") await page.locator(`${layer} video`).dispatchEvent("waiting");
      if (failure === "load-timeout" || failure === "stall") await page.clock.fastForward(1_300);
      if (failure === "maximum-duration") await page.clock.fastForward(5_600);
    }
    await titleReady(page);
    await page.locator('[data-action="poster-login"]:visible').click();
    await expect(page.locator(".accountView")).toBeVisible();
  });
}

for (const preference of ["reduced-motion", "save-data", "storage-read-fails", "storage-write-fails"] as const) {
  test(`${preference} skips automatic playback and leaves entry available`, async ({ page }) => {
    await controlledMedia(page, "playing");
    if (preference === "reduced-motion") await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(({ kind, key }) => {
      if (kind === "save-data") Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
      if (kind === "storage-read-fails") {
        const original = Storage.prototype.getItem;
        Storage.prototype.getItem = function (name) {
          if (name === key) throw new DOMException("Injected storage read failure", "SecurityError");
          return original.call(this, name);
        };
      }
      if (kind === "storage-write-fails") {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (name, value) {
          if (name === key) throw new DOMException("Injected storage write failure", "QuotaExceededError");
          return original.call(this, name, value);
        };
      }
    }, { kind: preference, key: seenKey });
    await page.goto("/kids-title/");
    await titleReady(page);
    await page.locator('[data-action="poster-settings"]:visible').click();
    await page.locator('[data-action="settings-done"]').click();
    await titleReady(page);
    await page.reload();
    await titleReady(page);
    await expect(page.locator('[data-opening-replay]')).toHaveCount(0);
  });
}

for (const viewport of [
  { width: 320, height: 568 }, { width: 375, height: 667 },
  { width: 390, height: 664 }, { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 568, height: 320 }, { width: 844, height: 390 },
  { width: 768, height: 1024 }, { width: 1024, height: 768 },
]) {
  test(`title artwork and hit maps fit ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/kids-title/");
    await titleReady(page);
    await expect.poll(() => page.locator(".posterArtwork").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (viewport.width < viewport.height && viewport.width <= 600) {
      const r = await page.locator(".posterArtboard").boundingBox();
      expect(r).not.toBeNull();
      expect(r!.x).toBeLessThanOrEqual(1);
      expect(r!.x + r!.width).toBeGreaterThanOrEqual(viewport.width - 1);
    }
    const buttons = page.locator('[data-action^="poster-"]:visible');
    await expect(buttons).toHaveCount(4);
    for (const button of await buttons.all()) await hitTarget(button);
    await expect(page.locator('[data-opening-replay]')).toHaveCount(0);
    const overlapping = await buttons.evaluateAll((elements) => elements.flatMap((a, i) => elements.slice(i + 1).filter((b) => {
      const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
      return Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1;
    }).map((b) => [a.getAttribute("data-action"), b.getAttribute("data-action")])));
    expect(overlapping).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`title-${viewport.width}x${viewport.height}.png`) });
    await page.locator('[data-action="poster-guest"]:visible').click();
    await expect(page.locator(".guardianDialog")).toBeVisible();
  });
}
