import { afterEach, describe, expect, it, vi } from "vitest";
import html from "../src/kids/learning.html?raw";

const store = "aippo_kids_journey_v1";
type Row = Record<string, unknown>;
type Api = { quests: {id: string; kind: string; world: number}[]; go: (view: string) => void; startQuest: (index: number) => void; nextFinish: () => void; state: Row; count: () => number; saved: { challenges: Row[]; done: Record<string, Row> } };
const done = { 0: { at: "2026-10-14" }, 1: { at: "2026-10-14" } };
const migratedDone = { "w1-q1": done[0], "w1-q2": done[1] };
const challenges = [{ at: "2026-10-14", task: "outing", mode: "advanced" }, { at: "2026-10-14", task: "outing", mode: "advanced" }, { at: "2026-10-14", task: "sources", mode: "advanced" }];
function boot(mode: string, records: Row[] = challenges) {
  localStorage.clear();
  localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, challengeMode: mode }));
  localStorage.setItem(store, JSON.stringify({ schema: 3, done, challenges: records }));
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  document.body.innerHTML = '<div id="app"></div>';
  window.eval(html.match(/<script>([\s\S]*?)<\/script>/)![1]);
  const api = (window as unknown as { AIPPO_TEST: Api }).AIPPO_TEST;
  api.go("home");
  return api;
}
const label = () => document.querySelector(".homeHead .eyebrow")!.textContent;
const click = (selector: string) => { const button = document.querySelector<HTMLButtonElement>(selector); expect(button, selector).not.toBeNull(); button!.click(); };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ""; localStorage.clear(); });

describe("Honest route-specific progress without invented fixed steps", () => {
  it("keeps the adventure numerator and 27-quest denominator only for the guided home", () => {
    const api = boot("guided");
    expect(label()).toBe("ぼうけん 2 / 27"); expect(api.count()).toBe(2);
    expect(api.saved.done).toEqual(migratedDone); expect(api.saved.challenges).toEqual(challenges);
    click('[data-action="start"]'); expect(document.querySelector(".worldHead .eyebrow")!.textContent).toContain("2/27");
  });
  it.each(["standard", "advanced"])("shows retained practice records, not adventure or unique-task counts, for %s", mode => {
    const api = boot(mode);
    expect(label()).toBe("練習記録 3件"); // two outing attempts still count as two records
    expect(label()).not.toContain("25"); expect(label()).not.toMatch(/能力|習得|達成率|コース|累計|保存済/);
    expect(api.count()).toBe(2); expect(api.saved.done).toEqual(migratedDone);
    click('[data-action="challenge"]'); expect(document.querySelector(".worldHead .eyebrow")!.textContent).toContain("2/27");
    expect(JSON.parse(localStorage.getItem(store)!).challenges).toEqual(challenges);
  });
  it.each(["standard", "advanced"])("truthfully shows zero records when only adventure has progress in %s", mode => {
    boot(mode, []); expect(label()).toBe("練習記録 0件");
  });
  it("does not label a capped history count as a lifetime total", () => {
    const api = boot("advanced", Array.from({ length: 51 }, (_, index) => ({ at: "2026-10-14", task: "outing", index })));
    expect(api.saved.challenges).toHaveLength(50); expect(label()).toBe("練習記録 50件");
    expect(label()).not.toMatch(/累計|完了率|習得/);
  });
  it("does not call in-memory records saved when storage fails", () => {
    const api = boot("advanced");
    const original = localStorage.getItem(store);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("read failure"); });
    api.saved.challenges.push({ at: "2026-10-15", task: "outing" });
    Object.assign(api.state, { quest: 0, result: { success: true }, selected: {}, order: [], tries: 1 });
    api.nextFinish();
    api.go("home");
    expect(label()).toBe("練習記録 4件"); expect(label()).not.toContain("保存済");
    expect(document.querySelector(".foot")!.textContent).toContain("未保存");
    expect(document.querySelector(".storageNotice")).not.toBeNull();
    vi.restoreAllMocks(); expect(localStorage.getItem(store)).toBe(original);
  });
  it("switches routes without resetting or summing separate progress measures", () => {
    const api = boot("advanced"); const original = localStorage.getItem(store);
    api.go("settings"); document.querySelector<HTMLSelectElement>("#child-mode")!.value = "guided";
    click('[data-action="profile-save"]'); api.go("home"); expect(label()).toBe("ぼうけん 2 / 27");
    api.go("settings"); document.querySelector<HTMLSelectElement>("#child-mode")!.value = "standard";
    click('[data-action="profile-save"]'); api.go("home"); expect(label()).toBe("練習記録 3件");
    expect(localStorage.getItem(store)).toBe(original);
  });
  it("removes fake fixed dots but keeps the actual quest index", () => {
    const api = boot("guided"); api.startQuest(2);
    expect(document.querySelector(".questHead .eyebrow")!.textContent).toContain("QUEST 3/27");
    expect(document.querySelector(".questHead .dots")).toBeNull(); expect(document.querySelector(".questHead .dot")).toBeNull();
  });
  it("keeps actual checkpoint knowledge/practice step labels", () => {
    const api = boot("guided");
    api.quests.filter(q => q.world === 0 && q.kind !== "checkpoint").forEach(q => { api.saved.done[q.id] = { at: "2026-10-14" }; });
    api.startQuest(api.quests.findIndex(q => q.id === "w1-test")); click('[data-action=assessment-begin]'); expect(document.querySelector(".choiceNote")!.textContent).toContain("1 / 2");
    click('[data-test-answer="0"]'); expect(document.querySelector(".choiceNote")!.textContent).toContain("2 / 2");
    expect(document.querySelector(".questHead .eyebrow")!.textContent).toContain("QUEST 11/27");
    expect(document.querySelector(".questHead .dots")).toBeNull();
  });
});
