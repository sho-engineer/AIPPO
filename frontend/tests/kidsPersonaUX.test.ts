import { afterEach, describe, expect, it, vi } from "vitest";
import html from "../src/kids/learning.html?raw";

type Api = { startQuest: (index: number) => void; go: (view: string) => void; quests: {id: string; kind: string}[]; saved: { done: Record<string, unknown> }; worlds: { ending: string; story: string }[] };
const key = "aippo_kids_settings_v1";
function boot(settings: Record<string, unknown> = {}) {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  localStorage.setItem(key, JSON.stringify({ guardianAccepted: true, ageBand: "7-9", ...settings }));
  localStorage.setItem("aippo_kids_journey_v1", JSON.stringify({ schema: 3, done: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i, { assessmentVersion: 2, evidence: { knowledge: true, practice: true }, at: "2026-10-15", attempts: 1 }])) }));
  document.body.innerHTML = '<div id="app"></div>';
  window.eval(html.match(/<script>([\s\S]*?)<\/script>/)![1]);
  const api = (window as unknown as { AIPPO_TEST: Api }).AIPPO_TEST;
  // Newly added prerequisites are explicit setup, not migration evidence.
  api.quests.filter(q => q.id !== "w5-test").forEach(q => { api.saved.done[q.id] = { assessmentVersion: 2, evidence: { knowledge: true, practice: true }, at: "2026-10-15", attempts: 1 }; });
  return api;
}
function click(selector: string) { const button = document.querySelector<HTMLButtonElement>(selector); expect(button, selector).not.toBeNull(); button!.click(); }
function select(selector: string, value: string) { document.querySelector<HTMLSelectElement>(selector)!.value = value; }
function safety(api: Api, prompt: string, person: string) {
  api.startQuest(api.quests.findIndex(q => q.id === "w5-test")); click('[data-test-answer="2"]');
  click(`[data-safe-prompt="${prompt}"]`); click(`[data-safe-person="${person}"]`); click('[data-action="safe-submit"]');
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); document.body.innerHTML = ""; });

describe("Persona reading, story and honest exit guidance", () => {
  it("lets an older child enable readings without reducing challenge depth, persists it, then disables it", () => {
    let api = boot({ challengeMode: "advanced" });
    api.go("settings"); select("#child-reading", "on"); click('[data-action="profile-save"]');
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ ageBand: "7-9", challengeMode: "advanced", readingSupport: "on" });
    const profile = JSON.parse(localStorage.getItem(key)!);
    api = boot(profile); safety(api, "private", "ai");
    expect(document.querySelector(".testFeedback rt")!.textContent).toBe("あいて");
    api.go("settings"); select("#child-reading", "off"); click('[data-action="profile-save"]');
    api = boot(JSON.parse(localStorage.getItem(key)!)); safety(api, "private", "ai");
    expect(document.querySelector(".testFeedback rt")).toBeNull();
    expect(api.saved.done["w5-test"]).toBeUndefined();
  });
  it.each([
    ["private", "adult", "ひみつ", "相手"],
    ["safe", "ai", "相手", "ひみつ"],
    ["private", "ai", "ひみつ", "unused"],
  ])("explains only the unsafe side without changing the child's choices (%s/%s)", (prompt, person, expected, excluded) => {
    const api = boot({ readingSupport: "on" }); safety(api, prompt, person);
    const feedback = document.querySelector(".testFeedback")!.textContent!;
    expect(feedback).toContain(expected); if (excluded !== "unused") expect(feedback).not.toContain(excluded);
    expect(document.querySelector(`[data-safe-prompt="${prompt}"]`)!.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(`[data-safe-person="${person}"]`)!.getAttribute("aria-pressed")).toBe("true");
    expect(api.saved.done["w5-test"]).toBeUndefined();
  });
  it("bridges light restoration to the safety chapter instead of promising the journey is over", () => {
    const api = boot(); expect(api.worlds[3].ending).toContain("つぎ"); expect(api.worlds[4].story).toContain("ひかりが もどった");
    api.go("home"); expect(document.body.textContent).toContain("途中の問題は最初から");
    api.startQuest(0); expect(document.querySelector(".overlay")).toBeNull();
    click('[data-nav="map"]'); expect(document.querySelector(".overlay")).toBeNull();
  });
  it("discloses retention, profile limits and first/latest records in the adult settings", () => {
    const api = boot(); api.go("settings"); const text = document.body.textContent!;
    for (const disclosure of ["最新30件", "最新50件", "1人分", "初回クリア", "直近の再挑戦", "タイムゾーン", "読み込み・復元できません"]) expect(text).toContain(disclosure);
  });
});
