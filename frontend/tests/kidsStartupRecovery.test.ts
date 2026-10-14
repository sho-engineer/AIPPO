import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const html = readFileSync(resolve("src/kids/learning.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error("Kids application script missing");
const journeyKey = "aippo_kids_journey_v1";
const settingsKey = "aippo_kids_settings_v1";
const initialJourney = JSON.stringify({
  schema: 3, done: { 0: { at: "2026-10-13", attempts: 2, choices: {} } },
  attempts: {}, artwork: null, portfolio: [], challenges: [],
  daily: [{ goal: "thanks", title: "既存の家庭記録", mode: "cards", outcome: "useful", support: "together", at: "2026-10-13" }],
});
const initialSettings = JSON.stringify({ guardianAccepted: true, nickname: "existing-child", ageBand: "7-9" });
type KidsApi = {
  state: { quest: number; result: { success: boolean } | null };
  saved: { daily: unknown[]; done: Record<string, unknown> };
  go: (view: string) => void;
  nextFinish: () => void;
};
const api = () => (window as unknown as { AIPPO_TEST: KidsApi }).AIPPO_TEST;

function boot() {
  document.body.innerHTML = html.replace(/<script>[\s\S]*?<\/script>/, "");
  window.eval(script!);
}
function click(selector: string) {
  const button = document.querySelector<HTMLButtonElement>(selector);
  expect(button, selector).not.toBeNull();
  button!.click();
}
function finishSessionPractice() {
  api().state.quest = 1;
  api().state.result = { success: true };
  api().nextFinish();
}
function editProfile() {
  api().go("settings");
  document.querySelector<HTMLInputElement>("#child-nick")!.value = "session-child";
  click("[data-action=profile-save]");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  localStorage.clear();
  localStorage.setItem(journeyKey, initialJourney);
  localStorage.setItem(settingsKey, initialSettings);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("Kids startup preserves existing data when it cannot establish a safe snapshot", () => {
  it("allows a genuinely absent journey to create new records", () => {
    localStorage.removeItem(journeyKey);
    boot();
    finishSessionPractice();
    expect(JSON.parse(localStorage.getItem(journeyKey)!).done[1]).toBeDefined();
  });

  it("does not overwrite existing records after one failed initial read even though later reads and writes work", () => {
    const read = Storage.prototype.getItem;
    let failed = false;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key === journeyKey && !failed) { failed = true; throw new Error("temporary read failure"); }
      return read.call(this, key);
    });
    const write = vi.spyOn(Storage.prototype, "setItem");
    boot();
    expect(localStorage.getItem(journeyKey)).toBe(initialJourney);
    expect(write.mock.calls.filter(([key]) => key === journeyKey)).toHaveLength(0);
    expect(document.body.textContent).toMatch(/未保存|読み込め|読み取り|読取|保護/);
    finishSessionPractice();
    expect(localStorage.getItem(journeyKey)).toBe(initialJourney);
  });

  it("keeps the original data under a persistent read failure and session practice", () => {
    const read = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key === journeyKey) throw new Error("read blocked");
      return read.call(this, key);
    });
    boot();
    finishSessionPractice();
    vi.restoreAllMocks();
    expect(localStorage.getItem(journeyKey)).toBe(initialJourney);
  });

  it("recovers the original snapshot on retry without merging unsaved session practice", () => {
    const read = Storage.prototype.getItem;
    let failed = false;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key === journeyKey && !failed) { failed = true; throw new Error("temporary read failure"); }
      return read.call(this, key);
    });
    boot();
    finishSessionPractice();
    click("[data-action=storage-retry]");
    expect(api().saved.daily).toHaveLength(1);
    expect(api().saved.done[0]).toBeDefined();
    expect(api().saved.done[1]).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(journeyKey)!).daily).toHaveLength(1);
    expect(document.body.textContent).toMatch(/未保存|復旧|読み直|読み込|引き継|再開/);
  });

  it.each([
    ["malformed JSON", "{not-json"],
    ["stored JSON null", "null"],
    ["null completion entry", JSON.stringify({ ...JSON.parse(initialJourney), done: { 0: null } })],
    ["unknown completion index", JSON.stringify({ ...JSON.parse(initialJourney), done: { 999: { at: "2026-10-13" } } })],
    ["negative completion index", JSON.stringify({ ...JSON.parse(initialJourney), done: { "-1": true } })],
    ["noninteger completion index", JSON.stringify({ ...JSON.parse(initialJourney), done: { "1.5": true } })],
    ["nonnumeric completion index", JSON.stringify({ ...JSON.parse(initialJourney), done: { unknown: true } })],
    ["legacy completion index outside its original range", JSON.stringify({ ...JSON.parse(initialJourney), schema: 1, done: { 8: true } })],
    ["legacy schema omission with an unsupported completion index", JSON.stringify({ ...JSON.parse(initialJourney), schema: undefined, done: { 24: true } })],
    ["null portfolio entry", JSON.stringify({ ...JSON.parse(initialJourney), portfolio: [null] })],
    ["missing portfolio choices", JSON.stringify({ ...JSON.parse(initialJourney), portfolio: [{ quest: 0, at: "2026-10-13" }] })],
    ["null portfolio choices", JSON.stringify({ ...JSON.parse(initialJourney), portfolio: [{ quest: 0, at: "2026-10-13", choices: null }] })],
    ["null household entry", JSON.stringify({ ...JSON.parse(initialJourney), daily: [null] })],
    ["missing household timestamp", JSON.stringify({ ...JSON.parse(initialJourney), daily: [{ goal: "thanks" }] })],
    ["null challenge entry", JSON.stringify({ ...JSON.parse(initialJourney), challenges: [null] })],
    ["missing challenge timestamp", JSON.stringify({ ...JSON.parse(initialJourney), challenges: [{ task: "gift" }] })],
    ["null challenge conditions", JSON.stringify({ ...JSON.parse(initialJourney), challenges: [{ task: "gift", at: "2026-10-13", conditions: null }] })],
    ["null challenge evidence", JSON.stringify({ ...JSON.parse(initialJourney), challenges: [{ task: "gift", at: "2026-10-13", evidence: null }] })],
    ["unknown schema", JSON.stringify({ ...JSON.parse(initialJourney), schema: 99 })],
    ["null completion records", JSON.stringify({ ...JSON.parse(initialJourney), done: null })],
    ["array completion records", JSON.stringify({ ...JSON.parse(initialJourney), done: [] })],
    ["invalid household records", JSON.stringify({ ...JSON.parse(initialJourney), daily: "not-an-array" })],
  ])("protects %s instead of silently replacing it with defaults", (_name, raw) => {
    localStorage.setItem(journeyKey, raw);
    boot();
    finishSessionPractice();
    expect(localStorage.getItem(journeyKey)).toBe(raw);
    expect(document.body.textContent).toMatch(/未保存|不正|読|保護|復旧/);
  });

  it.each([1, undefined])("preserves and migrates valid legacy boolean completions for schema %s", (schema) => {
    const raw = JSON.stringify({ schema, done: { 0: true, 7: true }, attempts: {} });
    localStorage.setItem(journeyKey, raw);
    boot();
    expect(api().saved.done[0]).toBe(true);
    expect(api().saved.done[16]).toBe(true);
    expect(JSON.parse(localStorage.getItem(journeyKey)!).done[16]).toBe(true);
  });

  it.each([2, 3])("accepts the final known index without reinterpreting it for schema %s", (schema) => {
    localStorage.setItem(journeyKey, JSON.stringify({ schema, done: { 24: { at: "2026-10-13" } }, attempts: {} }));
    boot();
    expect(api().saved.done[24]).toBeDefined();
    expect(JSON.parse(localStorage.getItem(journeyKey)!).done[24]).toBeDefined();
  });

  it("protects settings that could not be read even if later reads and writes succeed", () => {
    const read = Storage.prototype.getItem;
    let failed = false;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key === settingsKey && !failed) { failed = true; throw new Error("temporary settings failure"); }
      return read.call(this, key);
    });
    boot();
    editProfile();
    expect(localStorage.getItem(settingsKey)).toBe(initialSettings);
    expect(document.body.textContent).toMatch(/確認できません|未保存|読み込|読取|保護/);
  });

  it("protects stored JSON null settings as invalid data, not an absent key", () => {
    localStorage.setItem(settingsKey, "null");
    boot();
    editProfile();
    expect(localStorage.getItem(settingsKey)).toBe("null");
  });

  it("protects malformed settings rather than replacing them on profile save", () => {
    const raw = "{broken-settings";
    localStorage.setItem(settingsKey, raw);
    boot();
    editProfile();
    expect(localStorage.getItem(settingsKey)).toBe(raw);
  });

  it("does not overwrite another visit's new journey after this visit loaded its snapshot", () => {
    boot();
    const external = JSON.stringify({ ...JSON.parse(initialJourney), daily: [{ title: "他の画面で追加", at: "2026-10-14" }] });
    localStorage.setItem(journeyKey, external);
    finishSessionPractice();
    expect(localStorage.getItem(journeyKey)).toBe(external);
    expect(document.body.textContent).toMatch(/未保存|変更|読み直|読込|再読み/);
  });

  it("does not overwrite another visit's settings after this visit loaded its snapshot", () => {
    boot();
    const external = JSON.stringify({ guardianAccepted: true, nickname: "external-child", ageBand: "10-12" });
    localStorage.setItem(settingsKey, external);
    editProfile();
    expect(localStorage.getItem(settingsKey)).toBe(external);
    expect(document.body.textContent).toMatch(/確認できません|変更|読み直|読込/);
  });
});
