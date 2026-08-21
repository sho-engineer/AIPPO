/**
 * 「こんな使い方もできます」の中身。
 *
 * ここで守るのは4つ。
 *
 *   1. 指しているレッスンは、すべて実在する
 *      （無いレッスンへの案内は行き止まりになる。憲章 原則 I）
 *   2. 応用例（1件）と組み合わせ（2件以上）を、同じ型で扱える
 *   3. あるレッスンの完了画面には、そのレッスンが絡む例だけが出る
 *   4. 有料の項目は、いまは出さない（無料コースはすべて free）
 */

import { describe, expect, it } from "vitest";

import { APPLIED_TIPS, appliedTipsFor } from "../src/course/appliedTips";
import { getLesson } from "../src/course/catalog";

describe("応用例の中身", () => {
  it("指しているレッスンは、すべて実在する", () => {
    /*
      「音声を文字にする」のような、まだ無い技術を出さない。
      出せば、押しても無いレッスンへの案内という行き止まりになる。
    */
    for (const tip of APPLIED_TIPS) {
      for (const lessonId of tip.requiredLessonIds) {
        expect(getLesson(lessonId), `${tip.id} が指す ${lessonId} が無い`).not.toBeNull();
      }
    }
  });

  it("使う技を1つは持つ", () => {
    for (const tip of APPLIED_TIPS) {
      expect(tip.requiredLessonIds.length).toBeGreaterThan(0);
    }
  });

  it("手順の言葉は、使う技の数と揃っている", () => {
    // flow が足りないと、画面のどの矢印が何を指すか分からなくなる
    for (const tip of APPLIED_TIPS) {
      expect(tip.flow.length).toBe(tip.requiredLessonIds.length);
    }
  });

  it("id が重複していない", () => {
    const ids = APPLIED_TIPS.map((tip) => tip.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("appliedTipsFor", () => {
  it("そのレッスンが絡む例だけを返す", () => {
    const tips = appliedTipsFor("summarize_text");

    expect(tips.length).toBeGreaterThan(0);
    for (const tip of tips) {
      expect(tip.requiredLessonIds).toContain("summarize_text");
    }
  });

  it("関わりの無いレッスンでは、何も返さない", () => {
    expect(appliedTipsFor("no_such_lesson")).toEqual([]);
  });

  it("並び順（order）どおりに出す", () => {
    const tips = appliedTipsFor("rewrite_text");
    const orders = tips.map((tip) => tip.order);

    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("有料の項目は、いまは出さない", () => {
    // 無料コースの応用例はすべて free（憲章）。将来 premium が紛れても、
    // ここで止まる
    const tips = appliedTipsFor("rewrite_text");
    expect(tips.every((tip) => tip.accessLevel === "free")).toBe(true);
  });
});
