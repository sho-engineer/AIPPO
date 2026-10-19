import { afterEach, describe, expect, it, vi } from "vitest";
import html from "../src/kids/learning.html?raw";

const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const store = "aippo_kids_journey_v1";
const settingsStore = "aippo_kids_settings_v1";
type TestApi = { state: { view: string; world: number }; go: (view: string) => void; quests: {id: string}[]; startQuest: (n: number) => void; stagePassed: (n: number) => boolean; stampOwned: (n: number) => boolean; unlocked: (n: number) => boolean };
const api = () => (window as unknown as { AIPPO_TEST: TestApi }).AIPPO_TEST;
function click(selector: string) {
  const button = document.querySelector<HTMLButtonElement>(selector);
  expect(button, selector).not.toBeNull();
  button!.click();
}
function boot(settings?: object, progress?: object) {
  localStorage.clear();
  if (settings) localStorage.setItem(settingsStore, JSON.stringify(settings));
  if (progress) localStorage.setItem(store, JSON.stringify(progress));
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  document.body.innerHTML = '<div id="app"></div>';
  window.eval(`(function(){${script}\n})()`);
}
afterEach(() => { document.body.innerHTML = ""; localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Kids entry preserves a child's selected learning route", () => {
  it.each(["standard", "advanced"])("keeps initial %s selection after closing and revisiting", (mode) => {
    boot(); click('[data-action="start"]');
    document.querySelector<HTMLSelectElement>("#first-mode")!.value = mode;
    click('[data-guardian="ok"]');
    expect(document.querySelector(`[data-ch-mode="${mode}"][aria-pressed="true"]`)).not.toBeNull();
    click("[data-ch-close]"); click('[data-action="start"]');
    expect(document.querySelector(`[data-ch-mode="${mode}"][aria-pressed="true"]`)).not.toBeNull();
    const settings = JSON.parse(localStorage.getItem(settingsStore)!);
    boot(settings, { schema: 3, done: { 0: { at: "2026-10-14" } } });
    expect(api().state.view).toBe("home");
    click('[data-action="start"]');
    expect(document.querySelector(`[data-ch-mode="${mode}"][aria-pressed="true"]`)).not.toBeNull();
  });
  it("returns an older child to home without discarding basic progress", () => {
    boot({ guardianAccepted: true, ageBand: "10-12" }, { schema: 3, done: { 0: { at: "2026-10-14" } } });
    expect(api().state.view).toBe("home");
    expect(document.querySelector(".homeHead .eyebrow")!.textContent).toBe("練習記録 0件");
    click('[data-action="challenge"]');
    expect(api().state.view).toBe("map");
    expect(document.querySelector(".worldHead .eyebrow")!.textContent).toContain("1/27");
    expect(api().unlocked(1)).toBe(true);
  });
  it("replays the saved task and conditions rather than starting different choices", () => {
    const conditions = { budget: "500円", time: "90分", place: "屋外" };
    boot({ guardianAccepted: true, ageBand: "10-12" }, { schema: 3, done: {}, challenges: [{ mode: "advanced", task: "outing", at: "2026-10-14T00:00:00Z", conditions }] });
    click('[data-action="retry"]');
    expect(document.querySelector('[data-ch-task]')).toBeNull();
    expect(document.querySelector('[data-ch-compare]')).not.toBeNull();
    for (const value of Object.values(conditions)) expect(document.querySelector(".challengeModal")!.textContent).toContain(value);
  });
  it("previews a locked area's purpose while keeping the available adventure selected", () => {
    boot({ guardianAccepted: true, ageBand: "5-6" }); api().go("map");
    click('[data-world="4"]');
    expect(document.querySelector('.stagePreviewRule')!.textContent).toContain('全クエストと ミニテスト');
    expect(document.querySelector('.stagePreviewSpeech')!.textContent).toContain('ひみつ');
    click('[data-stage-close]');
    expect(api().state.view).toBe("map"); expect(api().state.world).toBe(0);
    click('[data-action="current"]'); expect(api().state.view).toBe("entrance");
    click('[data-action="enter-quest"]'); expect(api().state.view).toBe("play");
  });
  it("keeps historical stamps while requiring the new practical evidence for unlocks", () => {
    boot({ guardianAccepted: true, ageBand: "5-6" }, { schema: 2, done: { 4: { at: "2026-10-13" } } });
    expect(api().stampOwned(0)).toBe(true); expect(api().stagePassed(0)).toBe(false); expect(api().unlocked(5)).toBe(false);
    api().go("map");
    expect(document.querySelector(".stageStamp.historical")?.textContent).toContain("旧");
    expect(document.querySelector(".stageStamp.earned")).toBeNull();
  });
  it("provides pronunciation for low-age safety words", () => {
    boot({ guardianAccepted: true, ageBand: '5-6' });
    const target = api().quests.findIndex(q => q.id === 'w5-q2');
    const done = Object.fromEntries(api().quests.slice(0,target).map(q => [q.id, { at: "2026-10-14", assessmentVersion: 2, evidence: { knowledge: true, practice: true } }]));
    boot({ guardianAccepted: true, ageBand: "5-6" }, { schema: 4, done });
    api().startQuest(api().quests.findIndex(q => q.id === "w5-q2"));
    expect(document.querySelector("ruby")).not.toBeNull();
    expect([...document.querySelectorAll("rt")].map((rt) => rt.textContent).join(" ")).toMatch(/じゅうしょ|がっこう|でんわ/);
  });
  it("separates parent's recent simulation record from household self-report and opens the existing details", () => {
    boot({ guardianAccepted: true, ageBand: "10-12" }, {
      schema: 3, done: { 0: { at: "2026-10-13" } },
      challenges: [{ task: "outing", mode: "advanced", at: "2026-10-14T02:00:00.000Z", completedAtISO: "2026-10-14T02:00:00.000Z", localDay: "2026-10-14", timeZone: "Asia/Kuala_Lumpur", sequence: 1, support: "self", hints: 0, errors: 1, selectedRevision: "0円・60分・屋内", evidence: { sourceMethodSelected: true } }],
      daily: [{ title: "家族の計画", at: "2026-10-14", mode: "ai", outcome: "revised", support: "together" }],
    });
    api().go("parent"); click('[data-action="recent"]');
    const summary = document.querySelector(".summaryModal")!;
    expect(summary.textContent).toContain("教材内の練習");
    expect(summary.textContent).toContain("家庭で試した自己申告");
    expect(summary.textContent).toContain("0円・60分・屋内");
    expect(summary.textContent).toContain("直して使った");
    expect(summary.textContent).toContain("未検証");
    click('[data-recent-record]');
    expect(document.querySelector("#recent-title")).toBeNull();
    expect(document.querySelector("#record-title")!.textContent).toBe("クリアしたこと");
  });
  it("marks legacy ordering unknown and opens a challenge without clearing legacy stamps", () => {
    boot({ guardianAccepted: true, ageBand: "10-12" }, { schema: 2, done: { 4: { at: "2026-10-13" } } });
    api().go("parent"); click('[data-action="recent"]');
    expect(document.querySelector(".summaryModal")!.textContent).toContain("直近の1件を特定できません");
    expect(document.querySelector(".summaryModal")!.textContent).toContain("家庭で試した記録はありません");
    click('[data-recent-challenge]');
    expect(document.querySelector(".summaryModal")).toBeNull();
    expect(document.querySelector(".challengeModal")).not.toBeNull();
    expect(api().stampOwned(0)).toBe(true); expect(api().stagePassed(0)).toBe(false);
  });
});
