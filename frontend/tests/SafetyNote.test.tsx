import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SafetyNote } from "../src/components/SafetyNote";
import { SAFETY } from "../src/content/ui";
import { COURSE } from "../src/course/catalog";

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

  it("AIを使うレッスンには、自分の課題の前に確認のステップがある", () => {
    // サンプルだけで終わらせず、自分の文章を入れる直前に必ず1枚挟む
    for (const lesson of COURSE.lessons.filter((entry) => entry.usesAi)) {
      const kinds = lesson.steps.map((step) => step.type);
      expect(kinds, `${lesson.title} に確認のステップが無い`).toContain(
        "safety_check",
      );
      expect(kinds.indexOf("safety_check")).toBeLessThan(
        kinds.indexOf("real_task"),
      );
    }
  });
});
