/**
 * ポーを出す場面。
 *
 * 見張るのは3つ。
 *
 *   1. 毎画面には出ないこと（出ない画面のほうが多いこと）
 *   2. 出ると決めた場面には、必ず出ること
 *   3. ステップの種類を増やしたとき、決め忘れが残らないこと
 */

import { describe, expect, it } from "vitest";

import { poAppearance } from "../src/course/poPresence";
import { STEP_TYPES, type StepType } from "../src/course/types";
import { COURSE } from "../src/course/catalog";

const plain = (stepType: StepType) => poAppearance({ stepType });

describe("ポーが出る場面", () => {
  it("はじまり・条件を足す・比べたあと・おわりに出る", () => {
    expect(plain("intro")?.scene).toBe("start");
    expect(plain("outcome_preview")?.scene).toBe("start");
    expect(plain("condition_choice")?.scene).toBe("question");
    expect(plain("observation")?.scene).toBe("compare");
    expect(plain("result_compare")?.scene).toBe("compare");
    expect(plain("completion")?.scene).toBe("celebrate");
  });

  it("入力・選択・解説・結果の画面では出ない", () => {
    /*
      画面の中身そのものが用件を持っているところ。
      横からポーが喋ると、読む場所が2つに増える。
    */
    const quiet: StepType[] = [
      "quick_try",
      "single_choice",
      "multi_choice",
      "text_input",
      "template_builder",
      "prompt_preview",
      "ai_generate",
      "concept_card",
      "result_review",
      "improvement_choice",
      "safety_check",
      "real_task",
      "reflection",
    ];
    for (const stepType of quiet) {
      expect(plain(stepType), `${stepType} ではポーを出さない`).toBeNull();
    }
  });

  it("種類のどれを渡しても、決めてある", () => {
    // 決め忘れが `undefined` として素通りしないこと
    for (const stepType of STEP_TYPES) {
      const found = plain(stepType);
      expect(found === null || typeof found.scene === "string").toBe(true);
    }
  });
});

describe("状態は、画面の種類より強い", () => {
  it("送っている間は、どの画面でも考えている顔", () => {
    expect(poAppearance({ stepType: "text_input", busy: true })).toEqual({
      scene: "thinking",
      speaks: true,
    });
  });

  it("ヒントを出している間は、どの画面でも出る", () => {
    expect(poAppearance({ stepType: "real_task", hinting: true })).toEqual({
      scene: "hint",
      speaks: true,
    });
  });

  it("失敗は、考え中より優先する", () => {
    /*
      失敗したのに「考えています」の顔のままだと、
      まだ待てば終わると読めてしまう。
    */
    const found = poAppearance({
      stepType: "ai_generate",
      busy: true,
      failed: true,
    });
    expect(found?.scene).toBe("warning");
  });

  it("失敗のときは顔だけ出して黙る", () => {
    // 失敗の文は、押すボタンのそばに1度だけ置く
    expect(poAppearance({ stepType: "ai_generate", failed: true })).toEqual({
      scene: "warning",
      speaks: false,
    });
  });
});

describe("レッスン全体で見たとき", () => {
  it("ポーが出る画面のほうが少ない", () => {
    /*
      「毎画面に置かない」を、教材の実データで確かめる。
      1本ぶんの全ステップを通して数える——ここが半分を超えたら、
      場面を足しすぎている。
    */
    for (const lesson of COURSE.lessons) {
      if (lesson.steps.length === 0) continue;
      const shown = lesson.steps.filter(
        (step) => poAppearance({ stepType: step.type }) !== null,
      ).length;
      expect(
        shown * 2,
        `${lesson.id}: ${lesson.steps.length}画面のうち${shown}画面にポーが居る`,
      ).toBeLessThan(lesson.steps.length);
    }
  });

  it("どのレッスンにも、はじまりとおわりのポーは居る", () => {
    for (const lesson of COURSE.lessons) {
      if (lesson.steps.length === 0) continue;
      const scenes = lesson.steps
        .map((step) => poAppearance({ stepType: step.type })?.scene)
        .filter(Boolean);
      expect(scenes, `${lesson.id} のはじまり`).toContain("start");
      expect(scenes, `${lesson.id} のおわり`).toContain("celebrate");
    }
  });
});
