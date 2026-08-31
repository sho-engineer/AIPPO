/**
 * 外部サービスへ出る前に控えた「いた場所」。
 *
 * 見張るのは4つ。
 *
 *   1. 控えた場所が、そのまま戻ってくること
 *   2. **一度読んだら消えること**（次に開いたときに飛ばされない）
 *   3. 古すぎる控えを使わないこと
 *   4. 壊れた控えで落ちないこと
 *
 * 3つ目が要るのは、これが「戻る」ためのものだから。何日も前のものが
 * 残っていると、久しぶりに開いた人がいつかの途中へ飛ばされる。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { forgetReturn, rememberReturn, takeReturn } from "../src/auth/returnTo";

const KEY = "aippo:auth-return";
const PLACE = { screen: "LESSON" as const, lessonId: "rewrite_text", courseId: "c1" };

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
  /*
    答えの覚え書きを作り直す。`takeReturn` は「1回の読み込みにつき
    1つの答え」を返すので、そこを消さないと前の it の答えが残る。
  */
  forgetReturn();
});

describe("いた場所の控え", () => {
  it("控えた場所が、そのまま戻る", () => {
    rememberReturn(PLACE);

    expect(takeReturn()).toEqual(PLACE);
  });

  it("読んだら、端末からは消える", () => {
    /*
      残しておくと、次にアプリを開いたときにも同じ場所へ飛ばされる。
      「戻る」ためのものであって、「いつもの場所」ではない。
    */
    rememberReturn(PLACE);
    takeReturn();

    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("同じ読み込みの中では、何度呼んでも同じ答え", () => {
    /*
      読むことが消すことでもあるので、2回目が空になる作りだった。
      React は開発時に `useState` の初期化を2回走らせるので、
      1回目が消して2回目が「控えは無い」と判断し、**押した人が
      違う画面へ着いた**。実際に E2E で捕まえた。
    */
    rememberReturn(PLACE);

    expect(takeReturn()).toEqual(PLACE);
    expect(takeReturn()).toEqual(PLACE);
    expect(takeReturn()).toEqual(PLACE);
  });

  it("押し直したら、新しい控えを返す", () => {
    // 覚えたぶんを作り直さないと、前の答えのまま返る
    rememberReturn(PLACE);
    takeReturn();

    const other = { screen: "SETTINGS" as const, lessonId: "summarize_text" };
    rememberReturn(other);

    expect(takeReturn()).toEqual(other);
  });

  it("古すぎる控えは使わない", () => {
    // 何日も前のものが残っていると、いつかの途中へ飛ばされる
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ place: PLACE, at: Date.now() - 31 * 60 * 1000 }),
    );

    expect(takeReturn()).toBeNull();
  });

  it("30分以内なら使う", () => {
    // 同意画面で迷ったり、メールを見に行ったりするぶんは足りる
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ place: PLACE, at: Date.now() - 29 * 60 * 1000 }),
    );

    expect(takeReturn()).toEqual(PLACE);
  });

  it("壊れた控えでも落ちない", () => {
    for (const junk of ["", "{", "null", '{"place":{}}', '{"at":1}']) {
      window.localStorage.setItem(KEY, junk);
      expect(() => takeReturn()).not.toThrow();
      expect(takeReturn()).toBeNull();
    }
  });

  it("やめたときは捨てられる", () => {
    rememberReturn(PLACE);
    forgetReturn();

    expect(takeReturn()).toBeNull();
  });

  it("控えは端末の中だけに置く（URLへ載せない）", () => {
    /*
      サーバーへ渡して `?next=` で返す作りにすると、「外部のURLへ
      飛ばされないか」を検証する責任が生まれる。端末の中に置けば、
      外部のURLになりようがない。
    */
    rememberReturn(PLACE);

    expect(window.localStorage.getItem(KEY)).toContain("rewrite_text");
    expect(window.location.search).toBe("");
  });
});
