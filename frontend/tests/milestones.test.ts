/**
 * コースのスタンプラリー — 節目の計算。
 *
 * ここで守るのは4つ。
 *
 *   1. 節目は近い順に返す
 *   2. 全部を超えていたら、次の節目は無い（null）
 *   3. **新しく**超えた節目だけを拾う。前から超えていたものは拾わない
 *      （やり直しで二重に祝わない）
 *   4. 型の無いコースにも、既定の節目が付く
 */

import { describe, expect, it } from "vitest";

import {
  milestonesCrossed,
  milestonesFor,
  nextMilestone,
} from "../src/course/milestones";
import { COURSE } from "../src/course/catalog";
import type { Course } from "../src/course/types";

describe("milestonesFor", () => {
  it("first_step_7days には、決まった節目がある", () => {
    const { rewards, completeLabel, badgeTitle } = milestonesFor(COURSE);

    expect(rewards.map((r) => r.atCount)).toEqual([3, 6]);
    expect(completeLabel).toBeTruthy();
    expect(badgeTitle).toBeTruthy();
  });

  it("型の無いコースにも、既定の節目が付く", () => {
    // 手で書いていないコースが増えても、ここで落ちない
    const unknown: Course = {
      ...COURSE,
      id: "no_such_course",
      title: "まだ無いコース",
      lessons: COURSE.lessons.slice(0, 6),
    };

    const { rewards } = milestonesFor(unknown);

    expect(rewards.length).toBeGreaterThan(0);
    // 節目は、始められる本数を超えない
    for (const reward of rewards) {
      expect(reward.atCount).toBeLessThanOrEqual(6);
    }
  });
});

describe("nextMilestone", () => {
  it("いちばん近い、まだ超えていない節目を返す", () => {
    expect(nextMilestone(COURSE, 0)?.atCount).toBe(3);
    expect(nextMilestone(COURSE, 3)?.atCount).toBe(6);
  });

  it("全部を超えていたら、次は無い", () => {
    expect(nextMilestone(COURSE, 9)).toBeNull();
  });
});

describe("milestonesCrossed", () => {
  it("このレッスンで新しく超えた節目だけを返す", () => {
    // 2本目→3本目で、3個の節目をまたいだ
    expect(milestonesCrossed(COURSE, 2, 3).map((r) => r.atCount)).toEqual([3]);
  });

  it("節目をまたがなければ、空", () => {
    expect(milestonesCrossed(COURSE, 3, 4)).toEqual([]);
  });

  it("一気に2つの節目を超えることもある", () => {
    // 教材を作り直して間隔が詰まった場合や、まとめて記録が届いた場合
    expect(milestonesCrossed(COURSE, 1, 7).map((r) => r.atCount)).toEqual([3, 6]);
  });

  it("やり直し（前と同じか、後退した）では、何も超えない", () => {
    /*
      ここが要。「なおす」や再受講で before と after が同じ・逆転すると、
      同じ節目をもう一度「新しく超えた」ことにして、
      二重に Po が反応してしまう。
    */
    expect(milestonesCrossed(COURSE, 3, 3)).toEqual([]);
    expect(milestonesCrossed(COURSE, 5, 3)).toEqual([]);
  });
});
