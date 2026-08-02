import { describe, expect, it } from "vitest";

import {
  LESSON_STEPS,
  PRIMARY_ACTION,
  canTransition,
  nextStep,
} from "../src/lesson/machine";

describe("状態機械", () => {
  it("9つの状態を持つ（FR-001）", () => {
    expect(LESSON_STEPS).toHaveLength(9);
  });

  it("すべての状態に「次の行動」が1つ定義されている（憲章 原則 I / FR-003）", () => {
    for (const step of LESSON_STEPS) {
      expect(PRIMARY_ACTION[step]).toBeTruthy();
    }
  });

  it("遷移表に無いイベントは拒否される", () => {
    expect(canTransition("INTRO", "SUBMIT")).toBe(false);
    expect(canTransition("COMPLETE", "NEXT")).toBe(false);
  });

  it("拒否された遷移では現在の状態を維持する（FR-002）", () => {
    expect(nextStep("INTRO", "SUBMIT", "FIRST_INPUT")).toBe("INTRO");
  });

  it("GENERATING の RUN_FAILED は returnTo へ戻る", () => {
    expect(nextStep("GENERATING", "RUN_FAILED", "REAL_TASK")).toBe("REAL_TASK");
    expect(nextStep("GENERATING", "CANCEL", "IMPROVE_INPUT")).toBe(
      "IMPROVE_INPUT",
    );
  });

  it("COMPLETE は終端で、どのイベントでも進まない", () => {
    for (const event of ["START", "SUBMIT", "NEXT", "BACK", "COMPLETE"] as const) {
      expect(nextStep("COMPLETE", event, "FIRST_INPUT")).toBe("COMPLETE");
    }
  });
});
