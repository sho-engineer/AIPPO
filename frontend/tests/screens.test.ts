import { describe, expect, it } from "vitest";

import { SCREENS, canTransition, nextScreen } from "../src/app/screens";

describe("画面遷移", () => {
  it("6画面（タイトル・ホーム・教材一覧・レッスン・学習履歴・設定）", () => {
    expect(SCREENS).toEqual([
      "TOP",
      "HOME",
      "COURSE",
      "LESSON",
      "RECORD",
      "SETTINGS",
    ]);
  });

  it("学習履歴へは、下タブのどこからでも行ける", () => {
    // 作ったものを取りに来る場所なので、どこからでも1手で開けること
    expect(nextScreen("HOME", "OPEN_RECORD")).toBe("RECORD");
    expect(nextScreen("COURSE", "OPEN_RECORD")).toBe("RECORD");
    expect(nextScreen("SETTINGS", "OPEN_RECORD")).toBe("RECORD");
  });

  it("学習履歴から、同じ教材をやり直せる", () => {
    // 見返して「もう一度」と思ったときに、探し直させない
    expect(nextScreen("RECORD", "SELECT_LESSON")).toBe("LESSON");
  });

  it("学習履歴が行き止まりにならない", () => {
    expect(nextScreen("RECORD", "BACK_TO_HOME")).toBe("HOME");
    expect(nextScreen("RECORD", "OPEN_COURSE")).toBe("COURSE");
  });

  it("タイトル → ホーム → レッスン と進める", () => {
    expect(nextScreen("TOP", "START")).toBe("HOME");
    expect(nextScreen("HOME", "SELECT_LESSON")).toBe("LESSON");
  });

  it("ホームとコース一覧は行き来できる（下タブ）", () => {
    expect(nextScreen("HOME", "OPEN_COURSE")).toBe("COURSE");
    expect(nextScreen("COURSE", "BACK_TO_HOME")).toBe("HOME");
  });

  it("コース一覧からもレッスンへ入れる", () => {
    expect(nextScreen("COURSE", "SELECT_LESSON")).toBe("LESSON");
  });

  it("レッスンを終えたらホームへ戻る（行き止まりにしない）", () => {
    expect(nextScreen("LESSON", "BACK_TO_HOME")).toBe("HOME");
  });

  it("レッスンから一覧へも抜けられる", () => {
    expect(nextScreen("LESSON", "OPEN_COURSE")).toBe("COURSE");
  });

  it("一覧とレッスンからタイトルへ戻れる", () => {
    expect(nextScreen("COURSE", "BACK_TO_TOP")).toBe("TOP");
    expect(nextScreen("LESSON", "BACK_TO_TOP")).toBe("TOP");
  });

  it("タイトルから直接レッスンへは進めない", () => {
    expect(canTransition("TOP", "SELECT_LESSON")).toBe(false);
    expect(nextScreen("TOP", "SELECT_LESSON")).toBe("TOP");
  });

  it("設定はホームと教材一覧から開け、どちらへも抜けられる", () => {
    expect(nextScreen("HOME", "OPEN_SETTINGS")).toBe("SETTINGS");
    expect(nextScreen("COURSE", "OPEN_SETTINGS")).toBe("SETTINGS");
    expect(nextScreen("SETTINGS", "BACK_TO_HOME")).toBe("HOME");
    expect(nextScreen("SETTINGS", "OPEN_COURSE")).toBe("COURSE");
  });

  it("レッスンの途中からは設定へ入れない（1画面1タスクを崩さない）", () => {
    expect(canTransition("LESSON", "OPEN_SETTINGS")).toBe(false);
  });

  it("遷移表に無いイベントは現在の画面を維持する", () => {
    expect(nextScreen("TOP", "BACK_TO_TOP")).toBe("TOP");
    expect(canTransition("LESSON", "START")).toBe(false);
  });
});
