import { afterEach, describe, expect, it, vi } from "vitest";
import html from "../src/kids/learning.html?raw";

type Row = Record<string, unknown>;
type Api = {
  quests: { short: string }[];
  saved: { done: Record<string, Row>; latestAttempts: Record<string, Row>; recordSequence: number; challenges: Row[] };
  state: { quest: number; result: Row; tries: number; selected: Row; order: string[]; hints: number; feedbackErrors: number };
  go: (view: string) => void;
  nextFinish: () => void;
};
const store = "aippo_kids_journey_v1";
const settingsStore = "aippo_kids_settings_v1";
const click = (selector: string) => {
  const button = document.querySelector<HTMLButtonElement>(selector);
  expect(button, selector).not.toBeNull();
  button!.click();
};
function boot(progress: Row = { schema: 3, done: {} }, settings: Row = { guardianAccepted: true }) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  localStorage.clear();
  localStorage.setItem(store, JSON.stringify(progress));
  localStorage.setItem(settingsStore, JSON.stringify(settings));
  document.body.innerHTML = '<div id="app"></div>';
  window.eval(html.match(/<script>([\s\S]*?)<\/script>/)![1]);
  return (window as unknown as { AIPPO_TEST: Api }).AIPPO_TEST;
}
function finish(api: Api, quest = 0, hints = 0) {
  Object.assign(api.state, { quest, result: { success: true, evidence: { knowledge: true, practice: true } }, tries: 1, hints, feedbackErrors: 0, selected: { color: "blue" }, order: [] });
  api.nextFinish();
}
const text = () => document.querySelector(".modal")!.textContent!;
afterEach(() => { vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ""; localStorage.clear(); });

describe("Kids honest first/latest records and chronology", () => {
  it("preserves first completion and stores each replay as the latest only", () => {
    const api = boot(); finish(api, 0, 2);
    const first = structuredClone(api.saved.done[0]);
    vi.setSystemTime(new Date("2026-10-15T12:01:00.000Z")); finish(api, 0, 0);
    expect(api.saved.done[0]).toEqual(first);
    expect(api.saved.latestAttempts[0]).toMatchObject({ sequence: 2, hints: 0 });
    const persisted = JSON.parse(localStorage.getItem(store)!);
    const reload = boot(persisted);
    expect(reload.saved.done[0]).toEqual(first);
    expect(reload.saved.latestAttempts[0].sequence).toBe(2);
    reload.go("parent"); click('[data-action="recent"]'); click("[data-recent-record]");
    expect(text()).toContain("初回クリア"); expect(text()).toContain("直近の練習");
    expect(text()).toContain("ヒント2回"); expect(text()).toContain("ヒント0回");
  });
  it("shows latest adventure rather than an older challenge even after clock rollback", () => {
    const api = boot({ schema: 3, done: {}, recordSequence: 0, challenges: [{ at: "2026-10-15T11:00:00.000Z", task: "gift", sequence: 7 }] });
    vi.setSystemTime(new Date("2026-10-15T10:00:00.000Z")); finish(api);
    expect(api.saved.latestAttempts[0].sequence).toBe(8);
    api.go("parent"); click('[data-action="recent"]');
    expect(text()).toContain("冒険内の直近の課題クリア");
    expect(text()).not.toContain("日常チャレンジは未記録");
  });
  it("orders two completions on the same day by sequence, not date-only ties", () => {
    const api = boot(); finish(api, 1); finish(api, 0);
    api.go("parent"); click('[data-action="recent"]');
    expect(document.querySelectorAll(".dailyRecord")[0].textContent).toContain("冒険内の直近");
    expect(document.querySelectorAll(".dailyRecord")[0].textContent).toContain(api.quests[0].short);
    expect(document.querySelectorAll(".dailyRecord")[0].textContent).not.toContain(api.quests[1].short);
    expect(document.querySelectorAll(".dailyRecord")[0].textContent).toContain("2026-10-15");
    expect(api.saved.latestAttempts[0].sequence).toBe(2);
  });
  it("marks legacy same-day ordering unknown without fabricating timestamps", () => {
    const api = boot({ schema: 3, done: { 0: { at: "2026-10-15", attempts: 1 }, 1: { at: "2026-10-15", attempts: 1 } } });
    api.go("parent"); click('[data-action="recent"]'); expect(text()).toContain("直近の1件を特定できません");
    click("[data-recent-record]"); expect(text()).toContain("同日内の順序不明");
    expect(api.saved.done[0].completedAtISO).toBeUndefined();
  });
  it("records browser local day and timezone alongside exact ISO time", () => {
    const api = boot(); finish(api);
    const row = api.saved.done[0];
    expect(row.completedAtISO).toBe("2026-10-15T12:00:00.000Z");
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(row.timeZone).toBe(tz);
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    expect(row.localDay).toBe(["year", "month", "day"].map(key => parts.find(p => p.type === key)!.value).join("-"));
  });
  it("uses the maximum existing record sequence even with a stale counter", () => {
    const api = boot({ schema: 3, done: { 1: { at: "2026-10-14", sequence: 42 } }, recordSequence: 1 });
    finish(api); expect(api.saved.done[0].sequence).toBe(43);
  });
  it("uses the browser timezone at a UTC date boundary, not UTC or a fixed MYT rule", () => {
    const api = boot();
    const original = Intl.DateTimeFormat.prototype.resolvedOptions;
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) { return { ...original.call(this), timeZone: "Asia/Tokyo" }; });
    vi.setSystemTime(new Date("2026-10-15T15:30:00.000Z")); finish(api);
    expect(api.saved.done[0]).toMatchObject({ completedAtISO: "2026-10-15T15:30:00.000Z", localDay: "2026-10-16", timeZone: "Asia/Tokyo" });
  });
  it("keeps raw data protected when no larger safe sequence exists", () => {
    const original = { schema: 3, done: {}, recordSequence: Number.MAX_SAFE_INTEGER };
    const api = boot(original); const before = localStorage.getItem(store); finish(api);
    expect(localStorage.getItem(store)).toBe(before);
    expect(document.querySelector(".storageNotice")?.textContent).toContain("順序を更新できません");
  });
  it.each([{ recordSequence: -1 }, { latestAttempts: { 0: { at: "2026-10-15", sequence: "2" } } }, { latestAttempts: { 25: { at: "2026-10-15" } } }, { done: { 0: { localDay: "2026-02-30" } } }, { done: { 0: { completedAtISO: "2026-02-30T00:00:00.000Z" } } }, { done: { 0: { completedAtISO: "2026-10-15T23:00:00.000Z", timeZone: "Asia/Kuala_Lumpur", localDay: "2026-10-15" } } }])("protects invalid new metadata from replacement: %j", bad => {
    const progress = { schema: 3, done: {}, ...bad }; const api = boot(progress); finish(api);
    expect(localStorage.getItem(store)).toBe(JSON.stringify(progress));
    expect(document.querySelector(".storageNotice")?.textContent).toContain("保護");
  });
  it("does not overwrite a concurrent record during a replay", () => {
    const api = boot(); finish(api);
    const other = JSON.stringify({ schema: 3, done: { 2: { at: "2026-10-15" } } });
    localStorage.setItem(store, other); finish(api);
    expect(localStorage.getItem(store)).toBe(other);
  });
  it("keeps checkpoint history bounded on new writes without rewriting loaded history", () => {
    const previous = { at: "2026-10-14", assessmentVersion: 2, evidence: { knowledge: true, practice: true }, previousAssessment: { at: "2026-10-13" } };
    const api = boot({ schema: 3, done: { 4: previous } });
    expect(api.saved.done[4]).toEqual(previous); finish(api, 4);
    expect(api.saved.done[4].previousAssessment).toEqual({ at: "2026-10-14", assessmentVersion: 2, evidence: { knowledge: true, practice: true } });
    expect(api.saved.latestAttempts[4]).toBeUndefined();
  });
  it.each([undefined, "auto", "on", "off"])("accepts backward-compatible reading preference %s", readingSupport => {
    boot(undefined, { guardianAccepted: true, readingSupport });
    expect(document.querySelector(".storageNotice")).toBeNull();
  });
  it("exports reading preference, first/latest records and chronology counter", () => {
    const api = boot(undefined, { guardianAccepted: true, readingSupport: "on" }); finish(api); finish(api);
    const NativeBlob = Blob; let exported = "";
    vi.spyOn(window, "Blob").mockImplementation((parts = [], options) => { exported = String(parts[0]); return new NativeBlob(parts, options); });
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:export-test"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    api.go("settings"); click('[data-action="export"]');
    expect(JSON.parse(exported)).toMatchObject({ profile: { readingSupport: "on" }, progress: { recordSequence: 2, done: { 0: { sequence: 1 } }, latestAttempts: { 0: { sequence: 2 } } } });
  });
});
