import { afterEach, describe, expect, it, vi } from "vitest";
import html from "../src/kids/learning.html?raw";

type RecordEntry = Record<string, unknown>;
type TestApi = {
  state: { hints: number; feedbackErrors: number; tries: number };
  saved: { done: Record<string, RecordEntry> };
  quests: { id: string; hint?: string }[];
  startQuest: (index: number) => void;
  go: (view: string) => void;
};
const store = "aippo_kids_journey_v1";
const proof = { assessmentVersion: 2, evidence: { knowledge: true, practice: true }, at: "2026-10-13", attempts: 1 };
const fixture = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [i, { ...proof }]));
const indexFor = (api: TestApi, id: string) => {
  const index = api.quests.findIndex(q => q.id === id);
  expect(index, id).toBeGreaterThanOrEqual(0);
  return index;
};
// These are target-screen fixtures, not a claim that the prerequisites were played.
function prepareBefore(api: TestApi, id: string) {
  const index = indexFor(api, id);
  for (const q of api.quests.slice(0, index)) api.saved.done[q.id] ??= { ...proof };
  return index;
}
const click = (selector: string) => {
  const button = document.querySelector<HTMLButtonElement>(selector);
  expect(button, selector).not.toBeNull();
  button!.click();
};
function boot(done: Record<number, RecordEntry>, ageBand = "5-6") {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  localStorage.clear();
  localStorage.setItem(store, JSON.stringify({ schema: 3, done }));
  localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ ageBand, guardianAccepted: true }));
  document.body.innerHTML = '<div id="app"></div>';
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  window.eval(script);
  return (window as unknown as { AIPPO_TEST: TestApi }).AIPPO_TEST;
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("Kids reading guidance and support evidence", () => {
  it("records comparison errors and hints separately from submission attempts, and resets for the next quest", async () => {
    const api = boot(fixture(5));
    api.startQuest(prepareBefore(api, "w2-q1"));
    click('[data-spot="place"]');
    click('[data-spot="shape"]');
    click('[data-action="hint"]');
    expect(api.state.tries).toBe(0);
    expect(api.state.feedbackErrors).toBe(2);
    expect(api.state.hints).toBe(1);
    click('[data-spot="color"]');
    click('[data-select="color:blue"]');
    click('[data-action="submit"]');
    await vi.advanceTimersByTimeAsync(450);
    click('[data-action="next"]');
    const record = JSON.parse(localStorage.getItem(store)!).done["w2-q1"];
    expect(record).toMatchObject({ attempts: 1, submitAttempts: 1, feedbackErrors: 2, hints: 1 });
    api.startQuest(indexFor(api, "w2-q2"));
    expect(api.state.tries).toBe(0);
    expect(api.state.feedbackErrors).toBe(0);
    expect(api.state.hints).toBe(0);
    api.go("parent");
    click('[data-action="recent"]');
    click("[data-recent-record]");
    const text = document.querySelector(".modal")!.textContent!.replace(/\s/g, "");
    expect(text).toContain("送信/解答1回");
    expect(text).toContain("比較やり直し2回");
    expect(text).toContain("ヒント1回");
  });

  it("does not invent zero support for legacy records", () => {
    const api = boot(fixture(5));
    expect(api.saved.done["w1-test"].hints).toBeUndefined();
    expect(api.saved.done["w1-test"].feedbackErrors).toBeUndefined();
    api.go("parent");
    click('[data-action="recent"]');
    click("[data-recent-record]");
    expect(document.querySelector(".modal")!.textContent).toContain("支援未記録");
    expect(JSON.parse(localStorage.getItem(store)!).done["w1-test"].hints).toBeUndefined();
  });

  it("adds readings to correction feedback while keeping unsafe requests rejected", () => {
    const api = boot(fixture(24));
    api.startQuest(prepareBefore(api, "w5-q4"));
    click('[data-literacy="0"]');
    expect(document.querySelector(".testFeedback rt")!.textContent).toBeTruthy();
    expect(document.querySelector(".testFeedback")!.textContent).toContain("そうだん");
    api.saved.done["w5-q4"] = { ...proof };
    api.startQuest(indexFor(api, "w5-test"));
    click('[data-action=assessment-begin]'); click('[data-test-answer="2"]');
    click('[data-safe-prompt="private"]');
    click('[data-safe-person="ai"]');
    click('[data-action="safe-submit"]');
    expect(document.querySelector(".testFeedback rt")).not.toBeNull();
    expect(api.saved.done["w5-test"]).toBeUndefined();
    expect(document.querySelector("[data-safe-prompt]")).not.toBeNull();
  });

  it("escapes hint content before applying readings", () => {
    const api = boot(fixture(23));
    const index = prepareBefore(api, "w5-q4");
    api.quests[index].hint = '<img src=x onerror="window.bad=1">大人に相談';
    api.startQuest(index);
    click('[data-literacy="0"]');
    const feedback = document.querySelector(".testFeedback")!;
    expect(feedback.querySelector("img")).toBeNull();
    expect(feedback.textContent).toContain("<img");
    expect(feedback.querySelector("rt")).not.toBeNull();
  });
});
