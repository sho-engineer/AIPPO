import { describe, expect, it } from "vitest";

import {
  initialLessonState,
  lessonReducer,
  type LessonAction,
  type LessonState,
} from "../src/lesson/reducer";
import type { LessonStep } from "../src/lesson/machine";

const state = (overrides: Partial<LessonState> = {}): LessonState => ({
  ...initialLessonState,
  ...overrides,
});

const apply = (s: LessonState, ...actions: LessonAction[]): LessonState =>
  actions.reduce(lessonReducer, s);

describe("許可された遷移", () => {
  const cases: Array<[LessonStep, LessonAction, LessonStep]> = [
    ["INTRO", { type: "START" }, "SELECT_USE_CASE"],
    [
      "SELECT_USE_CASE",
      { type: "SELECT_CASE", useCaseId: "work_email", sampleText: "例文" },
      "FIRST_INPUT",
    ],
    ["FIRST_INPUT", { type: "SUBMIT" }, "GENERATING"],
    ["FIRST_INPUT", { type: "BACK" }, "SELECT_USE_CASE"],
    ["REVIEW_RESULT", { type: "NEXT" }, "IMPROVE_INPUT"],
    ["REVIEW_RESULT", { type: "BACK" }, "FIRST_INPUT"],
    ["IMPROVE_INPUT", { type: "SUBMIT" }, "GENERATING"],
    ["IMPROVE_INPUT", { type: "NEXT" }, "REAL_TASK"],
    ["REAL_TASK", { type: "SUBMIT" }, "GENERATING"],
    ["REAL_TASK", { type: "NEXT" }, "REFLECTION"],
    ["REFLECTION", { type: "COMPLETE" }, "COMPLETE"],
    ["REFLECTION", { type: "BACK" }, "REAL_TASK"],
  ];

  it.each(cases)("%s + %o -> %s", (step, action, expected) => {
    expect(lessonReducer(state({ step }), action).step).toBe(expected);
  });
});

describe("不正な遷移は無視される（FR-002）", () => {
  const cases: Array<[LessonStep, LessonAction]> = [
    ["INTRO", { type: "SUBMIT" }],
    ["INTRO", { type: "COMPLETE" }],
    ["SELECT_USE_CASE", { type: "SUBMIT" }],
    ["FIRST_INPUT", { type: "COMPLETE" }],
    ["REVIEW_RESULT", { type: "SUBMIT" }],
    ["COMPLETE", { type: "START" }],
    ["COMPLETE", { type: "NEXT" }],
  ];

  it.each(cases)("%s は %o で状態を変えない", (step, action) => {
    const before = state({ step });
    expect(lessonReducer(before, action)).toBe(before);
  });
});

describe("GENERATING からの復帰", () => {
  it("SUBMIT した状態を returnTo として覚える", () => {
    const next = lessonReducer(state({ step: "REAL_TASK" }), { type: "SUBMIT" });
    expect(next.step).toBe("GENERATING");
    expect(next.returnTo).toBe("REAL_TASK");
  });

  it("RUN_FAILED は returnTo へ戻し、入力を保持する（FR-004）", () => {
    const before = state({
      step: "FIRST_INPUT",
      fillInValues: { audience: "社外のお客様" },
    });
    const generating = lessonReducer(before, { type: "SUBMIT" });
    const failed = lessonReducer(generating, {
      type: "RUN_FAILED",
      message: "うまく届きませんでした",
    });

    expect(failed.step).toBe("FIRST_INPUT");
    expect(failed.fillInValues).toEqual({ audience: "社外のお客様" });
    expect(failed.isSubmitting).toBe(false);
    expect(failed.error).toBe("うまく届きませんでした");
  });

  it("CANCEL も returnTo へ戻す", () => {
    const generating = lessonReducer(state({ step: "IMPROVE_INPUT" }), {
      type: "SUBMIT",
    });
    const cancelled = lessonReducer(generating, { type: "CANCEL" });

    expect(cancelled.step).toBe("IMPROVE_INPUT");
    expect(cancelled.isSubmitting).toBe(false);
  });

  it("RUN_SUCCEEDED は結果を積んで REVIEW_RESULT へ進む", () => {
    const generating = lessonReducer(state({ step: "FIRST_INPUT" }), {
      type: "SUBMIT",
    });
    const done = lessonReducer(generating, {
      type: "RUN_SUCCEEDED",
      label: "はじめの条件",
      fromStep: "FIRST_INPUT",
      inputText: "もとの文章",
      outputText: "分かりやすくした文章",
    });

    expect(done.step).toBe("REVIEW_RESULT");
    expect(done.runs).toEqual([
      {
        sequence: 1,
        label: "はじめの条件",
        fromStep: "FIRST_INPUT",
        inputText: "もとの文章",
        outputText: "分かりやすくした文章",
      },
    ]);
    expect(done.isSubmitting).toBe(false);
  });

  it("2回目以降の実行結果は sequence を増やして積む（FR-021）", () => {
    let s = apply(
      state({ step: "FIRST_INPUT" }),
      { type: "SUBMIT" },
      {
      type: "RUN_SUCCEEDED",
      label: "はじめの条件",
      fromStep: "FIRST_INPUT",
      inputText: "1回目", outputText: "出力1" },
      { type: "NEXT" },
      { type: "SUBMIT" },
      {
      type: "RUN_SUCCEEDED",
      label: "はじめの条件",
      fromStep: "FIRST_INPUT",
      inputText: "2回目", outputText: "出力2" },
    );

    expect(s.runs.map((r) => r.sequence)).toEqual([1, 2]);
  });
});

describe("二重送信の防止（FR-019）", () => {
  it("送信中の SUBMIT は無視される", () => {
    const generating = lessonReducer(state({ step: "FIRST_INPUT" }), {
      type: "SUBMIT",
    });
    expect(generating.isSubmitting).toBe(true);

    const again = lessonReducer(generating, { type: "SUBMIT" });
    expect(again).toBe(generating);
    expect(again.attemptCount).toBe(1);
  });
});

describe("試行回数", () => {
  it("SUBMIT のたびに増える", () => {
    const s = apply(
      state({ step: "FIRST_INPUT" }),
      { type: "SUBMIT" },
      {
      type: "RUN_SUCCEEDED",
      label: "はじめの条件",
      fromStep: "FIRST_INPUT",
      inputText: "a", outputText: "b" },
      { type: "NEXT" },
      { type: "SUBMIT" },
    );
    expect(s.attemptCount).toBe(2);
  });
});

describe("入力の保持", () => {
  it("SET_FILL_IN は状態を進めずに値だけ更新する", () => {
    const s = apply(
      state({ step: "FIRST_INPUT" }),
      { type: "SET_FILL_IN", key: "audience", value: "社内の同僚" },
      { type: "SET_FILL_IN", key: "length", value: "3行くらい" },
    );

    expect(s.step).toBe("FIRST_INPUT");
    expect(s.fillInValues).toEqual({
      audience: "社内の同僚",
      length: "3行くらい",
    });
  });

  it("BACK で戻っても入力は消えない", () => {
    const s = apply(
      state({ step: "FIRST_INPUT" }),
      { type: "SET_FILL_IN", key: "audience", value: "上司" },
      { type: "BACK" },
    );

    expect(s.step).toBe("SELECT_USE_CASE");
    expect(s.fillInValues.audience).toBe("上司");
  });
});

describe("チューターの発言", () => {
  it("SUBMIT で thinking 表情になる（FR-009）", () => {
    const s = lessonReducer(state({ step: "FIRST_INPUT" }), { type: "SUBMIT" });
    expect(s.tutor.emotion).toBe("thinking");
  });

  it("SET_TUTOR は状態を進めない（憲章 原則 III）", () => {
    const s = lessonReducer(state({ step: "REVIEW_RESULT" }), {
      type: "SET_TUTOR",
      tutor: { message: "良いですね", emotion: "hint", action: "next" },
    });

    expect(s.step).toBe("REVIEW_RESULT");
    expect(s.tutor.message).toBe("良いですね");
  });
});

describe("再開（FR-023）", () => {
  it("RESUME で前回の到達ステップから始められる", () => {
    const s = lessonReducer(initialLessonState, {
      type: "RESUME",
      step: "IMPROVE_INPUT",
    });

    expect(s.step).toBe("IMPROVE_INPUT");
    expect(s.returnTo).toBe("IMPROVE_INPUT");
  });
});
