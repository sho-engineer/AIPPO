import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const html = readFileSync(resolve("src/kids/learning.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error("Kids application script missing");
const journeyKey = "aippo_kids_journey_v1";
const settingsKey = "aippo_kids_settings_v1";
type KidsApi = { go: (view: string) => void; saved: { daily: unknown[] } };
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
function nickname() {
  return document.querySelector<HTMLInputElement>("#child-nick")!.value;
}
function reset() {
  api().go("settings");
  click("[data-action=reset]");
  click("[data-confirm=reset]");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  localStorage.clear();
  localStorage.setItem(settingsKey, JSON.stringify({
    guardianAccepted: true, nickname: "child-A", ageBand: "7-9",
  }));
  localStorage.setItem(journeyKey, JSON.stringify({
    schema: 3, done: {}, attempts: {}, artwork: null, portfolio: [], challenges: [],
    daily: [{ goal: "thanks", mode: "cards", outcome: "useful", support: "together", at: "2026-10-14" }],
  }));
  boot();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("Kids records reflect verified persistence outcomes", () => {
  it("saves a changed profile and restores it on a fresh visit", () => {
    api().go("settings");
    document.querySelector<HTMLInputElement>("#child-nick")!.value = "child-B";
    click("[data-action=profile-save]");
    expect(JSON.parse(localStorage.getItem(settingsKey)!).nickname).toBe("child-B");
    boot();
    api().go("settings");
    expect(nickname()).toBe("child-B");
    expect(api().saved.daily).toHaveLength(1);
  });

  it("keeps the previous profile in memory and storage when saving throws", () => {
    api().go("settings");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    document.querySelector<HTMLInputElement>("#child-nick")!.value = "child-B";
    click("[data-action=profile-save]");
    expect(document.body.textContent).toMatch(/保存できません|保存できな|保存を確認できません/);
    expect(JSON.parse(localStorage.getItem(settingsKey)!).nickname).toBe("child-A");
    api().go("settings");
    expect(nickname()).toBe("child-A");
    vi.restoreAllMocks();
    boot();
    api().go("settings");
    expect(nickname()).toBe("child-A");
  });

  it("retains the displayed profile when readback throws after a successful write", () => {
    api().go("settings");
    const read = Storage.prototype.getItem;
    let settingsReads = 0;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      // The first read is the compare-and-set guard, before any write.
      // Fail only the second read, which verifies the completed write.
      if (key === settingsKey && ++settingsReads === 2) throw new Error("readback denied");
      return read.call(this, key);
    });
    document.querySelector<HTMLInputElement>("#child-nick")!.value = "child-B";
    click("[data-action=profile-save]");
    expect(document.body.textContent).toContain("保存を確認できません");
    api().go("settings");
    expect(nickname()).toBe("child-A");
    vi.restoreAllMocks();
    expect(JSON.parse(localStorage.getItem(settingsKey)!).nickname).toBe("child-B");
    boot();
    api().go("settings");
    expect(nickname()).toBe("child-B");
  });

  it("does not accept a write that returns normally but stores nothing", () => {
    api().go("settings");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => undefined);
    document.querySelector<HTMLInputElement>("#child-nick")!.value = "child-B";
    click("[data-action=profile-save]");
    expect(document.body.textContent).toMatch(/保存できません|保存できな|保存を確認できません/);
    api().go("settings");
    expect(nickname()).toBe("child-A");
  });

  it("removes both record stores and remains empty after reloading", () => {
    reset();
    expect(localStorage.getItem(journeyKey)).toBeNull();
    expect(localStorage.getItem(settingsKey)).toBeNull();
    expect(api().saved.daily).toHaveLength(0);
    expect(nickname()).toBe("");
    boot();
    expect(api().saved.daily).toHaveLength(0);
    api().go("settings");
    expect(nickname()).toBe("");
  });

  it("retains both stores and memory when both removals throw", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("denied"); });
    reset();
    expect(api().saved.daily).toHaveLength(1);
    expect(nickname()).toBe("child-A");
    expect(document.body.textContent).toMatch(/削除でき|消去でき|消せません/);
    vi.restoreAllMocks();
    boot();
    expect(api().saved.daily).toHaveLength(1);
  });

  it.each([journeyKey, settingsKey])("clears only verified data when removing %s fails", (failedKey) => {
    const remove = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key: string) {
      if (key === failedKey) throw new Error("denied");
      return remove.call(this, key);
    });
    reset();
    expect(document.body.textContent).toMatch(/削除でき|消去でき|消せません/);
    expect(api().saved.daily).toHaveLength(failedKey === journeyKey ? 1 : 0);
    expect(nickname()).toBe(failedKey === settingsKey ? "child-A" : "");
    expect(localStorage.getItem(failedKey)).not.toBeNull();
    expect(localStorage.getItem(failedKey === journeyKey ? settingsKey : journeyKey)).toBeNull();
    vi.restoreAllMocks();
    boot();
    api().go("settings");
    expect(api().saved.daily).toHaveLength(failedKey === journeyKey ? 1 : 0);
    expect(nickname()).toBe(failedKey === settingsKey ? "child-A" : "");
  });

  it("reports uncertain deletion when removals succeed but readback throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("read denied"); });
    reset();
    expect(document.body.textContent).toContain("削除できたか確認できません");
    expect(api().saved.daily).toHaveLength(1);
    expect(nickname()).toBe("child-A");
    vi.restoreAllMocks();
    expect(localStorage.getItem(journeyKey)).toBeNull();
    expect(localStorage.getItem(settingsKey)).toBeNull();
    boot();
    expect(api().saved.daily).toHaveLength(0);
    api().go("settings");
    expect(nickname()).toBe("");
  });

  it("detects a removal that returns normally but leaves persisted records", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => undefined);
    reset();
    expect(api().saved.daily).toHaveLength(1);
    expect(nickname()).toBe("child-A");
    expect(document.body.textContent).toMatch(/削除でき|消去でき|消せません/);
  });
});
