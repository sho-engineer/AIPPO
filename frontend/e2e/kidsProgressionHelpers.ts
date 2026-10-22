import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";

export type KidsQuest = { id: string; world: number; kind: string; short: string };
export type KidsTestApi = {
  quests: KidsQuest[];
  state: { view: string; world: number; questPage: number; quest: number };
  saved: { done: Record<string, unknown>; latestAttempts: Record<string, unknown> };
  go(view: string): void;
  render(): void;
  stagePassed(world: number): boolean;
  unlocked(index: number): boolean;
  mastery(): number;
  count(): number;
};
export type KidsWindow = Window & { AIPPO_TEST: KidsTestApi };

/** Synthetic prerequisites use the live stable IDs. They are setup, never
 * evidence that a participant actually completed the seeded lessons. */
export async function seedStableProgress(html: Locator, count: number, mode = "guided") {
  await html.evaluate((_, input) => {
    const api = (window as unknown as KidsWindow).AIPPO_TEST;
    const done = Object.fromEntries(api.quests.slice(0, input.count).map(q => [q.id, {
      at: "2026-10-15", assessmentVersion: 2,
      evidence: { knowledge: true, practice: true }, attempts: 1,
    }]));
    localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, challengeMode: input.mode, ageBand: "7-9", readingSupport: "on" }));
    localStorage.setItem("aippo_kids_journey_v1", JSON.stringify({ schema: 4, done,
      challenges: [{ at: "2026-10-15", mode: "advanced", task: "outing", conditions: {} }], daily: [],
    }));
  }, { count, mode });
}

export async function liveQuests(html: Locator) {
  return html.evaluate(() => (window as unknown as KidsWindow).AIPPO_TEST.quests.map(({ id, world, kind, short }) => ({ id, world, kind, short })));
}

/** Follow the scrollable adventure path without bypassing its lock. */
export async function selectQuest(root: FrameLocator | Page, id: string) {
  const quests = await liveQuests(root.locator("html"));
  const index = quests.findIndex(q => q.id === id);
  expect(index).toBeGreaterThanOrEqual(0);
  if (await root.locator('[data-story-skip]').count()) await root.locator('[data-story-skip]').click();
  await root.locator(`[data-world="${quests[index].world}"]`).click();
  if (await root.locator('[data-story-skip]').count()) await root.locator('[data-story-skip]').click();
  const target = root.locator(`[data-quest="${index}"]`);
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeVisible();
  await target.click();
  if (quests[index].kind !== 'checkpoint') {
    await expect(root.locator('[data-action="enter-quest"]')).toBeVisible();
    await root.locator('[data-action="enter-quest"]').click();
  }
  if (quests[index].kind === 'checkpoint') {
    await expect(root.locator('.checkpointPurpose')).toBeVisible();
    await expect(root.locator('.checkpointPurposeSpeech')).not.toBeEmpty();
    const geometry = await root.locator('.checkpointPurpose').evaluate(el => {
      const controls = [...el.querySelectorAll('button')].map(button => button.getBoundingClientRect());
      const target = el.querySelector('.checkpointPurposeTarget')!.getBoundingClientRect();
      const readable = [...el.querySelectorAll('.checkpointPurposeSpeech,.checkpointPurposeSteps,.questTitle')].every(node => {
        const r = node.getBoundingClientRect();
        const bounds = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && node.scrollWidth <= node.clientWidth + 2 && node.scrollHeight <= node.clientHeight + 2
          && r.left >= Math.max(-2, bounds.left - 2) && r.right <= Math.min(innerWidth + 2, bounds.right + 2)
          && r.top >= Math.max(-2, bounds.top - 2) && r.bottom <= Math.min(innerHeight + 2, bounds.bottom + 2);
      });
      const separate = (selectors: string[]) => {
        const rows = selectors.map(selector => el.querySelector(selector)!.getBoundingClientRect());
        return rows.every((r, index) => rows.slice(index + 1).every(other =>
          r.bottom <= other.top + 2 || other.bottom <= r.top + 2 || r.right <= other.left + 2 || other.right <= r.left + 2));
      };
      const checks = {
        readable,
        mainSeparate: separate(['.questHead', '.checkpointPurposeBody', '.actionBar']),
        innerSeparate: separate(['.checkpointPurposeTalk', '.checkpointPurposeTarget', '.checkpointPurposeSteps']),
        controlsFit: controls.every(r => r.width >= 44 && r.height >= 44 && r.top >= -2 && r.bottom <= innerHeight + 2 && r.left >= -2 && r.right <= innerWidth + 2),
        targetFit: target.height >= 44 && target.bottom <= innerHeight + 2,
      };
      const boxes = ['.questHead', '.checkpointPurposeBody', '.actionBar', '.checkpointPurposeTalk', '.checkpointPurposeTarget', '.checkpointPurposeSteps', '.checkpointPurposeSpeech', '.questTitle', 'button'].flatMap(selector =>
        [...el.querySelectorAll(selector)].map(node => ({
          selector,
          text: node.textContent,
          rect: node.getBoundingClientRect().toJSON(),
          scroll: [node.scrollWidth, node.scrollHeight],
          client: [node.clientWidth, node.clientHeight],
        })));
      return { valid: Object.values(checks).every(Boolean), checks, boxes, viewport: [innerWidth, innerHeight] };
    });
    expect(geometry.valid, JSON.stringify(geometry)).toBe(true);
    await root.locator('.checkpointPurpose').screenshot({ path: test.info().outputPath('checkpoint-purpose.png') });
    await root.locator('[data-action="assessment-begin"]').click();
  }
}
