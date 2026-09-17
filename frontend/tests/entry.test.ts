/**
 * 開いたとき、どの画面から始めるか。
 *
 * 守りたいのは2つ。**下のほうが重い。**
 *
 *   1. はじめての人が、ようこそと案内を1度ずつ通る
 *   2. **もう使っている人が、どちらも通らない**
 *
 * 2つ目のほうが重い。入口は出しそこねてもホームの中から辿れるが、
 * 続きがある人をようこそへ流すと、押せるのは「ゲストではじめる」だけで、
 * その先は自分の記録が消えたように見える。
 */

import { describe, expect, it } from "vitest";

import { decideEntry, type EntryFacts } from "../src/app/entry";

/** はじめて来た、未ログインの人。ここから1つずつ崩す。 */
const NEWCOMER: EntryFacts = {
  authLoading: false,
  signedIn: false,
  serverHistory: null,
  guestStarted: false,
  guideSeen: false,
  deviceHistory: false,
  saved: null,
};

const at = (facts: Partial<EntryFacts>) =>
  decideEntry({ ...NEWCOMER, ...facts });

describe("揃うまで決めない", () => {
  it("ログインの確認が終わるまでは、何も出さない", () => {
    /*
      ここで仮にどちらかを出すと、決まった瞬間に入れ替わる
      ——一瞬だけ知らない画面が見える。
    */
    expect(at({ authLoading: true })).toEqual({ kind: "pending" });
  });

  it("登録した人は、学習量が届くまで決めない", () => {
    /*
      届く前の `null` を 0 と読むと、**もう学んでいる人に診断の案内が
      出る**。0 は「登録したが、まだ何もしていない」で、行き先が違う。
    */
    expect(at({ signedIn: true, serverHistory: null })).toEqual({
      kind: "pending",
    });
  });
});

describe("はじめての人", () => {
  it("未ログインで跡が無ければ、ようこそ", () => {
    expect(at({})).toEqual({ kind: "screen", screen: "WELCOME" });
  });

  it("ゲストで始めた直後は、ホームを経由せず案内へ", () => {
    expect(at({ guestStarted: true })).toEqual({
      kind: "screen",
      screen: "DIAGNOSIS_INTRO",
    });
  });

  it("登録した直後も、ホームを経由せず案内へ", () => {
    expect(at({ signedIn: true, serverHistory: 0 })).toEqual({
      kind: "screen",
      screen: "DIAGNOSIS_INTRO",
    });
  });
});

describe("もう使っている人", () => {
  it("ゲストで始めていて、案内も見ていれば、ホーム", () => {
    /*
      毎回ゲストを選び直させない。**押したことを覚えている**
      （`lib/draft.ts` の `hasGuestStarted`）。
    */
    expect(at({ guestStarted: true, guideSeen: true })).toEqual({
      kind: "screen",
      screen: "HOME",
    });
  });

  it("案内を見ていなくても、学んだ跡があれば案内を出さない", () => {
    expect(at({ guestStarted: true, deviceHistory: true })).toEqual({
      kind: "screen",
      screen: "HOME",
    });
  });

  it("ログインしていて履歴があれば、覚えていた場所へ戻る", () => {
    expect(
      at({ signedIn: true, serverHistory: 2, saved: "COURSE_DETAIL" }),
    ).toEqual({ kind: "screen", screen: "COURSE_DETAIL" });
  });

  it("ログインしていて案内済みなら、履歴が無くてもホームへ", () => {
    expect(at({ signedIn: true, serverHistory: 0, guideSeen: true })).toEqual({
      kind: "screen",
      screen: "HOME",
    });
  });

  it("ゲストの印より前から使っている人を、ようこそへ流さない", () => {
    /*
      **いちばん避けたい出方。** ゲストの印はこの機能と一緒に入った
      ものなので、それ以前から居る人は持っていない。持っていないことを
      「はじめて」と読むと、続きがある全員がようこそへ戻される。
    */
    expect(at({ deviceHistory: true, saved: "COURSE" })).toEqual({
      kind: "screen",
      screen: "COURSE",
    });
    expect(at({ guideSeen: true })).toEqual({ kind: "screen", screen: "HOME" });
    expect(at({ saved: "HOME" })).toEqual({ kind: "screen", screen: "HOME" });
  });
});

describe("覚えていた場所の扱い", () => {
  it("入口の2枚は、覚えていた場所として使わない", () => {
    /*
      1度だけ通るところ。そこへ戻すと、毎回同じ入口をくぐり直す。
    */
    for (const screen of ["WELCOME", "DIAGNOSIS_INTRO"] as const) {
      expect(at({ guestStarted: true, guideSeen: true, saved: screen })).toEqual({
        kind: "screen",
        screen: "HOME",
      });
    }
  });

  it("覚えていた場所が無ければホーム", () => {
    expect(at({ guestStarted: true, guideSeen: true, saved: null })).toEqual({
      kind: "screen",
      screen: "HOME",
    });
  });

  it("レッスンの途中なら、そこへ戻す", () => {
    expect(at({ guestStarted: true, guideSeen: true, saved: "LESSON" })).toEqual({
      kind: "screen",
      screen: "LESSON",
    });
  });
});
