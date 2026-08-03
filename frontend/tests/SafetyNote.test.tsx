import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FillInForm } from "../src/components/FillInForm";
import { ResultCompare } from "../src/components/ResultCompare";
import { SafetyNote } from "../src/components/SafetyNote";
import { SAFETY } from "../src/content/ui";
import lessonData from "../src/content/lessons/rewrite_text_001.json";

/**
 * 安全上の注意（AIPPO 開発概要 §15）。
 *
 * 3つとも、出る場所が決まっている。
 * 定義しただけで画面に出ていないと、要件を満たしたことにならない。
 */

describe("安全上の注意", () => {
  it("文章を書く場所では、入れてはいけないものを伝える", () => {
    render(<SafetyNote placement="input" />);
    expect(screen.getByText(SAFETY.beforeInput)).toBeInTheDocument();
  });

  it("AIの回答を読む場所では、そのまま信じないよう伝える", () => {
    render(<SafetyNote placement="output" />);
    expect(screen.getByText(SAFETY.checkFacts)).toBeInTheDocument();
    expect(screen.getByText(SAFETY.expertAdvice)).toBeInTheDocument();
  });

  it("最初の入力画面に出ている", () => {
    render(
      <FillInForm
        fields={lessonData.fillInFields}
        values={{}}
        sourceText="たたき台の文章です。"
        onChangeSourceText={() => {}}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("safety-input")).toBeInTheDocument();
  });

  it("結果を見る画面に出ている", () => {
    render(
      <ResultCompare
        originalText="もとの文章"
        runs={[
          {
            sequence: 1,
            fromStep: "FIRST_INPUT",
            label: "はじめの条件",
            inputText: "もとの文章",
            outputText: "書き直した文章",
          },
        ]}
      />,
    );
    expect(screen.getByTestId("safety-output")).toBeInTheDocument();
  });
});

describe("穴埋めの入力欄", () => {
  it("選択肢と同じ文字列を、入力欄の薄い文字にしない", () => {
    // 同じにすると「もう選ばれている」と読めてしまい、
    // そのまま送って「入力してみましょう」と怒られる。
    for (const field of lessonData.fillInFields) {
      expect(
        field.options,
        `${field.label}の薄い文字が選択肢と同じになっている`,
      ).not.toContain(field.placeholder);
    }
  });

  it("選択肢を押すと、自分で書く欄にも反映される", () => {
    const values: Record<string, string> = { audience: "上司" };
    render(
      <FillInForm
        fields={lessonData.fillInFields}
        values={values}
        sourceText="たたき台"
        onChangeSourceText={() => {}}
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("誰向け（自分で書く）")).toHaveValue("上司");
  });
});
