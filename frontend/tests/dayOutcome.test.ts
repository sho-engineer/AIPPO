/**
 * Day を終えた画面の1行が、日本語になっていること。
 *
 * 文字をつないで作っている（`course/dayOutcome.ts`）ので、
 * **教材データの書き方が変わると壊れる**。壊れても画面は動くし、
 * 検査も落ちない——「読む相手を伝えましたようになりました」と
 * 出るだけで、気づくのは誰かが1本終えた日になる。
 *
 * つなぐ側ではなく、**つなげる形で書けているか**を全教材で見る。
 */

import { describe, expect, it } from "vitest";

import { BECAME, dayOutcomeLine, joinable } from "../src/course/dayOutcome";
import { COURSE, MOVED_OUT_LESSONS } from "../src/course/catalog";
import type { Lesson } from "../src/course/types";

/*
  同梱データにある教材ぜんぶ。コース本体と、あとから別コースへ
  移した分。サーバーから届く教材はここには無いが、書き方の決まりを
  置いているのは同じ `catalog.ts` なので、ここが揃っていれば足りる。
*/
const lessons: Lesson[] = [...COURSE.lessons, ...MOVED_OUT_LESSONS];

describe("つないだ1行", () => {
  it("教材が1本以上ある（この検査が空回りしていない）", () => {
    expect(lessons.length).toBeGreaterThan(5);
  });

  it("どの教材でも、到達点の1本目が言い切りの形で書いてある", () => {
    /*
      「〜られる」「〜できる」「〜分かる」。
      「〜しました」「〜が大事」と書くと、つないだ先が日本語に
      ならないのでここで落ちる。
    */
    for (const lesson of lessons) {
      const first = lesson.outcomes[0];
      if (!first) continue;
      expect(
        joinable(first),
        `${lesson.id}: 「${first}${BECAME}」は日本語にならない`,
      ).toBe(true);
    }
  });

  it("できるようになったこと、として読める", () => {
    for (const lesson of lessons) {
      const line = dayOutcomeLine(lesson);
      expect(line.length, `${lesson.id}: 空`).toBeGreaterThan(0);
      // 長い説明文にしない（DO NOT）。1〜2行に収まる長さ
      expect(line.length, `${lesson.id}: ${line.length}文字は長い`).toBeLessThan(40);
    }
  });

  it("Day1 は「むずかしい文章を…できるようになりました」", () => {
    const day1 = lessons.find((lesson) => lesson.id === "rewrite_text");
    expect(dayOutcomeLine(day1!)).toBe(
      "むずかしい文章を、意味を変えずに分かりやすくできるようになりました",
    );
  });
});

describe("つなげない書き方が来たとき", () => {
  it("そのまま出す（壊れた日本語を作らない）", () => {
    /*
      検査は書き方を縛るが、**画面は落とさない**。
      いつか「〜が大事」と書かれた教材が入っても、
      変な語尾を足すより、そのまま出すほうがまだ読める。
    */
    const odd = { outcomes: ["まとめ方が大事"], learnedSkills: [] } as unknown as Lesson;
    expect(dayOutcomeLine(odd)).toBe("まとめ方が大事");
  });

  it("到達点が無ければ、技の名前へ倒す", () => {
    const none = { outcomes: [], learnedSkills: ["ターゲット指定"] } as unknown as Lesson;
    expect(dayOutcomeLine(none)).toBe("ターゲット指定");
  });
});
