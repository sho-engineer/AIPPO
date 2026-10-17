import { expect, type FrameLocator, type Locator, type Page } from "@playwright/test";

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
  await root.locator(`[data-world="${quests[index].world}"]`).click();
  const target = root.locator(`[data-quest="${index}"]`);
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeVisible();
  await target.click();
}
