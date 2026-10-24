import { afterEach, describe, expect, it, vi } from "vitest";
import canonical from "../src/kids/learning.html?raw";

type Api = {
  quests: { id: string; kind: string; world: number; answer?: number }[];
  saved: { done: Record<string, unknown> };
  enterQuest(n: number): void; startQuest(n: number): void;
};
const han = /[一-鿿]/;
function boot(readingSupport: string) {
  vi.useFakeTimers(); vi.stubGlobal("matchMedia", () => ({ matches: true }));
  localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, challengeMode: "guided", ageBand: "unset", readingSupport }));
  document.body.innerHTML = '<div id="app"></div>';
  window.eval(canonical.match(/<script>([\s\S]*?)<\/script>/)![1]);
  const api = (window as unknown as { AIPPO_TEST: Api }).AIPPO_TEST;
  api.quests.forEach(q => { api.saved.done[q.id] = { at: "2026-10-19", assessmentVersion: 2, evidence: { knowledge: true, practice: true } }; });
  return api;
}
/** Kanji outside <ruby> on the child's mission screens (header chrome excluded). */
function bareKanji(where: string) {
  const out: string[] = [];
  const view = document.querySelector(".view");
  if (!view) return out;
  const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement!;
    if (parent.closest("ruby,rt,svg,[aria-hidden=true],.eyebrow")) continue;
    for (const word of node.textContent!.match(/[一-鿿]+[ぁ-ん]*/g) || []) out.push(`${where}:${word}`);
  }
  return out;
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); document.body.innerHTML = ""; });

describe("Kids default reading support covers every mission screen", () => {
  it("leaves no kanji without a reading on entrances, questions, choices and wrong-answer reasons", () => {
    const api = boot("on"); const missing: string[] = [];
    api.quests.forEach((quest, index) => {
      api.enterQuest(index); missing.push(...bareKanji(`${quest.id}/entrance`));
      api.startQuest(index); missing.push(...bareKanji(`${quest.id}/play`));
      document.querySelector<HTMLButtonElement>("[data-action=assessment-begin]")?.click();
      missing.push(...bareKanji(`${quest.id}/question`));
      const literacy = [...document.querySelectorAll<HTMLButtonElement>("[data-literacy]")].find(b => Number(b.dataset.literacy) !== quest.answer);
      // first checkpoint answers per world (see kidsOrientation); pick a wrong one so the reason renders
      const checkpointAnswer = [0, 1, 2, 1, 2][quest.world];
      const checkpoint = [...document.querySelectorAll<HTMLButtonElement>("[data-test-answer]")].find(b => Number(b.dataset.testAnswer) !== checkpointAnswer);
      (literacy || checkpoint)?.click();
      if (literacy || checkpoint) expect(document.querySelector(".testFeedback")!.textContent!.trim(), quest.id).not.toBe("");
      missing.push(...bareKanji(`${quest.id}/reason`));
    });
    expect(missing).toEqual([]);
  });
  it("shows plain text without ruby when reading support is turned off", () => {
    const api = boot("off");
    api.startQuest(api.quests.findIndex(q => q.id === "w5-q3"));
    expect(document.querySelector(".view ruby")).toBeNull();
    expect(han.test(document.querySelector(".view")!.textContent!)).toBe(true);
  });
});
