import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import { liveQuests, seedStableProgress, selectQuest, type KidsWindow } from "./kidsProgressionHelpers";

const iframe = 'iframe[title="AIPPO Kids AIぼうけん・学習プレビュー"]';
type Surface = FrameLocator | Page;
const storageKey = "aippo_kids_journey_v1";

async function boot(page: Page, route: string): Promise<Surface> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/v1/accounts/**", r => r.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await page.goto(route);
  const ui = route === "/kids" ? page.frameLocator(iframe) : page;
  await expect.poll(() => ui.locator("html").evaluate(() => Boolean((window as unknown as KidsWindow).AIPPO_TEST))).toBe(true);
  return ui;
}
async function record(ui: Surface) {
  return ui.locator("html").evaluate((_, key) => JSON.parse(localStorage.getItem(key)!), storageKey);
}
async function tap(ui: Surface, selector: string) {
  if (await ui.locator('[data-story-skip]').count()) await ui.locator('[data-story-skip]').click();
  const b = ui.locator(selector);
  await expect(b).toBeVisible();
  const geometry = await b.evaluate(e => {
    const r = e.getBoundingClientRect();
    const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { size: r.width >= 44 && r.height >= 44, inside: r.left >= -2 && r.top >= -2 && r.right <= innerWidth + 2 && r.bottom <= innerHeight + 2, hit: target === e || (target !== null && e.contains(target)), rect: [r.x,r.y,r.width,r.height] };
  });
  expect({ size: geometry.size, inside: geometry.inside, hit: geometry.hit }, `${selector}: ${JSON.stringify(geometry.rect)}`).toEqual({ size: true, inside: true, hit: true });
  await b.click();
}
async function stageState(ui: Surface, nextQuest = "w2-q1") {
  return ui.locator("html").evaluate((_, id) => {
    const api = (window as unknown as KidsWindow).AIPPO_TEST;
    return { passed: api.stagePassed(0), rank: api.mastery(), next: api.unlocked(api.quests.findIndex(q => q.id === id)) };
  }, nextQuest);
}
async function screenGeometry(ui: Surface) {
  expect(await ui.locator("html").evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(2);
  if (!(await ui.locator(".top").count())) return;
  expect(await ui.locator(".top").evaluate(header => {
    const items = [...header.querySelectorAll(".brandLogo,button")].map(e => e.getBoundingClientRect());
    const clipped = items.some(r => r.left < -2 || r.top < -2 || r.right > innerWidth + 2 || r.bottom > innerHeight + 2);
    const overlap = items.some((a, i) => items.slice(i + 1).some(b => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2));
    return { clipped, overlap };
  })).toEqual({ clipped: false, overlap: false });
}
async function completeFirstAssessment(ui: Surface) {
  await selectQuest(ui, "w1-test");
  await screenGeometry(ui);
  await tap(ui, '[data-test-answer="0"]');
  await tap(ui, '[data-select="color:pink"]');
  await tap(ui, '[data-select="place:forest"]');
  await screenGeometry(ui);
  await tap(ui, '[data-action="practice-submit"]');
  await expect(ui.locator(".success")).toBeVisible();
}
async function reloadAtMap(page: Page, ui: Surface) {
  await page.reload();
  await expect(ui.locator('.posterTitle,.homeView,.worldView').first()).toBeVisible();
  if (await ui.locator(".posterTitle").count()) await tap(ui, '[data-action="poster-start"]:visible');
  if (await ui.locator(".homeView").count()) await tap(ui, '.homeView [data-action="challenge"]');
  await expect(ui.locator(".worldView")).toBeVisible();
}
async function learningHome(ui: Surface) {
  await expect(ui.locator('.posterTitle,.homeView,.worldView').first()).toBeVisible();
  if (await ui.locator(".posterTitle").count()) await tap(ui, '[data-action="poster-start"]:visible');
  await expect(ui.locator(".homeView")).toBeVisible();
  await screenGeometry(ui);
}

for (const route of ["/kids", "/kids-title/"]) {
  for (const viewport of [{width:320,height:568},{width:568,height:320}]) {
    test(`reading settings save gives persistent feedback without moving controls ${route} ${viewport.width}x${viewport.height}`, async ({page})=>{
      await page.setViewportSize(viewport);
      const ui=await boot(page,route);
      await seedStableProgress(ui.locator('html'),0);
      await reloadAtMap(page,ui);
      if(await ui.locator('[data-story-skip]').count())await ui.locator('[data-story-skip]').click();
      await tap(ui,'.top [data-nav="settings"]');
      const reading=ui.locator('#child-reading');
      await expect(reading).toHaveValue('on');
      await reading.selectOption('off');
      await expect(ui.locator('.settingsSaveStatus')).toContainText('まだ保存していません');
      const save=ui.locator('[data-action="profile-save"]');
      await save.scrollIntoViewIfNeeded();
      const rect=()=>save.evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
      const before=await rect();
      await tap(ui,'[data-action="profile-save"]');
      await expect(save).toContainText('保存しました');
      await expect(ui.locator('.settingsSaveStatus')).toContainText('この端末に保存しました');
      expect(await rect()).toEqual(before);
      await ui.locator('.settingsScroll').screenshot({path:test.info().outputPath('settings-saved.png')});
      await page.reload();
      await expect(ui.locator('.posterTitle,.homeView,.worldView').first()).toBeVisible();
      if(await ui.locator('[data-story-skip]').count())await ui.locator('[data-story-skip]').click();
      if(await ui.locator('.posterTitle').count())await tap(ui,'[data-action="poster-start"]:visible');
      await tap(ui,'.top [data-nav="settings"]');
      await expect(ui.locator('#child-reading')).toHaveValue('off');
      await ui.locator('#child-reading').selectOption('on');
      await ui.locator('[data-action="profile-save"]').scrollIntoViewIfNeeded();
      await tap(ui,'[data-action="profile-save"]');
      await expect(ui.locator('[data-action="profile-save"]')).toContainText('保存しました');
    });
  }
  for (const viewport of [{ width: 1363, height: 936 }, { width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }, { width: 568, height: 320 }]) {
    test(`critical result comparison keeps both cards visible ${route} ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const ui = await boot(page, route);
      await seedStableProgress(ui.locator("html"), 0);
      await reloadAtMap(page, ui);
      // A narrow dialogue must move a whole word to the next line, rather
      // than splitting ロケット across lines.
      if (await ui.locator('[data-story-skip]').count()) await ui.locator('[data-story-skip]').click();
      expect(await ui.locator('.mapStory p').evaluate(el => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const start = (node.textContent || '').indexOf('ロケット');
          if (start < 0) continue;
          const range = document.createRange();
          range.setStart(node, start); range.setEnd(node, start + 4);
          return new Set([...range.getClientRects()].map(r => Math.round(r.top))).size === 1;
        }
        return false;
      })).toBe(true);
      if (viewport.width===320) await ui.locator('.view').screenshot({path:test.info().outputPath('map-word-wrap.png')});
      await selectQuest(ui, "w1-q1");
      const request = ui.locator('.questWords .shortRequest');
      await expect(request).toContainText('あおに');
      expect(await request.evaluate(el => { const r=el.getBoundingClientRect(); return parseFloat(getComputedStyle(el).fontSize)>=16 && r.height>=48 && r.top>=0 && r.bottom<=innerHeight; })).toBe(true);
      if (viewport.width===390) await ui.locator('.view').screenshot({path:test.info().outputPath('first-request.png')});

      // Exercise both mismatch/retry and success through actual controls.
      for (const color of ["pink", "blue"]) {
        await tap(ui, `[data-select="color:${color}"]`);
        await tap(ui, '[data-action="submit"]');
        await expect(ui.locator(".resultNotice")).toContainText(color === "blue" ? "つたわった" : "もういちど");
        expect(await ui.locator('.resultNotice').evaluate(el=>{const r=el.getBoundingClientRect();return parseFloat(getComputedStyle(el).fontSize)>=16&&r.height>=44&&r.top>=0&&r.bottom<=innerHeight})).toBe(true);
        const cards = ui.locator(".resultCompare > .preview");
        await expect(cards).toHaveCount(2);
        for (const card of await cards.all()) await expect(card).toBeInViewport({ ratio: 1 });
        expect(await cards.evaluateAll(elements => {
          const [a, b] = elements.map(e => e.getBoundingClientRect());
          return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        })).toBe(0);
        await screenGeometry(ui);
        await tap(ui, '[data-action="next"]');
      }
      await expect(ui.locator(".success")).toBeVisible();
      expect(await ui.locator('.rewardSpeech>p').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16)).toBe(true);
      expect(Object.keys((await record(ui)).done)).toEqual(["w1-q1"]);
      await expect(ui.locator('.missionStamp')).toHaveCount(10);
      await expect(ui.locator('.missionStamp.earned')).toHaveCount(1);
      await expect(ui.locator('.miniTier.earned')).toHaveCount(0);
      await expect(ui.locator('.missionStampCard')).toBeInViewport({ratio:1});
      for(const slot of await ui.locator('.missionStamp').all())await expect(slot).toBeInViewport({ratio:1});
      if(viewport.width===390||viewport.width===320||viewport.width===568)await ui.locator('.view').screenshot({path:test.info().outputPath('mission-stamp-card.png')});
      await tap(ui,'[data-action="daily"]');
      await expect(ui.locator('.dailyChild')).not.toContainText(/[一-龯]/);
      await expect(ui.locator('.dailyParent')).not.toHaveAttribute('open','');
      for(const goal of await ui.locator('[data-daily-goal]').all())await expect(goal).toBeInViewport({ratio:1});
      await tap(ui,'[data-daily-goal="thanks"]');
      await tap(ui,'[data-daily-check="yes"]');
      await expect(ui.locator('.dailyChild')).not.toContainText(/[一-龯]/);
      if(viewport.width===390||viewport.width===568)await ui.locator('.dailyModal').screenshot({path:test.info().outputPath('po-home-mission.png')});
      await tap(ui,'[data-daily-later]');
      await expect(ui.locator('.dailyModal')).toHaveCount(0);
    });
  }
  for (const viewport of [{ width: 1363, height: 936 }, { width: 1280, height: 720 }]) {
    test(`critical growth records keep pyramid and evidence separate ${route} ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const ui = await boot(page, route);
      await seedStableProgress(ui.locator("html"), 1);
      await reloadAtMap(page, ui);
      await tap(ui, '.top [data-nav="parent"]');
      await expect(ui.locator('.parentView')).toBeVisible();
      await expect(ui.locator('.parentView .tier')).toHaveCount(5);

      async function separateSections() {
        // Compare document rectangles, not just currently visible pixels:
        // adult scrolling is allowed, overlapping content is not.
        const overlaps = await ui.locator('.parentView').evaluate(parent => {
          const items = [...parent.querySelectorAll('.parentTop,.parentIntro,.tier,.evidence,.competencySummary,.parentBottom')];
          return items.flatMap((a, i) => items.slice(i + 1).flatMap(b => {
            const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
            return Math.min(x.right, y.right) - Math.max(x.left, y.left) > 2 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 2
              ? [`${a.className} / ${b.className}`] : [];
          }));
        });
        expect(overlaps).toEqual([]);
        await screenGeometry(ui);
      }
      await separateSections();
      for (let tier = 0; tier < 5; tier++) {
        await ui.locator(`[data-tier="${tier}"]`).scrollIntoViewIfNeeded();
        await tap(ui, `[data-tier="${tier}"]`);
        await expect(ui.locator('.evidenceTitle')).toContainText(`LEVEL ${5 - tier}`);
        await separateSections();
      }
      for (const label of await ui.locator('.parentIntro,.tierTitle,.evidenceTitle,.evidenceBody,.competencySummary').all()) {
        await label.scrollIntoViewIfNeeded();
        await expect(label).toBeInViewport();
        expect(await label.evaluate(e => {
          const r = e.getBoundingClientRect(), parent = e.closest('.parentView')!.getBoundingClientRect();
          return r.left >= -2 && r.right <= innerWidth + 2 && r.top >= Math.max(0, parent.top) - 2 && r.bottom <= Math.min(innerHeight, parent.bottom) + 2;
        })).toBe(true);
      }
      await ui.locator('.parentBottom [data-action="map"]').scrollIntoViewIfNeeded();
      await tap(ui, '.parentBottom [data-action="map"]');
      await expect(ui.locator('.worldView')).toBeVisible();
    });
  }
  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
    test(`critical long literacy feedback and failed save retain stamps ${route} ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const ui = await boot(page, route);
      await seedStableProgress(ui.locator("html"), 5);
      await reloadAtMap(page, ui);
      await selectQuest(ui, "w1-audience");
      await screenGeometry(ui);
      const original = await record(ui);
      await tap(ui, '[data-literacy="0"]');
      await expect(ui.locator(".testFeedback")).toContainText("読む");
      expect((await record(ui)).done["w1-audience"]).toBeUndefined();
      expect(await record(ui)).toEqual(original);
      for (const choice of await ui.locator("[data-literacy]").all()) {
        expect(await choice.evaluate(e => {
          const r = e.getBoundingClientRect();
          return r.width >= 44 && r.height >= 44 && r.left >= -2 && r.right <= innerWidth + 2 && r.top >= -2 && r.bottom <= innerHeight + 2;
        })).toBe(true);
      }
      expect(await ui.locator(".view").evaluate(e => e.scrollHeight - e.clientHeight)).toBeLessThanOrEqual(2);
      await tap(ui, '[data-literacy="1"]');
      await expect(ui.locator(".success")).toBeVisible();
      const successful = await record(ui);
      expect(successful.done["w1-audience"]).toMatchObject({ attempts: 2, choices: { answer: 1 } });
      expect(Object.keys(successful.done)).toHaveLength(6);
      expect(await stageState(ui)).toEqual({ passed: false, rank: 0, next: false });

      // A failed replay save must not replace the last durable snapshot or
      // advertise the in-memory record as safely persisted.
      await tap(ui, '[data-action="next"]');
      await selectQuest(ui, "w1-audience");
      await ui.locator("html").evaluate(() => {
        Storage.prototype.setItem = () => { throw new DOMException("Synthetic quota failure", "QuotaExceededError"); };
      });
      await tap(ui, '[data-literacy="1"]');
      await expect(ui.locator(".storageNotice")).toContainText("保存を確認できません");
      expect(await record(ui)).toEqual(successful);
      await screenGeometry(ui);
      await tap(ui, '[data-action="next"]');
      await screenGeometry(ui);
      await tap(ui, '[data-nav="home"]');
      await expect(ui.locator(".storageNotice")).toBeVisible();
      expect(await record(ui)).toEqual(successful);
    });
  }
  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 390, height: 664 }, { width: 664, height: 390 }]) {
    test(`critical progression AND gate and replay dedup ${route} ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const ui = await boot(page, route);
      const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
      const quests = await liveQuests(ui.locator("html"));
      expect(Array.from({ length: 5 }, (_, world) => quests.filter(q => q.world === world && q.kind !== "checkpoint").length)).toEqual([10, 3, 3, 3, 3]);
      expect(Array.from({ length: 5 }, (_, world) => quests.filter(q => q.world === world && q.kind === "checkpoint").length)).toEqual([1, 1, 1, 1, 1]);

      // Ten unique mission stamps alone cannot promote the learner.
      await seedStableProgress(ui.locator("html"), 10);
      await reloadAtMap(page, ui);
      expect(await stageState(ui)).toEqual({ passed: false, rank: 0, next: false });
      await completeFirstAssessment(ui);
      expect(await stageState(ui)).toEqual({ passed: true, rank: 1, next: true });
      const first = await record(ui);
      expect(Object.keys(first.done).filter(id => quests.some(q => q.world === 0 && q.kind !== "checkpoint" && q.id === id))).toHaveLength(10);
      expect(first.done["w1-test"].evidence).toMatchObject({ knowledge: true, practice: true });
      await tap(ui, '[data-action="next"]');
      await expect(ui.locator('[data-world="1"]')).toHaveAttribute("aria-pressed", "true");

      // Replaying a completed mission retains its original stamp and only
      // updates latest practice metadata; it cannot mint an eleventh stamp.
      await selectQuest(ui, "w1-q1");
      const beforeSelection = await ui.locator('[data-action="submit"]').boundingBox();
      await tap(ui, '[data-select="color:blue"]');
      const afterSelection = await ui.locator('[data-action="submit"]').boundingBox();
      expect(afterSelection!.x).toBeCloseTo(beforeSelection!.x, 1);
      expect(afterSelection!.y).toBeCloseTo(beforeSelection!.y, 1);
      await tap(ui, '[data-action="submit"]');
      await expect(ui.locator(".resultNotice")).toContainText("つたわった");
      await tap(ui, '[data-action="next"]');
      const replayed = await record(ui);
      expect(replayed.done["w1-q1"]).toEqual(first.done["w1-q1"]);
      expect(Object.keys(replayed.done).sort()).toEqual(Object.keys(first.done).sort());
      expect(replayed.latestAttempts["w1-q1"].sequence).toBeGreaterThan(first.done["w1-test"].sequence);

      // A saved test pass without every mission stamp is also insufficient.
      await ui.locator("html").evaluate((_, key) => {
        const saved = JSON.parse(localStorage.getItem(key)!);
        delete saved.done["w1-q1"]; delete saved.latestAttempts["w1-q1"];
        localStorage.setItem(key, JSON.stringify(saved));
      }, storageKey);
      await reloadAtMap(page, ui);
      expect(await stageState(ui)).toEqual({ passed: false, rank: 0, next: false });
      expect(errors).toEqual([]);
    });

    test(`critical first stage map pagination and home entries ${route} ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const ui = await boot(page, route);
      await seedStableProgress(ui.locator("html"), 0);
      await page.reload();
      await learningHome(ui);
      await tap(ui, '.homeView [data-action="challenge"]');
      const story = ui.locator('.stageStory');
      await expect(story).toBeVisible();
      await expect(story.locator('.storySpeech')).toContainText('うちゅう');
      await expect(story).not.toContainText(/[一-龯]/);
      const stableRects = () => story.locator('.storyPicture,.storyPo,.storyText,.storyNav').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return [r.x,r.y,r.width,r.height].map(value => Math.round(value)); }));
      const storyFits = () => story.locator('.storyBook,.storyText,.storySpeech').evaluateAll(elements => elements.every(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1));
      expect(await storyFits()).toBe(true);
      const initialRects = await stableRects();
      await expect.poll(() => story.locator('.storyPo img').evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
      await story.locator('[data-story-next]').click();
      expect(await stableRects()).toEqual(initialRects);
      await expect(story.locator('.storyBlueprint')).toBeVisible();
      await expect(story.locator('.storyPageCount')).toHaveText('2 / 3');
      await story.locator('[data-story-back]').click();
      await expect(story.locator('.storyPageCount')).toHaveText('1 / 3');
      await story.locator('[data-story-next]').click();
      await story.locator('[data-story-next]').click();
      await expect(story.locator('.storyPageCount')).toHaveText('3 / 3');
      await expect(story).not.toContainText(/[一-龯]/);
      await expect(story.locator('[data-story-next]')).toContainText('マップへ いこう');
      expect(await stableRects()).toEqual(initialRects);
      await expect(story.locator('.storyWorkbench')).toBeVisible();
      expect(await storyFits()).toBe(true);
      expect(await story.evaluate(el => [...el.querySelectorAll('button')].every(button => { const r=button.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.top>=-2&&r.bottom<=innerHeight+2&&r.left>=-2&&r.right<=innerWidth+2; }))).toBe(true);
      await story.screenshot({path:test.info().outputPath('stage-story.png')});
      await story.locator('[data-story-next]').click();
      await expect(story).toHaveCount(0);
      await expect(ui.locator('.worldView')).toBeVisible();
      await expect(ui.locator('.questHead')).toHaveCount(0);
      expect(Object.keys((await record(ui)).done)).toHaveLength(0);
      await expect(ui.locator('.mapStory')).toContainText('うちゅう');
      await tap(ui, '[data-world="1"]');
      await expect(ui.locator('.stagePreview')).toBeVisible();
      await expect(ui.locator('.stagePreviewSpeech')).toContainText('くらべて');
      await expect(ui.locator('[data-world="0"]')).toHaveAttribute('aria-pressed', 'true');
      await tap(ui, '[data-stage-close]');
      await screenGeometry(ui);
      const nodes = ui.locator('.questTrail [data-quest]');
      await expect(nodes).toHaveCount(11);
      for (const node of await nodes.all()) {
        await node.scrollIntoViewIfNeeded();
        expect(await node.evaluate(e => { const r = e.getBoundingClientRect(); const s = e.closest('.pathScroll')!.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.left >= s.left - 2 && r.right <= s.right + 2 && r.top >= s.top - 2 && r.bottom <= s.bottom + 2; })).toBe(true);
      }
      await expect(ui.locator('[data-quest-page-step]')).toHaveCount(0);
      await ui.locator('[aria-current="step"]').scrollIntoViewIfNeeded();
      await expect(ui.locator('[aria-current="step"]')).toBeEnabled();
      await tap(ui, '[data-nav="home"]');
      await learningHome(ui);
      // Common home navigation is distinct from starting a lesson.
      for (const destination of ["map", "parent", "settings"] as const) {
        await tap(ui, destination === "map" ? '.homeView [data-action="challenge"]' : `.top [data-nav="${destination}"]`);
        if (destination === "map") await tap(ui, '[data-nav="home"]');
        else if (destination === "parent") {
          await tap(ui, '.parentTop [data-nav="map"]');
          await tap(ui, '[data-nav="home"]');
        } else await tap(ui, '[data-action="settings-done"]');
        await learningHome(ui);
      }
      expect(await ui.locator("html").evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
    });
  }

  for (const schema of [1, 3]) {
    test(`legacy schema ${schema} migration retains stable history ${route}`, async ({ page }) => {
      const ui = await boot(page, route);
      await ui.locator("html").evaluate((_, input) => {
        localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, challengeMode: "guided" }));
        const done = input === 1
          ? { 0: { at: "legacy-color" }, 2: { at: "legacy-sea" } }
          : { 0: { at: "legacy-color" }, 4: { at: "legacy-stage-test" }, 20: { at: "legacy-ai-tool" } };
        const portfolio = input === 3 ? [{ quest: 20, title: "AIって なに？", at: "2026-10-14", choices: {} }] : [];
        localStorage.setItem("aippo_kids_journey_v1", JSON.stringify({ schema: input, done, portfolio }));
      }, schema);
      await page.reload();
      const migrated = await record(ui);
      expect(migrated.schema).toBe(4);
      expect(migrated.done["w1-q1"].at).toBe("legacy-color");
      expect(migrated.done["w1-purpose"]).toBeUndefined();
      if (schema === 1) expect(migrated.done["w2-q1"].at).toBe("legacy-sea");
      else {
        expect(migrated.done["w1-test"].at).toBe("legacy-stage-test");
        expect(migrated.done["w5-q1"].at).toBe("legacy-ai-tool");
        expect(migrated.portfolio[0]).toMatchObject({ quest: "w5-q1", title: "AIって なに？" });
      }
      // Old completions are retained, but replay also respects the stage lock.
      if (schema === 1) expect(await stageState(ui, "w2-q1")).toEqual({ passed: false, rank: 0, next: false });
      expect(await stageState(ui, "w2-q2")).toEqual({ passed: false, rank: 0, next: false });
      await page.reload();
      expect(await record(ui)).toEqual(migrated);
      await expect(ui.locator(".storageNotice")).toHaveCount(0);
    });
  }
}

for (const route of ['/kids', '/kids-title/']) {
  for (const viewport of [{width:320,height:568},{width:568,height:320}]) {
    for (const reducedMotion of ['reduce','no-preference'] as const) {
      test(`dungeon entry exit stays actionable in every world ${route} ${viewport.width}x${viewport.height} ${reducedMotion}`, async ({page}) => {
        await page.setViewportSize(viewport);
        const ui=await boot(page,route);
        const quests=await liveQuests(ui.locator('html'));
        await seedStableProgress(ui.locator('html'),quests.length-1);
        await reloadAtMap(page,ui);
        await page.emulateMedia({reducedMotion});
        const before=await record(ui);
        for(let world=0;world<5;world++) {
          await tap(ui,`[data-world="${world}"]`);
          const index=quests.findIndex(q=>q.world===world);
          const node=ui.locator(`[data-quest="${index}"]`);
          await node.scrollIntoViewIfNeeded();
          await tap(ui,`[data-quest="${index}"]`);
          await expect(ui.locator('.questEntrance')).toBeVisible();
          await expect(ui.locator('.entranceCopy p')).not.toBeEmpty();
          await expect(ui.locator('.entranceCopy small')).toContainText('はじめから');
          await screenGeometry(ui);
          expect(await ui.locator('.entranceCopy,.entranceScene').evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+2&&el.scrollHeight<=el.clientHeight+2))).toBe(true);
          await expect.poll(()=>ui.locator('.entranceScene .po img').evaluate(img=>(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0)).toBe(true);
          const cta=ui.locator('[data-action="enter-quest"]');
          const rect=await cta.boundingBox();
          await ui.locator('.questEntrance').screenshot({path:test.info().outputPath(`world-${world}-entrance.png`)});
          expect(await cta.boundingBox()).toEqual(rect);
          expect(await ui.locator('.entranceDoor').evaluate(el=>getComputedStyle(el).animationName)).toBe(reducedMotion==='reduce'?'none':'dungeonEnter');
          await tap(ui,'.entranceHead [data-nav="map"]');
          await expect(ui.locator('.journeyReturnStatus')).toContainText('もどった');
          await expect(node).toBeFocused();
          await tap(ui,`[data-quest="${index}"]`);
          await tap(ui,'[data-action="enter-quest"]');
          await tap(ui,'.questHead [data-nav="map"]');
          await expect(ui.locator('.journeyReturnStatus')).toContainText('はじめから');
          await expect(node).toBeFocused();
          const checkpoint=quests.findIndex(q=>q.world===world&&q.kind==='checkpoint');
          await ui.locator(`[data-quest="${checkpoint}"]`).scrollIntoViewIfNeeded();
          await tap(ui,`[data-quest="${checkpoint}"]`);
          await expect(ui.locator('.checkpointPurpose')).toBeVisible();
          await expect(ui.locator('[data-action="assessment-begin"]')).toBeFocused();
          await expect(ui.locator('.checkpointPurposeSpeech')).not.toHaveClass(/poSpeech/);
          expect(await ui.locator('.checkpointPurposeSpeech,.checkpointPurposeSteps,.checkpointPurposeTarget,.checkpointPurpose .questTitle').evaluateAll(els=>els.every(el=>{const r=el.getBoundingClientRect();return el.scrollWidth<=el.clientWidth+2&&el.scrollHeight<=el.clientHeight+2&&r.top>=-2&&r.bottom<=innerHeight+2}))).toBe(true);
          await screenGeometry(ui);
          await ui.locator('.checkpointPurpose').screenshot({path:test.info().outputPath(`world-${world}-dungeon.png`)});
          await tap(ui,'.checkpointPurpose [data-nav="map"]');
          await expect(ui.locator(`[data-quest="${checkpoint}"]`)).toBeFocused();
          expect(await record(ui)).toEqual(before);
        }
      });
    }
  }
}
