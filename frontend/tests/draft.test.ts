import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearDraft,
  countRealTask,
  listCompleted,
  loadDraft,
  markCompleted,
  readStreak,
  saveDraft,
  touchStreak,
} from "../src/lib/draft";
import { diffSentences, isMostlyUnchanged, splitSentences } from "../src/lib/diff";

beforeEach(() => window.localStorage.clear());

describe("入力の自動保存", () => {
  it("保存して読み戻せる", () => {
    saveDraft({
      lessonId: "rewrite_text",
      stepId: "audience",
      values: { use_case: "仕事のメール" },
    });

    const draft = loadDraft("rewrite_text");
    expect(draft?.stepId).toBe("audience");
    expect(draft?.values.use_case).toBe("仕事のメール");
  });

  it("レッスンごとに分かれている", () => {
    saveDraft({ lessonId: "a", stepId: "s1", values: {} });
    expect(loadDraft("b")).toBeNull();
  });

  it("消せる", () => {
    saveDraft({ lessonId: "a", stepId: "s1", values: {} });
    clearDraft("a");
    expect(loadDraft("a")).toBeNull();
  });

  it("壊れた中身は読み込まない", () => {
    // 読めない下書きで画面を壊さない
    window.localStorage.setItem("aippo:draft:a", "{ぜんぜんJSONじゃない");
    expect(loadDraft("a")).toBeNull();
  });

  it("形が古い下書きは捨てる", () => {
    window.localStorage.setItem(
      "aippo:draft:a",
      JSON.stringify({ version: 0, stepId: "s1", values: {} }),
    );
    expect(loadDraft("a")).toBeNull();
  });

  it("保存できない環境でも落ちない", () => {
    // プライベートモードや容量超過。保存できないだけで操作は続けられる
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceeded");
      });

    expect(() =>
      saveDraft({ lessonId: "a", stepId: "s1", values: {} }),
    ).not.toThrow();
    expect(() => loadDraft("a")).not.toThrow();

    spy.mockRestore();
  });
});

describe("進み具合", () => {
  it("終えたレッスンを覚える。二重に数えない", () => {
    markCompleted("rewrite_text");
    markCompleted("rewrite_text");
    markCompleted("summarize_text");

    expect(listCompleted().sort()).toEqual(["rewrite_text", "summarize_text"]);
  });

  it("同じ日に何度ひらいても日数は増えない", () => {
    const first = touchStreak();
    const second = touchStreak();
    expect(first.days).toBe(1);
    expect(second.days).toBe(1);
  });

  it("自分の課題で試した回数を数える", () => {
    countRealTask();
    countRealTask();
    expect(readStreak().realTaskCount).toBe(2);
  });
});

describe("変わったところ", () => {
  it("文で切る", () => {
    expect(splitSentences("これは一文目。これは二文目。")).toEqual([
      "これは一文目。",
      "これは二文目。",
    ]);
  });

  it("足された文と消えた文が分かる", () => {
    const parts = diffSentences("あああ。いいい。", "あああ。ううう。");

    expect(parts.filter((part) => part.kind === "same")).toHaveLength(1);
    expect(parts.find((part) => part.kind === "removed")?.text).toBe("いいい。");
    expect(parts.find((part) => part.kind === "added")?.text).toBe("ううう。");
  });

  it("同じ文章なら差分が出ない", () => {
    const parts = diffSentences("あああ。", "あああ。");
    expect(parts.every((part) => part.kind === "same")).toBe(true);
    expect(isMostlyUnchanged(parts)).toBe(true);
  });

  it("元が空でも落ちない", () => {
    expect(() => diffSentences("", "書き直した文章。")).not.toThrow();
  });
});
