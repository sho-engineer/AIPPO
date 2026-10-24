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
  // Both routes keep the mission state, so only the attempt rollback can bring the count back to 0.
  it.each(["settings", "parent"])("does not count a submission canceled by opening %s before the AI result", target => {
    for (const source of [canonical, standalone]) {
      const a = boot(source); a.startQuest(0); click('[data-select="color:blue"]'); click('[data-action="submit"]');
      expect(a.state.tries).toBe(1);
      if (target === "settings") { click('.top [data-nav="settings"]'); click('[data-action="settings-done"]'); }
      else { click('.top [data-nav="parent"]'); click('[data-action="map"]'); }
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
  it.each(["entrance", "play", "result"])("returns from the growth record to the same %s without losing cards or records", view => {
    const a = boot(); a.enterQuest(0);
    if (view !== "entrance") { click('[data-action="enter-quest"]'); click('[data-select="color:blue"]'); }
    if (view === "result") { click('[data-action="submit"]'); vi.advanceTimersByTime(450); }
    const selected = { ...a.state.selected }, saved = JSON.stringify(a.saved);
    click('.top [data-nav="parent"]'); expect(a.state.view).toBe("parent");
    expect(document.querySelector('.top [data-nav="map"]')!.getAttribute("aria-label")).toBe("クエストに戻る");
    expect(document.querySelector('[data-action="map"]')!.textContent).toContain("クエストに もどる");
    click('[data-action="map"]');
    expect(a.state.view).toBe(view); expect(a.state.selected).toEqual(selected); expect(JSON.stringify(a.saved)).toBe(saved);
    expect(document.activeElement).toBe(document.querySelector('.top [data-nav="parent"]'));
  });
  it("keeps the growth record's map exit when it was opened from the map", () => {
    const a = boot(); seedAll(a); a.go("map"); click('.top [data-nav="parent"]');
    expect(document.querySelector('[data-action="map"]')!.textContent).toContain("マップへ戻る");
    click('[data-action="map"]'); expect(a.state.view).toBe("map");
  });
  it("labels the reward button by what it does after a cleared stage is replayed", () => {
    const a = boot(); seedAll(a); const index = a.quests.findIndex(q => q.kind === "literacy");
    a.startQuest(index); const answer = (a.quests[index] as unknown as { answer: number }).answer;
    click(`[data-literacy="${answer}"]`); expect(a.state.view).toBe("win");
    const next = document.querySelector('[data-action="next"]')!;
    expect(next.textContent).not.toContain("さいごの ミッション");
    (next as HTMLButtonElement).click(); expect(a.state.view).toBe("map");
  });
  it("tells which card differs or that only the reason needs rethinking, and clears it on change", () => {
    const a = boot(); seedAll(a); const index = a.quests.findIndex(q => q.id === "w4-test");
    a.startQuest(index); click('[data-action="assessment-begin"]'); click('[data-test-answer="1"]');
    click('[data-select="color:pink"]'); click('[data-select="place:sea"]'); click('[data-select="shape:round"]');
    click('[data-reason="purpose"]'); click('[data-action="practice-submit"]');
    expect(document.querySelector(".testFeedback")!.textContent).toContain("まどの かたち");
    click('[data-practice-focus="shape"]'); click('[data-select="shape:star"]');
    expect(document.querySelector(".testFeedback")!.textContent).toBe("");
    click('[data-reason="random"]'); click('[data-action="practice-submit"]');
    expect(document.querySelector(".testFeedback")!.textContent).toContain("わけ");
    expect(a.saved.done["w4-test"]).toMatchObject({ assessmentVersion: 2 }); // seeded record untouched by failed tries
  });
  it("names which device record a reset will erase before the child's records are removed", async () => {
    for (const [source, scope] of [[canonical, "「ゲスト」の記録"], [standalone, "「ゲスト」の記録"]] as const) {
      const a = boot(source);
      for (let i = 0; i < 10; i++) await Promise.resolve(); // standalone settles its guest session check first
      a.go("settings"); click('.settingAction[data-action="reset"]');
      expect(document.querySelector(".resetScope")!.textContent).toContain(scope);
      click('[data-confirm="cancel"]');
      document.querySelector<HTMLButtonElement>("[data-opening-skip]")?.click();
      vi.clearAllTimers(); document.body.innerHTML = "";
    }
  });
  it("ignores and does not count a second submit while the AI answer is still pending", () => {
    const a = boot(); a.startQuest(0); click('[data-select="color:blue"]');
    const submit = document.querySelector<HTMLButtonElement>('[data-action="submit"]')!;
    submit.click(); submit.click(); expect(a.state.tries).toBe(1);
    click('.top [data-nav="settings"]'); click('[data-action="settings-done"]');
    expect(a.state.tries).toBe(0);
  });
  it("forgets the mission return once another mission starts from the growth record", () => {
    const a = boot(); seedAll(a); a.enterQuest(0); click('[data-action="enter-quest"]');
    click('.top [data-nav="parent"]'); expect(document.querySelector('[data-action="map"]')!.textContent).toContain("クエストに もどる");
    const replay = a.quests.findIndex(q => q.kind === "literacy");
    a.startQuest(replay); // e.g. a replay started from the growth record's portfolio
    click(`[data-literacy="${(a.quests[replay] as unknown as { answer: number }).answer}"]`); expect(a.state.view).toBe("win");
    click('.top [data-nav="parent"]');
    expect(document.querySelector('[data-action="map"]')!.textContent).toContain("マップへ戻る");
    expect(document.querySelector('.top [data-nav="map"]')!.getAttribute("aria-label")).toBe("マップに戻る");
    click('[data-action="map"]'); expect(a.state.view).toBe("map");
  });
  it("names the account record when a signed-in guardian resets on the standalone page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authenticated: true, user: { email: "guardian@example.com" } }) }));
    const a = boot(standalone);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    a.go("settings"); click('.settingAction[data-action="reset"]');
    expect(document.querySelector(".resetScope")!.textContent).toContain("ログイン中のアカウント");
    click('[data-confirm="cancel"]');
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
