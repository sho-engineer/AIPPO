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

describe("続きから始める", () => {
  it("AIが返したものも覚えている", () => {
    /*
      前は覚えていなかった。ステップだけ戻すので、開き直した人は
      「3つを比べる」の画面に着くのに**比べる中身が空**だった。
      進み具合だけ残って、作ったものが消えている状態になる。
    */
    saveDraft({
      lessonId: "rewrite_text",
      stepId: "compare_results",
      values: { audience: "上司" },
      runs: [
        {
          sequence: 1,
          stepId: "generate_first",
          label: "1回目",
          inputText: "元の文章",
          outputText: "書き直した文章",
        },
      ],
    });

    const draft = loadDraft("rewrite_text");
    expect(draft?.runs).toHaveLength(1);
    expect(draft?.runs?.[0].outputText).toBe("書き直した文章");
  });

  it("**古い形の下書きを捨てない**", () => {
    /*
      版を上げたときに、いま途中まで進めている人の続きが
      まるごと消えてはいけない。中身が読めるなら読む。

      版1 は `runs` を持っていないので、そこだけ空にして残りは使う。
      ここが壊れると「Lessonを毎回最初からやり直させる」になる。
    */
    window.localStorage.setItem(
      "aippo:draft:rewrite_text",
      JSON.stringify({
        version: 1,
        lessonId: "rewrite_text",
        stepId: "add_condition",
        values: { audience: "顧客" },
        updatedAt: Date.now(),
      }),
    );

    const draft = loadDraft("rewrite_text");
    expect(draft?.stepId).toBe("add_condition");
    expect(draft?.values.audience).toBe("顧客");
    expect(draft?.runs).toEqual([]);
  });

  it("知らない版は捨てる", () => {
    // 未来の形は読めない。読めたふりをすると壊れ方が読めなくなる
    window.localStorage.setItem(
      "aippo:draft:rewrite_text",
      JSON.stringify({
        version: 99,
        lessonId: "rewrite_text",
        stepId: "add_condition",
        values: {},
        updatedAt: Date.now(),
      }),
    );

    expect(loadDraft("rewrite_text")).toBeNull();
  });

  it("終えたら消える（端末に溜め続けない）", () => {
    // 共用の端末で、前の人の文章が残らないようにする
    saveDraft({
      lessonId: "rewrite_text",
      stepId: "completion",
      values: { real_task_text: "会社のお知らせ文" },
      runs: [
        {
          sequence: 1,
          stepId: "generate_real",
          label: "自分の文章",
          inputText: "会社のお知らせ文",
          outputText: "書き直したお知らせ",
        },
      ],
    });
    clearDraft("rewrite_text");

    expect(window.localStorage.getItem("aippo:draft:rewrite_text")).toBeNull();
  });
});
