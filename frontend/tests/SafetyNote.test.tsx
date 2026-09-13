import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SafetyNote } from "../src/components/SafetyNote";
import { SAFETY } from "../src/content/ui";
import { COURSE } from "../src/course/catalog";
import { LessonRunner } from "../src/pages/LessonRunner";

/**
 * 安全上の注意（AIPPO 開発概要 §15）。
 *
 * 定義しただけで画面に出ていないと、要件を満たしたことにならない。
 * 出る場所は「自由に書く場所」と「AIの回答を読む場所」の2つ。
 */

describe("安全上の注意", () => {
  it("文章を書く場所では、入れてはいけないものを伝える", () => {
    render(<SafetyNote placement="input" />);
    expect(screen.getByText(SAFETY.beforeInput)).toBeInTheDocument();
  });

  it("AIの回答を読む場所では、そのまま信じないよう伝える", () => {
    /*
      2文を1つの段落に流している（1件ずつ改行すると、短い文でも
      必ず2行ずつになり 44px 余分に取る）。**文は減らしていない**ので、
      どちらも読めることをここで押さえる。
    */
    render(<SafetyNote placement="output" />);
    const note = screen.getByTestId("safety-output");
    expect(note).toHaveTextContent(SAFETY.checkFacts);
    expect(note).toHaveTextContent(SAFETY.expertAdvice);
  });

  it("AIを使うレッスンには、自分の文章を書く場所がある", () => {
    /*
      注意が届くのは「自分で書く画面」（`real_task`）。そこで
      `StepRenderer` が `SafetyNote placement="input"` を必ず出す。

      **以前はここで `safety_check` の回を数えていた。** あれは
      「自分の文章でも試す？」と降りる道を出す**分岐の画面**で、
      注意文は出していない（その回自身の註にもそう書いてある）。
      Day1 は自分で書く回が必須になり、例文・貼り付け・前の文章が
      同じ画面の中にあるので、降りるための1枚が要らなくなった。

      数えるものを、分岐の有無から**書く場所の有無**へ戻す。
      書く場所が消えれば注意の出どころも消えるので、§15 を守る
      という意味ではこちらが本体。
    */
    for (const lesson of COURSE.lessons.filter((entry) => entry.usesAi)) {
      const kinds = lesson.steps.map((step) => step.type);
      expect(kinds, `${lesson.title} に自分で書く回が無い`).toContain(
        "real_task",
      );
    }
  });

  it("自分で書く画面に、注意がいっしょに出ている", () => {
    /*
      教材データを数えるだけでは、**画面に出ていること**までは
      分からない。Day1 の書く回をそのまま描いて、注意文が同じ画面に
      あることを見る（§15 の「消さない」はここで落ちる）。
    */
    const day1 = COURSE.lessons.find((one) => one.id === "rewrite_text")!;
    const at = day1.steps.findIndex((step) => step.type === "real_task");
    expect(at, "Day1 に自分で書く回が無い").toBeGreaterThanOrEqual(0);

    render(
      <LessonRunner
        lesson={{ ...day1, steps: day1.steps.slice(at) }}
        onExit={() => {}}
        onOpenCourse={() => {}}
      />,
    );

    expect(screen.getByText(SAFETY.beforeInput)).toBeInTheDocument();
  });
});
