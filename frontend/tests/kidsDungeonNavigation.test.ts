import { afterEach, describe, expect, it, vi } from "vitest";
import html from "../src/kids/learning.html?raw";

type Api = {
  state: { view: string; world: number; quest: number; result: { success: boolean; evidence?: { knowledge: boolean; practice: boolean } } | null };
  quests: { id: string; kind: string; world: number }[];
  saved: { done: Record<string, unknown>; latestAttempts: Record<string, unknown> };
  go(view: string): void;
  startQuest(index: number): void;
  enterQuest(index: number): void;
  nextFinish(): void;
  render(): void;
};
const journey = "aippo_kids_journey_v1";
function click(selector: string) {
  const button = document.querySelector<HTMLButtonElement>(selector);
  expect(button, selector).not.toBeNull();
  button!.click();
}
function boot(reducedMotion = true) {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: reducedMotion }));
  localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, ageBand: "5-6", challengeMode: "guided" }));
  document.body.innerHTML = '<div id="app"></div>';
  window.eval(html.match(/<script>([\s\S]*?)<\/script>/)![1]);
  return (window as unknown as { AIPPO_TEST: Api }).AIPPO_TEST;
}
function seedCompleted(api: Api, beforeId = "w5-test") {
  const before = api.quests.findIndex(q => q.id === beforeId);
  api.quests.slice(0, before).forEach(q => { api.saved.done[q.id] = { at: "2026-10-19", assessmentVersion: 2, evidence: { knowledge: true, practice: true } }; });
}
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
  localStorage.clear(); document.body.innerHTML = "";
});

describe("Kids dungeon entry and return keep the journey coherent", () => {
  it.each([true, false])("offers an immediate actionable entry and a safe cancel (reduced motion %s)", reduced => {
    const api = boot(reduced); api.go("map"); click("[data-story-skip]");
    const before = localStorage.getItem(journey);
    const scroll = document.querySelector<HTMLElement>(".pathScroll")!; scroll.scrollTop = 90;
    click('[data-quest="0"]');
    expect(api.state.view).toBe("entrance");
    expect(document.querySelector(".overlay,.think")).toBeNull();
    expect(document.querySelector<HTMLButtonElement>('[data-action="enter-quest"]')!.disabled).toBe(false);
    expect(document.querySelector('[data-action="enter-quest"]')!.textContent!.trim()).not.toBe("");
    click('.view [data-nav="map"]');
    expect(api.state.view).toBe("map"); expect(api.state.world).toBe(0);
    expect(document.querySelector<HTMLElement>(".pathScroll")!.scrollTop).toBe(90);
    expect(document.activeElement).toBe(document.querySelector('[data-quest="0"]'));
    expect(localStorage.getItem(journey)).toBe(before);
  });
  it("enters the selected mission, discards incomplete cards and preserves historical records", () => {
    const api = boot(); seedCompleted(api); api.go("map"); click('[data-world="0"]');
    const before = JSON.stringify(api.saved);
    click('[data-quest="0"]'); click('[data-action="enter-quest"]');
    click('[data-select="color:blue"]'); click('.questHead [data-nav="map"]');
    expect(api.state.world).toBe(0);
    expect(document.activeElement).toBe(document.querySelector('[data-quest="0"]'));
    expect(JSON.stringify(api.saved)).toBe(before);
    click('[data-quest="0"]'); click('[data-action="enter-quest"]');
    expect(document.querySelector('[data-select="color:blue"]')!.getAttribute("aria-pressed")).not.toBe("true");
  });
  it("uses the checkpoint purpose as its only gate and can return to its own world", () => {
    const api = boot(); seedCompleted(api); api.go("map"); click('[data-world="0"]');
    const index = api.quests.findIndex(q => q.id === "w1-test");
    click(`[data-quest="${index}"]`);
    expect(document.querySelector(".checkpointPurpose")).not.toBeNull();
    expect(document.querySelector('[data-action="enter-quest"]')).toBeNull();
    expect(document.activeElement).toBe(document.querySelector('[data-action="assessment-begin"]'));
    click('.questHead [data-nav="map"]');
    expect(api.state.world).toBe(0);
    expect(document.activeElement).toBe(document.querySelector(`[data-quest="${index}"]`));
  });
  it("does not let a pending simulation pull a child back after leaving or entering another mission", () => {
    const api = boot(); seedCompleted(api); api.startQuest(0);
    click('[data-select="color:blue"]'); click('[data-action="submit"]');
    click('.questHead [data-nav="map"]');
    vi.advanceTimersByTime(500);
    expect(api.state.view).toBe("map");
    api.startQuest(0); click('[data-select="color:blue"]'); click('[data-action="submit"]');
    api.startQuest(1); vi.advanceTimersByTime(500);
    expect(api.state.quest).toBe(1); expect(api.state.view).toBe("play"); expect(api.state.result).toBeNull();
  });
  it("distinguishes explicit reward close from moving to the next available mission", () => {
    const api = boot(); api.startQuest(0); api.state.result = { success: true }; api.nextFinish();
    const saved = JSON.stringify(api.saved);
    click('.screenHead [data-nav="map"]');
    expect(api.state.world).toBe(0);
    expect(document.activeElement).toBe(document.querySelector('[data-quest="0"]'));
    expect(document.querySelector(".journeyReturnStatus")!.textContent).not.toContain("はじめから");
    expect(JSON.stringify(api.saved)).toBe(saved);
    api.state.view = "win"; api.render(); click('[data-action="next"]');
    expect(api.state.view).toBe("map"); expect(api.state.world).toBe(0);
    expect(document.activeElement).toBe(document.querySelector('[data-quest="1"]'));
    expect(JSON.stringify(api.saved)).toBe(saved);
  });
  it("keeps locked missions out and advances a passed checkpoint to the next unlocked world", () => {
    const api = boot(); api.go("map"); click("[data-story-skip]");
    const before = localStorage.getItem(journey);
    api.enterQuest(1); expect(api.state.view).toBe("map");
    click('[data-world="1"]');
    expect(document.querySelector(".stagePreview")).not.toBeNull();
    expect(api.state.world).toBe(0); expect(api.state.view).toBe("map");
    expect(localStorage.getItem(journey)).toBe(before);
    click("[data-stage-close]");
    seedCompleted(api, "w1-test");
    const checkpoint = api.quests.findIndex(q => q.id === "w1-test");
    api.startQuest(checkpoint);
    api.state.result = { success: true, evidence: { knowledge: true, practice: true } };
    api.nextFinish();
    const completed = JSON.stringify(api.saved);
    click('[data-action="next"]');
    expect(api.state.view).toBe("map"); expect(api.state.world).toBe(1);
    expect(JSON.stringify(api.saved)).toBe(completed);
  });

  it("advances a replayed historical checkpoint to its neighboring world and an existing node", () => {
    const api = boot(); seedCompleted(api);
    const checkpoint = api.quests.findIndex(q => q.id === "w1-test");
    api.startQuest(checkpoint);
    api.state.result = { success: true, evidence: { knowledge: true, practice: true } };
    api.nextFinish();
    const before = JSON.stringify(api.saved);
    click('[data-action="next"]');
    expect(api.state.world).toBe(1);
    expect(api.state.view).toBe("map");
    const nextCheckpoint = api.quests.findIndex(q => q.world === 1 && q.kind === "checkpoint");
    expect(document.activeElement).toBe(document.querySelector(`[data-quest="${nextCheckpoint}"]`));
    expect(document.activeElement).not.toBe(document.body);
    expect(JSON.stringify(api.saved)).toBe(before);
  });

});
