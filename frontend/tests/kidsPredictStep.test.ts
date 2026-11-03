import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import canonical from "../src/kids/learning.html?raw";
import standalone from "../public/kids-title/index.html?raw";

// Prediction before generation: after sending the cards, the child guesses what the AI
// will make. It is the quest's one thinking step: it never decides the stamp, it is
// answered on the result screen and kept with the attempt record.
type Scene = { color: string; place: string; shape: string };
type Api = {
  state: { view: string; tries: number; selected: Record<string, string>; predict: null | { actual: Scene; options: Scene[] } };
  saved: { done: Record<string, unknown>; latestAttempts: Record<string, { prediction?: { matched: boolean; guess: Scene } }> };
  quests: { id: string; kind: string }[];
  startQuest(n: number): void;
};
const api = () => (window as unknown as { AIPPO_TEST: Api }).AIPPO_TEST;
const click = (s: string) => { const b = document.querySelector<HTMLElement>(s); expect(b, s).not.toBeNull(); b!.click(); };
const same = (a: Scene, b: Scene) => a.color === b.color && a.place === b.place && a.shape === b.shape;
function boot(source = canonical) {
  document.body.innerHTML = '<div id="app"></div>';
  window.eval(source.match(/<script>([\s\S]*?)<\/script>/)![1]);
  return api();
}
function unlockAll(a: Api) { a.quests.forEach(q => { a.saved.done[q.id] = { at: "2026-10-19", assessmentVersion: 2, evidence: { knowledge: true, practice: true } }; }); }
function guess(a: Api, right: boolean) {
  const p = a.state.predict!;
  const i = p.options.findIndex(o => same(o, p.actual) === right);
  click(`[data-predict="${i}"]`); vi.advanceTimersByTime(450);
}
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("aippo_title_opening_v1", "seen");
  localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, challengeMode: "guided", readingSupport: "on" }));
  vi.useFakeTimers(); vi.stubGlobal("matchMedia", () => ({ matches: true }));
});
afterEach(() => {
  document.querySelector<HTMLButtonElement>("[data-opening-skip]")?.click();
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); document.body.innerHTML = "";
});

describe("Kids prediction before generation", () => {
  it.each([["canonical", canonical], ["standalone", standalone]])("%s: sending cards asks for a guess first, without generating or counting", (_, html) => {
    const a = boot(html); a.startQuest(0); click('[data-select="color:blue"]'); click('[data-action="submit"]');
    expect(a.state.view).toBe("play"); expect(a.state.tries).toBe(0);
    expect(document.querySelector(".think")).toBeNull();
    expect(document.querySelector(".predictQuestion")!.textContent).toContain("おもう");
    const options = a.state.predict!.options;
    expect(document.querySelectorAll("[data-predict]")).toHaveLength(3);
    // Exactly one picture is what the cards will make; the others differ, so the guess is a real choice.
    expect(options.filter(o => same(o, a.state.predict!.actual))).toHaveLength(1);
    expect(new Set(options.map(o => JSON.stringify(o))).size).toBe(3);
  });
  it("a right guess is confirmed on the result screen and kept with the attempt", () => {
    const a = boot(); a.startQuest(0); click('[data-select="color:blue"]'); click('[data-action="submit"]');
    guess(a, true);
    expect(a.state.view).toBe("result"); expect(a.state.tries).toBe(1);
    expect(document.querySelector(".predictNote")!.textContent).toContain("おもった とおり！");
    expect(document.querySelectorAll(".resultCompare > .preview")[1].querySelector(".predictBadge")!.textContent).toContain("よそう どおり");
    click('[data-action="next"]');
    expect(a.saved.latestAttempts["w1-q1"].prediction).toMatchObject({ matched: true, guess: { color: "blue" } });
  });
  it("a wrong guess is answered kindly and does not cost the stamp", () => {
    const a = boot(); a.startQuest(0); click('[data-select="color:blue"]'); click('[data-action="submit"]');
    guess(a, false);
    expect(document.querySelector(".predictNote")!.textContent).toContain("ちがったね");
    expect(document.querySelector(".predictBadge")!.textContent).toContain("ちがった");
    expect(document.querySelector('[data-action="next"]')!.textContent).toContain("スタンプ");
    click('[data-action="next"]');
    expect(a.state.view).toBe("win");
    expect(a.saved.done["w1-q1"]).toBeTruthy();
    expect(a.saved.latestAttempts["w1-q1"].prediction!.matched).toBe(false);
  });
  it("a wrong card is still judged by the cards, not by the guess", () => {
    const a = boot(); a.startQuest(0); click('[data-select="color:pink"]'); click('[data-action="submit"]');
    guess(a, true);
    expect(document.querySelector(".predictNote")!.textContent).toContain("おもった とおり！");
    expect(document.querySelector('[data-action="next"]')!.textContent).toContain("もういちど");
    click('[data-action="next"]');
    expect(a.state.view).toBe("play"); expect(a.state.predict).toBeNull(); expect(a.saved.done["w1-q1"]).toBeUndefined();
  });
  it("lets the child go back to the cards from the guess without losing them or counting a try", () => {
    const a = boot(); a.startQuest(0); click('[data-select="color:blue"]'); click('[data-action="submit"]');
    click('[data-action="predict-back"]');
    expect(document.querySelector("[data-predict]")).toBeNull();
    expect(a.state.selected.color).toBe("blue"); expect(a.state.tries).toBe(0);
  });
  it("combination quests offer pictures that each change one of the sent cards", () => {
    const a = boot(); unlockAll(a); const n = a.quests.findIndex(q => q.kind === "combine");
    a.startQuest(n); click('[data-select="color:yellow"]'); click('[data-select="place:sea"]'); click('[data-action="submit"]');
    const { actual, options } = a.state.predict!;
    expect(actual).toMatchObject({ color: "yellow", place: "sea" });
    const changed = options.filter(o => !same(o, actual)).map(o => (["color", "place", "shape"] as const).filter(k => o[k] !== actual[k]));
    expect(changed).toEqual(expect.arrayContaining([["color"], ["place"]]));
    guess(a, true); expect(a.state.view).toBe("result");
  });
  it("keeps one thinking step per quest: no guess where finding or imagining is the task", () => {
    const a = boot(); unlockAll(a);
    const spot = a.quests.findIndex(q => q.kind === "spot");
    a.startQuest(spot); expect(document.querySelector("[data-spot]")).not.toBeNull();
    const create = a.quests.findIndex(q => q.kind === "create");
    a.startQuest(create);
    for (const s of ["color:pink", "place:sea", "shape:star"]) { click(`[data-select="${s}"]`); }
    click('[data-action="submit"]'); vi.advanceTimersByTime(450);
    expect(document.querySelector("[data-predict]")).toBeNull(); expect(a.state.view).toBe("result");
  });
});
