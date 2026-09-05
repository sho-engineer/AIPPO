/**
 * 選ぶだけの回を、選んだら自動で次へ送る。
 *
 * ここで守るのは「速さ」ではなく、**送ってはいけない回で送らないこと**。
 * とくに、次がAIを呼ぶ回では絶対に自動で進めない。札を1つ触っただけで
 * お金のかかる要求が飛ぶことになり、迷って押し直すたびに課金される。
 */

import { describe, expect, it } from "vitest";

import { canAutoAdvance, isAnswered } from "../src/course/autoAdvance";
import type { Lesson, LessonStep } from "../src/course/types";

function step(overrides: Partial<LessonStep>): LessonStep {
  return {
    id: "s",
    type: "single_choice",
    title: "だれが読みますか",
    poMessage: "",
    poEmotion: "question",
    ...overrides,
  };
}

function lesson(steps: LessonStep[]): Lesson {
  return {
    id: "l",
    number: 1,
    title: "テスト",
    goal: "",
    outcomes: [],
    tags: [],
    usesAi: true,
    steps,
  };
}

describe("自動で進めてよい回", () => {
  it("選ぶだけの回は進める", () => {
    const course = lesson([
      step({ id: "a", type: "single_choice", key: "audience" }),
      step({ id: "b", type: "concept_card" }),
    ]);

    expect(canAutoAdvance(course, course.steps[0])).toBe(true);
  });

  it("どこが変わったかを選ぶ回も進める", () => {
    const course = lesson([
      step({ id: "a", type: "observation", key: "noticed" }),
      step({ id: "b", type: "concept_card" }),
    ]);

    expect(canAutoAdvance(course, course.steps[0])).toBe(true);
  });
});

describe("自動で進めてはいけない回", () => {
  it("次がAIを呼ぶ回なら、進めない", () => {
    /*
      いちばん大事な1本。ここが通ると、札を触るたびに課金が起きる。
      選ぶことと送ることは、分けたままにする。
    */
    const course = lesson([
      step({ id: "a", type: "single_choice", key: "audience" }),
      step({ id: "b", type: "ai_generate" }),
    ]);

    expect(canAutoAdvance(course, course.steps[0])).toBe(false);
  });

  it("自分で文章を書く回は、進めない", () => {
    // 書いている途中で画面が変わるのは事故
    const course = lesson([
      step({ id: "a", type: "real_task", key: "real_task_text" }),
      step({ id: "b", type: "concept_card" }),
    ]);

    expect(canAutoAdvance(course, course.steps[0])).toBe(false);
  });

  it("AIの結果を見る回は、進めない", () => {
    // 読む時間は人によって違う。読み終わる前に送らない
    const course = lesson([
      step({ id: "a", type: "result_compare" }),
      step({ id: "b", type: "concept_card" }),
    ]);

    expect(canAutoAdvance(course, course.steps[0])).toBe(false);
  });

  it("「その他（自分で書く）」がある回は、進めない", () => {
    // 自由入力の途中で送られると、書きかけが飛ぶ
    const course = lesson([
      step({
        id: "a",
        type: "single_choice",
        key: "audience",
        options: [
          { value: "boss", label: "上司" },
          { value: "", label: "そのほか", free: true },
        ],
      }),
      step({ id: "b", type: "concept_card" }),
    ]);

    expect(canAutoAdvance(course, course.steps[0])).toBe(false);
  });

  it("最後の回では進めない", () => {
    // 行き先が無い。存在しない次へ送らない
    const course = lesson([step({ id: "a", type: "single_choice", key: "audience" })]);

    expect(canAutoAdvance(course, course.steps[0])).toBe(false);
  });

  it("AI活用診断では、どの回も進めない", () => {
    /*
      診断はほかの回と性格が違う。レッスンの選択肢は「次に何をするか」を
      その場で決めるもので、選び直せば戻ってやり直せる。診断は
      **5問ぶんの答えがそのまま結果になる**ので、選んだ札を見て
      「これでよい」と確かめる時間が要る。

      形の上では進めてよい回（選ぶだけ・自由入力なし・次はAIでない）
      でも、診断なら止める。
    */
    const course = {
      ...lesson([
        step({ id: "a", type: "single_choice", key: "ai_usage" }),
        step({ id: "b", type: "single_choice", key: "ask_style" }),
      ]),
      id: "diagnosis",
    };

    expect(canAutoAdvance(course, course.steps[0])).toBe(false);
  });
});

describe("送ってよい状態か", () => {
  it("答えが入っていれば送る", () => {
    expect(isAnswered(step({ key: "audience" }), { audience: "上司" })).toBe(true);
  });

  it("空のままでは送らない", () => {
    // 空で送ると、次の回で戻って選び直すことになり、かえって遅くなる
    expect(isAnswered(step({ key: "audience" }), {})).toBe(false);
    expect(isAnswered(step({ key: "audience" }), { audience: "  " })).toBe(false);
  });

  it("保存先の無い回は送らない", () => {
    expect(isAnswered(step({ key: undefined }), { audience: "上司" })).toBe(false);
  });

  it("枠を埋める回は、全部埋まって初めて答えたことにする", () => {
    /*
      1つでも空のまま送れると、採点する側は「選ばなかった」のか
      「まだ途中」なのかを区別できない。診断のミニ問題は、埋まって
      いない枠があると軸の点が出せない。
    */
    const built = step({
      type: "assemble",
      key: "build_prompt",
      parts: [
        { key: "task", label: "何をしてほしい", options: [] },
        { key: "audience", label: "誰向け", options: [] },
        { key: "tone", label: "言い方", options: [] },
      ],
    });

    expect(isAnswered(built, { build_prompt: "要約して|新人向け|やさしく" })).toBe(true);
    expect(isAnswered(built, { build_prompt: "要約して|新人向け" })).toBe(false);
    expect(isAnswered(built, { build_prompt: "要約して||やさしく" })).toBe(false);
  });
});
