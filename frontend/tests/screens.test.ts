import { describe, expect, it } from "vitest";

import { SCREENS, canTransition, nextScreen } from "../src/app/screens";

describe("画面遷移", () => {
  it("MVP は3画面（トップ・診断・レッスン）", () => {
    expect(SCREENS).toEqual(["TOP", "DIAGNOSIS", "LESSON"]);
  });

  it("トップ → 診断 → レッスン と進める", () => {
    expect(nextScreen("TOP", "START")).toBe("DIAGNOSIS");
    expect(nextScreen("DIAGNOSIS", "SELECT_LESSON")).toBe("LESSON");
  });

  it("診断とレッスンからトップへ戻れる", () => {
    expect(nextScreen("DIAGNOSIS", "BACK_TO_TOP")).toBe("TOP");
    expect(nextScreen("LESSON", "BACK_TO_TOP")).toBe("TOP");
  });

  it("診断を飛ばしてレッスンへは進めない", () => {
    expect(canTransition("TOP", "SELECT_LESSON")).toBe(false);
    expect(nextScreen("TOP", "SELECT_LESSON")).toBe("TOP");
  });

  it("トップから戻ろうとしても状態は変わらない", () => {
    expect(nextScreen("TOP", "BACK_TO_TOP")).toBe("TOP");
  });

  it("レッスンから診断へは直接戻らない", () => {
    expect(canTransition("LESSON", "START")).toBe(false);
  });
});
