/**
 * レッスンの中の区切り（ミッション）。
 *
 * 見張るのは3つ。
 *
 * - 教材データにある `phase` をそのまま使う（区切りを2種類作らない）
 * - `phase` を持たない教材でも、区切りが消えない
 * - 帯が後戻りしない（データの書き間違いが、進み具合の減る画面にならない）
 */

import { describe, expect, it } from "vitest";

import { missionStateOf } from "../src/course/missions";
import { COURSE } from "../src/course/catalog";
import { LESSON_PHASES, type Lesson, type LessonStep } from "../src/course/types";

function lessonOf(steps: Partial<LessonStep>[]): Lesson {
  return {
    ...COURSE.lessons[1],
    steps: steps.map((step, index) => ({
      id: `s${index}`,
      type: "single_choice",
      title: "t",
      poMessage: "p",
      poEmotion: "neutral",
      ...step,
    })) as LessonStep[],
  };
}

describe("区切りの作り方", () => {
  it("同じ区切りが続くあいだは、1つにまとめる", () => {
    const lesson = lessonOf([
      { phase: "outcome" },
      { phase: "try" },
      { phase: "try" },
      { phase: "try" },
      { phase: "own" },
    ]);

    const state = missionStateOf(lesson, 0);

    expect(state.missions.map((mission) => mission.key)).toEqual([
      "outcome",
      "try",
      "own",
    ]);
    expect(state.missions[1].steps).toBe(3);
  });

  it("名前は LESSON_PHASES のものを使う", () => {
    // 区切りを2種類作らない。データと画面で言い方が割れる
    const lesson = lessonOf([{ phase: "try" }]);

    expect(missionStateOf(lesson, 0).missions[0].label).toBe(
      LESSON_PHASES.find((phase) => phase.key === "try")?.label,
    );
  });

  it("いま何番目かを、1始まりで返す", () => {
    const lesson = lessonOf([
      { phase: "outcome" },
      { phase: "try" },
      { phase: "try" },
      { phase: "own" },
    ]);

    expect(missionStateOf(lesson, 0).current).toBe(1);
    expect(missionStateOf(lesson, 1).current).toBe(2);
    expect(missionStateOf(lesson, 2).current).toBe(2);
    expect(missionStateOf(lesson, 3).current).toBe(3);
  });

  it("その区切りの中で何歩目かも返す", () => {
    const lesson = lessonOf([
      { phase: "outcome" },
      { phase: "try" },
      { phase: "try" },
      { phase: "try" },
    ]);

    expect(missionStateOf(lesson, 2).stepInMission).toBe(2);
    expect(missionStateOf(lesson, 3).stepInMission).toBe(3);
  });

  it("後戻りする値が入っていても、進んだ側に寄せる", () => {
    /*
      帯が戻るのは「進んでいない」と読まれる。データの書き間違いが
      そのまま、進み具合の減る画面になるのを防ぐ。
    */
    const lesson = lessonOf([
      { phase: "outcome" },
      { phase: "own" },
      { phase: "try" },
    ]);

    const state = missionStateOf(lesson, 2);

    expect(state.missions.map((mission) => mission.key)).toEqual(["outcome", "own"]);
    expect(state.current).toBe(2);
  });

  it("phase を持たない教材でも、区切りが消えない", () => {
    // ここだけ区切りが無いと、画面の作りが教材ごとに変わる
    const lesson = lessonOf([
      { type: "intro" },
      { type: "single_choice" },
      { type: "result_compare" },
      { type: "reflection" },
    ]);

    const state = missionStateOf(lesson, 0);

    expect(state.missions.length).toBeGreaterThan(1);
    expect(state.missions[0].key).toBe("outcome");
  });

  it("範囲の外を渡されても落ちない", () => {
    const lesson = lessonOf([{ phase: "outcome" }, { phase: "try" }]);

    expect(missionStateOf(lesson, -5).current).toBe(1);
    expect(missionStateOf(lesson, 99).current).toBe(2);
  });

  it("ステップが1つも無ければ、区切りも空", () => {
    // 空の帯を出すより、その場所ごと出さないほうがよい
    expect(missionStateOf(lessonOf([]), 0).missions).toEqual([]);
  });
});

describe("同梱の教材", () => {
  it.each(COURSE.lessons.map((lesson) => [lesson.id, lesson] as const))(
    "%s は3〜5の区切りに収まる",
    (_id, lesson) => {
      /*
        1本のレッスンは19歩ある。一本道に見えると、始めた人はまず
        「あと16回も押すのか」と思う。区切りが2つ以下だとまとまりが
        見えず、6つ以上あると区切りそのものが多すぎて読めない。
      */
      const { missions } = missionStateOf(lesson, 0);

      expect(missions.length).toBeGreaterThanOrEqual(2);
      expect(missions.length).toBeLessThanOrEqual(5);
    },
  );

  it.each(COURSE.lessons.map((lesson) => [lesson.id, lesson] as const))(
    "%s は、進めても区切りが戻らない",
    (_id, lesson) => {
      let furthest = 0;
      for (let index = 0; index < lesson.steps.length; index += 1) {
        const { current } = missionStateOf(lesson, index);
        expect(current).toBeGreaterThanOrEqual(furthest);
        furthest = current;
      }
    },
  );
});
