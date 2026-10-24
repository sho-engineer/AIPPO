import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import canonical from "../src/kids/learning.html?raw";
import standalone from "../public/kids-title/index.html?raw";

type Api = {
  state: { view: string; world: number; hints: number; feedbackErrors: number; tries: number; selected: Record<string, string> };
  saved: { done: Record<string, unknown> };
  quests: { id: string; kind: string; wrongKey?: string }[];
  startQuest(n: number): void; enterQuest(n: number): void; go(view: string): void;
};
const api = () => (window as unknown as { AIPPO_TEST: Api }).AIPPO_TEST;
const click = (selector: string) => { const b = document.querySelector<HTMLButtonElement>(selector); expect(b, selector).not.toBeNull(); b!.click(); };
function boot(source = canonical) {
  document.body.innerHTML = '<div id="app"></div>';
  window.eval(source.match(/<script>([\s\S]*?)<\/script>/)![1]);
  return api();
}
function seedAll(a: Api) {
  a.quests.forEach(q => { a.saved.done[q.id] = { at: "2026-10-19", assessmentVersion: 2, evidence: { knowledge: true, practice: true } }; });
}
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("aippo_title_opening_v1", "seen");
  localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, challengeMode: "guided", readingSupport: "on" }));
  vi.useFakeTimers(); vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authenticated: false }) }));
});
afterEach(() => {
  document.querySelector<HTMLButtonElement>("[data-opening-skip]")?.click();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); document.body.innerHTML = "";
});

describe("Kids strict persona UX regressions", () => {
  it.each(["entrance", "play", "result"])("returns from settings to the same %s and preserves selected cards", view => {
    const a = boot(); a.enterQuest(0);
    if (view !== "entrance") click('[data-action="enter-quest"]');
    if (view !== "entrance") click('[data-select="color:blue"]');
    if (view === "result") { click('[data-action="submit"]'); vi.advanceTimersByTime(450); }
    const selected = { ...a.state.selected }, saved = JSON.stringify(a.saved);
    click('.top [data-nav="settings"]'); click('[data-action="settings-done"]');
    expect(a.state.view).toBe(view); expect(a.state.selected).toEqual(selected); expect(JSON.stringify(a.saved)).toBe(saved);
    expect(document.activeElement).toBe(document.querySelector('.top [data-nav="settings"]'));
  });
  it("returns to the historical map world and scroll position", () => {
    const a = boot(); seedAll(a); a.go("map"); click('[data-world="0"]');
    document.querySelector<HTMLElement>(".pathScroll")!.scrollTop = 315;
    click('.top [data-nav="settings"]'); click('[data-action="settings-back"]');
    expect(a.state.view).toBe("map"); expect(a.state.world).toBe(0);
    expect(document.querySelector<HTMLElement>(".pathScroll")!.scrollTop).toBe(315);
  });
  it("cancels in-flight simulation when settings opens and leaves the same cards usable", () => {
    const a = boot(); a.startQuest(0); click('[data-select="color:blue"]'); click('[data-action="submit"]');
    click('.top [data-nav="settings"]'); vi.advanceTimersByTime(1000);
    expect(a.state.view).toBe("settings"); click('[data-action="settings-done"]');
    expect(a.state.view).toBe("play"); expect(a.state.selected.color).toBe("blue"); expect(document.querySelector(".think")).toBeNull();
    click('[data-action="submit"]'); vi.advanceTimersByTime(450); expect(a.state.view).toBe("result");
  });
  it.each(["settings", "map"])("does not count a submission canceled by leaving to %s before the AI result", target => {
    for (const source of [canonical, standalone]) {
      const a = boot(source); a.startQuest(0); click('[data-select="color:blue"]'); click('[data-action="submit"]');
      expect(a.state.tries).toBe(1);
      if (target === "settings") { click('.top [data-nav="settings"]'); click('[data-action="settings-done"]'); }
      else { click('.questHead [data-nav="map"]'); a.startQuest(0); click('[data-select="color:blue"]'); }
      vi.advanceTimersByTime(1000);
      expect(a.state.view).toBe("play"); expect(a.state.tries).toBe(0);
      click('[data-action="submit"]'); vi.advanceTimersByTime(450);
      expect(a.state.view).toBe("result"); expect(a.state.tries).toBe(1);
      document.querySelector<HTMLButtonElement>("[data-opening-skip]")?.click();
      vi.clearAllTimers(); localStorage.removeItem("aippo_kids_journey_v1"); document.body.innerHTML = "";
    }
  });
  it("keeps the order mission retryable when settings interrupts its AI result", () => {
    const a = boot(); seedAll(a); const index = a.quests.findIndex(q => q.kind === "order");
    expect(index).toBeGreaterThanOrEqual(0);
    a.startQuest(index);
    for (const step of ["choose", "ask", "check"]) click(`[data-order-pick="${step}"]`);
    click('[data-action="submit"]'); expect(a.state.tries).toBe(1);
    click('.top [data-nav="settings"]'); click('[data-action="settings-done"]');
    vi.advanceTimersByTime(1000);
    expect(a.state.view).toBe("play"); expect(a.state.tries).toBe(0);
    click('[data-action="submit"]'); vi.advanceTimersByTime(450);
    expect(a.state.view).toBe("result"); expect(a.state.tries).toBe(1);
  });
  it("cannot resurrect the old mission after records and settings are reset", () => {
    const a = boot(); seedAll(a); a.startQuest(a.quests.length - 1); a.go("settings");
    click('[data-action="reset"]'); click('[data-confirm="reset"]'); click('[data-action="settings-done"]');
    expect(a.state.view).toBe("home"); expect(Object.keys(a.saved.done)).toHaveLength(0);
  });
  it("keeps inspection hints and errors visible past two seconds without generating clear records", () => {
    const a = boot(); seedAll(a); const index = a.quests.findIndex(q => q.kind === "spot"); a.startQuest(index);
    const before = JSON.stringify(a.saved), wrong = ["color", "place", "shape"].find(k => k !== a.quests[index].wrongKey)!;
    click(`[data-spot="${wrong}"]`); const error = document.querySelector('.inspectFeedback[role="status"]')!.textContent;
    vi.advanceTimersByTime(2500); expect(document.querySelector(".inspectFeedback")!.textContent).toBe(error);
    expect(a.state.feedbackErrors).toBe(1); expect(a.state.tries).toBe(0);
    click('[data-action="hint"]'); const hint = document.querySelector(".inspectFeedback")!.textContent;
    vi.advanceTimersByTime(2500); expect(document.querySelector(".inspectFeedback")!.textContent).toBe(hint);
    expect(a.state.hints).toBe(1); expect(a.state.feedbackErrors).toBe(1); expect(JSON.stringify(a.saved)).toBe(before);
  });
  it("describes safety choices without promising a rocket building exercise", () => {
    const a = boot(); seedAll(a); a.startQuest(a.quests.findIndex(q => q.id === "w5-test"));
    expect(document.querySelector(".checkpointPurposeSteps")!.textContent).toContain("ひみつの まもりかたを えらぼう");
    expect(document.querySelector(".checkpointPurposeSteps")!.textContent).not.toContain("いっしょに つくろう");
  });
  it.each(["privacy", "terms"])("standalone %s explains optional accounts without denying registration", async type => {
    boot(standalone); await vi.advanceTimersByTimeAsync(0); api().go("settings"); click(`[data-action="${type}"]`);
    const text = document.querySelector(".policyText")!.textContent!;
    expect(text).toContain("任意"); expect(text).toContain("アカウント");
    expect(text).not.toContain("アカウント登録はありません"); expect(text).not.toContain("会員登録・クラウド同期に対応していません");
  });
  it("invalidates guest mission return state when a delayed account scope resolves in settings", async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(r => { resolve = r; })));
    const a = boot(standalone); a.startQuest(0); click('[data-select="color:blue"]'); a.go("settings");
    resolve({ ok: true, json: async () => ({ authenticated: true, user: { email: "new-owner@example.test" } }) });
    await vi.advanceTimersByTimeAsync(0); click('[data-action="settings-done"]');
    expect(a.state.view).toBe("home");
    expect(document.querySelector('[data-select="color:blue"]')).toBeNull();
    expect(Object.keys(a.saved.done)).toHaveLength(0);
  });
});
