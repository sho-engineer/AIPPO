import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  clearLearningData,
  exportLearningData,
  loadSettings,
  resetSettings,
  saveSettings,
} from "../src/lib/settings";

/**
 * 設定は端末に置く。
 *
 * 保存された形が古くても、壊れていても、画面が開かなくなってはいけない。
 * 設定を1つ読み違えただけでアプリごと落ちるのがいちばん困る。
 */
describe("設定の保存", () => {
  beforeEach(() => window.localStorage.clear());

  it("何も無ければ既定値を返す", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("保存したものが戻ってくる", () => {
    saveSettings({ ...DEFAULT_SETTINGS, tone: "formal", language: "en" });

    const loaded = loadSettings();
    expect(loaded.tone).toBe("formal");
    expect(loaded.language).toBe("en");
  });

  it("壊れた中身でも落ちず、既定値へ倒す", () => {
    window.localStorage.setItem("aippo:settings", "{ これは JSON ではない");

    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("古い形でも、読める項目だけを拾う", () => {
    // 昔の版に無かった項目が欠けている、という想定
    window.localStorage.setItem(
      "aippo:settings",
      JSON.stringify({ tone: "simple", 消えた項目: true }),
    );

    const loaded = loadSettings();
    expect(loaded.tone).toBe("simple");
    // 欠けている分は既定値で埋まる
    expect(loaded.answerLength).toBe(DEFAULT_SETTINGS.answerLength);
  });

  it("型が違う値は採用しない", () => {
    window.localStorage.setItem(
      "aippo:settings",
      JSON.stringify({ remindStudy: "はい", dailyGoalMinutes: "30" }),
    );

    const loaded = loadSettings();
    expect(loaded.remindStudy).toBe(DEFAULT_SETTINGS.remindStudy);
    expect(loaded.dailyGoalMinutes).toBe(DEFAULT_SETTINGS.dailyGoalMinutes);
  });

  it("初期状態に戻すと既定値へ帰る", () => {
    saveSettings({ ...DEFAULT_SETTINGS, tone: "formal" });
    resetSettings();

    expect(loadSettings().tone).toBe(DEFAULT_SETTINGS.tone);
  });
});

describe("学習データの削除", () => {
  beforeEach(() => window.localStorage.clear());

  it("学習の記録は消し、設定は残す", () => {
    saveSettings({ ...DEFAULT_SETTINGS, tone: "formal" });
    window.localStorage.setItem("aippo:completed", JSON.stringify(["rewrite_text"]));
    window.localStorage.setItem("aippo:draft:rewrite_text", "{}");
    // 他のアプリの鍵には触らない
    window.localStorage.setItem("other-app", "残る");

    const removed = clearLearningData();

    expect(removed).toHaveLength(2);
    expect(window.localStorage.getItem("aippo:completed")).toBeNull();
    expect(window.localStorage.getItem("other-app")).toBe("残る");
    // 設定は別物なので残す
    expect(loadSettings().tone).toBe("formal");
  });

  it("消すものが無くても落ちない", () => {
    expect(clearLearningData()).toEqual([]);
  });
});

describe("学習データの書き出し", () => {
  beforeEach(() => window.localStorage.clear());

  it("端末にあるものだけを、読める形で返す", () => {
    saveSettings({ ...DEFAULT_SETTINGS, language: "en" });
    window.localStorage.setItem("aippo:completed", JSON.stringify(["rewrite_text"]));
    window.localStorage.setItem("other-app", "入れない");

    const parsed = JSON.parse(exportLearningData());

    expect(parsed.settings.language).toBe("en");
    expect(parsed.entries["aippo:completed"]).toEqual(["rewrite_text"]);
    expect(parsed.entries).not.toHaveProperty("other-app");
    expect(typeof parsed.exportedAt).toBe("string");
  });
});
