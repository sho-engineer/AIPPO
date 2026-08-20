/**
 * あとで見返すものの控え。
 *
 * 復習の回そのものは、まだ作っていない。ここで確かめるのは、
 * 作るときに要る材料を**取りこぼさずに貯められるか**。
 * 記録は起きた時点でしか取れないので、あとから足せない。
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  forgetForReview,
  loadReviewItems,
  rememberForReview,
  reviewItemsFor,
} from "../src/course/review";

beforeEach(() => window.localStorage.clear());

describe("控える", () => {
  it("飛ばした回を覚える", () => {
    rememberForReview({
      lessonId: "rewrite_text",
      stepId: "concept_1",
      reason: "concept_skipped",
    });

    const items = loadReviewItems();
    expect(items).toHaveLength(1);
    expect(items[0].reason).toBe("concept_skipped");
    expect(items[0].at).toBeTruthy();
  });

  it("同じ回を何度飛ばしても1件にする", () => {
    /*
      3回飛ばしたことより、「そこを飛ばした」事実のほうが復習には要る。
      回数で貯めると、同じものが並んだ復習になる。
    */
    for (let i = 0; i < 3; i += 1) {
      rememberForReview({
        lessonId: "rewrite_text",
        stepId: "concept_1",
        reason: "concept_skipped",
      });
    }

    expect(loadReviewItems()).toHaveLength(1);
  });

  it("別の回は別に覚える", () => {
    rememberForReview({ lessonId: "a", stepId: "s1", reason: "concept_skipped" });
    rememberForReview({ lessonId: "a", stepId: "s2", reason: "real_task_skipped" });

    expect(loadReviewItems()).toHaveLength(2);
  });

  it("貯め続けない", () => {
    // 上限を超えると「積み残しの山」になって、誰も見返さなくなる
    for (let i = 0; i < 60; i += 1) {
      rememberForReview({ lessonId: "a", stepId: `s${i}`, reason: "concept_skipped" });
    }

    const items = loadReviewItems();
    expect(items.length).toBeLessThanOrEqual(50);
    // 残るのは新しいほう
    expect(items[items.length - 1].stepId).toBe("s59");
  });
});

describe("取り出す", () => {
  it("レッスンごとに引ける", () => {
    rememberForReview({ lessonId: "a", stepId: "s1", reason: "concept_skipped" });
    rememberForReview({ lessonId: "b", stepId: "s1", reason: "concept_skipped" });

    expect(reviewItemsFor("a")).toHaveLength(1);
    expect(reviewItemsFor("a")[0].lessonId).toBe("a");
  });

  it("見返し終えたら外れる", () => {
    // 外さないと、一度見返したものが「見返すもの」に残り続ける
    rememberForReview({ lessonId: "a", stepId: "s1", reason: "concept_skipped" });
    forgetForReview("a", "s1");

    expect(loadReviewItems()).toHaveLength(0);
  });
});

describe("壊れた控え", () => {
  it("読めない中身でも落ちない", () => {
    window.localStorage.setItem("aippo:review", "{壊れている");

    expect(loadReviewItems()).toEqual([]);
  });

  it("形の合わない行だけ捨てる", () => {
    // 1件壊れても、残りは使える
    window.localStorage.setItem(
      "aippo:review",
      JSON.stringify([
        { lessonId: "a", stepId: "s1", reason: "concept_skipped", at: "2026-01-01" },
        { これは: "ちがう形" },
      ]),
    );

    expect(loadReviewItems()).toHaveLength(1);
  });
});

describe("学習データの削除で消えること", () => {
  it("鍵が aippo: で始まる", () => {
    /*
      設定の「学習データを削除する」は、aippo: で始まる鍵をまとめて消す。
      別の名前を付けると、消したつもりのものが端末に残る。
    */
    rememberForReview({ lessonId: "a", stepId: "s1", reason: "concept_skipped" });

    const keys = Object.keys(window.localStorage);
    expect(keys).toContain("aippo:review");
  });
});
