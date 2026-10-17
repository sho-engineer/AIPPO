import { afterEach, describe, expect, it, vi } from "vitest";
import html from "../src/kids/learning.html?raw";

type Api = { quests: {id: string; kind: string}[]; go: (view: string) => void; startQuest: (index: number) => void; saved: { done: Record<string, unknown>; daily: unknown[] }; state: { view: string; quest: number }; render: () => void };
function boot() {
  vi.useFakeTimers(); vi.stubGlobal("matchMedia", () => ({ matches: true }));
  localStorage.clear();
  localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, ageBand: "7-9", challengeMode: "guided" }));
  localStorage.setItem("aippo_kids_journey_v1", JSON.stringify({ schema: 3, done: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i, { at: "2026-10-15", assessmentVersion: 2, evidence: { knowledge: true, practice: true }, attempts: 1 }])) }));
  document.body.innerHTML = '<div id="app"></div>'; window.eval(html.match(/<script>([\s\S]*?)<\/script>/)![1]);
  const api = (window as unknown as { AIPPO_TEST: Api }).AIPPO_TEST;
  // Newly added prerequisites are explicit setup, not migration evidence.
  api.quests.filter(q => q.id !== "w5-test").forEach(q => { api.saved.done[q.id] = { assessmentVersion: 2, evidence: { knowledge: true, practice: true }, at: "2026-10-15", attempts: 1 }; });
  return api;
}
function click(selector: string) { const el = document.querySelector<HTMLButtonElement>(selector); expect(el, selector).not.toBeNull(); el!.click(); }
function finalWin(api: Api) {
  api.startQuest(api.quests.findIndex(q => q.id === "w5-test")); click('[data-action=assessment-begin]'); click('[data-test-answer="2"]'); click('[data-safe-prompt="safe"]'); click('[data-safe-person="adult"]'); click('[data-action="safe-submit"]');
  expect(document.querySelector(".success")).not.toBeNull();
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); document.body.innerHTML = ""; });
describe("Next purpose and prominent factual summary", () => {
  it("opens an optional household purpose chooser after the final real assessment without recording a household outcome", () => {
    const api = boot(); finalWin(api);
    expect(document.querySelector('[data-action="next"]')!.textContent).toContain("つぎの目的をえらぶ");
    click('[data-action="next"]');
    expect(document.querySelector(".dailyModal")).not.toBeNull(); expect(api.saved.daily).toHaveLength(0);
  });
  it("keeps final records reachable and makes the existing summary the first parent control", () => {
    const api = boot(); finalWin(api);
    expect(document.querySelector('[data-action="daily"]')!.textContent).toContain("できたこと・記録を見る");
    click('[data-action="daily"]');
    const first = document.querySelector<HTMLButtonElement>(".parentBottom button")!;
    expect(first.dataset.action).toBe("recent"); expect(first.classList.contains("summaryEntry")).toBe(true);
    first.click(); expect(document.querySelector(".summaryModal")).not.toBeNull();
  });
  it("leaves nonfinal win actions unchanged", () => {
    const api = boot(); api.state.quest = 0; api.state.view = "win"; api.render();
    expect(document.querySelector('[data-action="daily"]')!.textContent).toContain("このコツを おうちで つかう");
    click('[data-action="next"]'); expect(api.state.view).toBe("map");
    api.state.quest = api.quests.findIndex(q => q.id === "w1-test"); api.state.view = "win"; api.render();
    expect(document.querySelector('[data-action="next"]')!.textContent).toContain("つぎの ステージへ");
    click('[data-action="daily"]'); expect(document.querySelector(".dailyModal")).not.toBeNull(); expect(api.saved.daily).toHaveLength(0);
  });
});
