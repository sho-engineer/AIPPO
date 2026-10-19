import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { kidsPhonePairs } from "./kidsViewportMatrix";
import { liveQuests, seedStableProgress, selectQuest } from "./kidsProgressionHelpers";

test.use({ actionTimeout: 10_000 });

const iframe = 'iframe[title="AIPPO Kids AIぼうけん・学習プレビュー"]';
const pairs = [...kidsPhonePairs, { width: 768, height: 1024 }];
async function fits(control: Locator) {
  await expect(control).toBeVisible();
  await expect.poll(() => control.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.left >= -2 && r.top >= -2 && r.right <= innerWidth + 2 && r.bottom <= innerHeight + 2
      ? null : { text: el.textContent, x: r.x, y: r.y, width: r.width, height: r.height, viewport: [innerWidth, innerHeight] };
  })).toBeNull();
}
for (const viewport of [{ width: 568, height: 320 }, { width: 844, height: 390 }]) {
  test(`Kids landscape storage warning preserves dialog access ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/kids');
    const frame = page.frameLocator(iframe);
    await frame.locator('html').evaluate(() => {
      localStorage.setItem('aippo_kids_settings_v1', JSON.stringify({ guardianAccepted: true, ageBand: '7-9', challengeMode: 'guided' }));
      localStorage.removeItem('aippo_kids_journey_v1');
    });
    await page.reload();
    const beforeFailure = await snapshot(frame);
    await frame.locator('html').evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); }; });
    await frame.locator('[data-action="start"]').click();
    await frame.locator('[data-story-skip]').click();
    await frame.locator('[data-quest="0"]').click();
    await frame.locator('[data-action="enter-quest"]').click();
    await frame.locator('[data-select="color:blue"]').click();
    await frame.locator('[data-action="submit"]').click();
    await expect(frame.locator('.resultNotice')).toContainText('つたわった');
    await frame.locator('[data-action="next"]').click();
    await expect(frame.locator('.storageNotice')).toContainText('保存を確認できません');
    await childScreen(page, frame);
    await frame.locator('.top [data-nav="parent"]').click();
    await adultClick(frame, '[data-action="challenge"]');
    await adultClick(frame, '[data-ch-mode="advanced"]');
    await adultClick(frame, '[data-ch-task="sources"]');
    for (let i = 0; i < 3; i++) await adultClick(frame, '[data-ch-condition="0"]');
    await fits(frame.locator('.challengeContext'));
    await fits(frame.locator('[data-ch-close]'));
    await expect(frame.locator('.challengeNotice')).toContainText('保存できません');
    await expect(frame.locator('.challengeNotice')).not.toContainText('端末に残ります');
    await expect.poll(() => frame.locator('.challengeModal .dailyScroll').evaluate(el => el.clientHeight)).toBeGreaterThanOrEqual(44);
    await adultClick(frame, '[data-ch-issue="when"]');
    await frame.locator('[data-ch-close]').click();
    await expect(frame.locator('.storageNotice')).toBeVisible();
    await frame.locator('.top [data-nav="map"]').click();
    await frame.locator('[data-nav="home"]').click();
    await expect(frame.locator('.storageNotice')).toBeVisible();
    await childScreen(page, frame);
    expect(await snapshot(frame)).toEqual(beforeFailure);
  });
}
async function childScreen(page: Page, frame: FrameLocator) {
  if (await frame.locator('[data-story-skip]').count()) await frame.locator('[data-story-skip]').click();
  await expect.poll(() => page.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight])).toEqual([0, 0]);
  await expect.poll(() => frame.locator('html').evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(2);
  await expect.poll(() => frame.locator('.app').evaluate(el => el.getBoundingClientRect().bottom - innerHeight)).toBeLessThanOrEqual(2);
  await expect.poll(() => frame.locator('.view').evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(2);
  if (await frame.locator('.worldView').count()) {
    for (const tab of await frame.locator('.worldRail [data-world]').all()) {
      await expect.poll(() => tab.evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.width >= 44 && r.height >= 44;
      })).toBe(true);
    }
    await expect.poll(() => frame.locator('.mapWorld').evaluate(el => {
      const story = el.querySelector('.mapStory')!.getBoundingClientRect();
      return [...el.querySelectorAll('.trailNode')].filter(node => {
        const r = node.getBoundingClientRect();
        return Math.min(r.right, story.right) - Math.max(r.left, story.left) > 2 && Math.min(r.bottom, story.bottom) - Math.max(r.top, story.top) > 2;
      }).map(node => node.textContent);
    })).toEqual([]);
  }
  await fits(frame.locator('.brandLogo'));
  await expect.poll(() => frame.locator('.brandLogo').evaluate(el => {
    const r = el.getBoundingClientRect(), p = el.closest('.top')!.getBoundingClientRect();
    return Math.abs((r.left + r.right - p.left - p.right) / 2);
  })).toBeLessThanOrEqual(2);
  for (const button of await frame.locator('.view button').all()) {
    if (await button.evaluate(el => Boolean(el.closest('.pathScroll')))) await button.scrollIntoViewIfNeeded();
    await fits(button);
    if (await button.isEnabled()) await button.click({ trial: true });
  }
}
async function adultClick(frame: FrameLocator, selector: string) {
  const control = frame.locator(selector);
  await control.scrollIntoViewIfNeeded(); await fits(control); await control.click();
}
async function snapshot(frame: FrameLocator) {
  return frame.locator('html').evaluate(() => [localStorage.getItem('aippo_kids_journey_v1'), localStorage.getItem('aippo_kids_settings_v1')]);
}
for (const portrait of pairs) {
  const landscape = { width: portrait.height, height: portrait.width };
  test(`Kids rotation retains state and all quest controls ${portrait.width}x${portrait.height}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize(portrait);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/kids');
    const frame = page.frameLocator(iframe);
    await seedStableProgress(frame.locator('html'), 26);
    await page.reload();
    await expect(frame.locator('.worldView')).toBeVisible();
    const initial = await snapshot(frame);
    await page.setViewportSize(landscape);
    await expect(frame.locator('.worldView')).toBeVisible();
    expect(await snapshot(frame)).toEqual(initial);
    const quests = await liveQuests(frame.locator('html'));
    for (let world = 0; world < 5; world++) {
      await frame.locator(`[data-world="${world}"]`).click();
      await childScreen(page, frame);
      for (const quest of quests.filter(q => q.world === world)) {
        // Back resumes the current world, so reselect the requested chapter.
        await selectQuest(frame, quest.id);
        await childScreen(page, frame);
        if (quest.kind === 'checkpoint') {
          await frame.locator(`[data-test-answer="${[0, 1, 2, 1, 2][world]}"]`).click();
          await childScreen(page, frame);
          if (world === 1) { await frame.locator('[data-practice-spot="color"]').click(); await childScreen(page, frame); }
          const focuses = await frame.locator('[data-practice-focus]').evaluateAll(nodes => nodes.map(n => (n as HTMLElement).dataset.practiceFocus!));
          for (const focus of focuses) {
            await frame.locator(`[data-practice-focus="${focus}"]`).click();
            await childScreen(page, frame);
          }
        }
        await frame.locator('.questHead [data-nav="map"]').click();
      }
    }
    expect(await snapshot(frame)).toEqual(initial);
    await frame.locator('[data-world="0"]').click();
    await frame.locator('[data-quest="0"]').click();
    await frame.locator('[data-action="enter-quest"]').click();
    const beforeSelection = await frame.locator('[data-action="submit"]').boundingBox();
    await frame.locator('[data-select="color:blue"]').click();
    const afterSelection = await frame.locator('[data-action="submit"]').boundingBox();
    expect(afterSelection!.x).toBeCloseTo(beforeSelection!.x, 1);
    expect(afterSelection!.y).toBeCloseTo(beforeSelection!.y, 1);
    for (const size of [portrait, landscape, portrait]) {
      await page.setViewportSize(size);
      await expect(frame.locator('[data-select="color:blue"]')).toHaveAttribute('aria-pressed', 'true');
      await childScreen(page, frame);
      expect(await snapshot(frame)).toEqual(initial);
    }
    await frame.locator('[data-action="submit"]').click();
    await expect(frame.locator('.resultNotice')).toContainText('つたわった');
    await page.setViewportSize(landscape);
    await childScreen(page, frame);
    await frame.locator('[data-action="next"]').click();
    await expect(frame.locator('.success')).toBeVisible();
    await childScreen(page, frame);
    const completed = await snapshot(frame);
    await page.setViewportSize(portrait);
    await expect(frame.locator('.success')).toBeVisible();
    expect(await snapshot(frame)).toEqual(completed);
    await frame.locator('[data-action="next"]').click();

    await frame.locator('.top [data-nav="parent"]').click();
    await adultClick(frame, '[data-action="recent"]');
    const summary = await frame.locator('.summaryModal').innerText();
    await page.setViewportSize(landscape);
    await expect(frame.locator('.summaryModal')).toHaveText(summary, { useInnerText: true });
    await adultClick(frame, '[data-recent-close]');
    await adultClick(frame, '.parentTop [data-nav="map"]');
    await frame.locator('.worldHomeBtn').click();
    // Home's basis-adventure entry now opens the map directly. Keep that
    // navigation assertion, then reach daily practice through growth records.
    await frame.locator('.homeView [data-action="challenge"]').click();
    await expect(frame.locator('.worldView')).toBeVisible();
    await childScreen(page, frame);
    await frame.locator('.top [data-nav="parent"]').click();
    await adultClick(frame, '.parentView [data-action="challenge"]');
    await adultClick(frame, '[data-ch-mode="advanced"]');
    await adultClick(frame, '[data-ch-task="sources"]');
    for (let i = 0; i < 3; i++) await adultClick(frame, '[data-ch-condition="0"]');
    await adultClick(frame, '[data-ch-issue="when"]');
    const context = await frame.locator('.challengeContext').innerText();
    for (const size of [portrait, landscape]) {
      await page.setViewportSize(size);
      await expect(frame.locator('.challengeContext')).toHaveText(context, { useInnerText: true });
      await expect(frame.locator('[data-ch-issue="when"]')).toHaveAttribute('aria-pressed', 'true');
      await fits(frame.locator('.challengeContext')); await fits(frame.locator('[data-ch-close]'));
      await expect.poll(() => frame.locator('.challengeModal .dailyScroll').evaluate(el => el.clientHeight)).toBeGreaterThanOrEqual(44);
      await frame.locator('.challengeModal .dailyScroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await fits(frame.locator('[data-ch-close]')); expect(await snapshot(frame)).toEqual(completed);
    }
    if (portrait.width === 390 && testInfo.project.name === 'desktop') await page.screenshot({ path: testInfo.outputPath('landscape-conditions.png') });
    await frame.locator('[data-ch-close]').click();
    await frame.locator('.top [data-nav="settings"]').click();
    await frame.locator('#child-reading').selectOption('off');
    await page.setViewportSize(portrait);
    await expect(frame.locator('#child-reading')).toHaveValue('off');
    expect(await snapshot(frame)).toEqual(completed);
    expect(errors).toEqual([]);
  });
}
