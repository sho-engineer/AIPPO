/**
 * 条件のタイル（ChoiceTiles）。
 *
 * `aippo/ChoiceButton.tsx` と同じ不具合が、こちらにも独立に入っていた。
 * チェックの印（IconCheckCircle）を選んだときだけ描画しており、
 * 選ぶたびに隣の文字列の実効幅が縮んで折り返しが動く状態だった。
 *
 * jsdom は版面を持たないので、実際に折り返しが動くかまでは
 * ここでは見られない（そこは `e2e/choiceLayoutShift.spec.ts` が
 * `aippo/ChoiceButton.tsx` のほうを担当している）。
 * ここで確かめるのは、**DOMの形が選択の前後で変わらないこと**
 * ——形が変われば、実際の版面でも占める幅は変わる。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChoiceTiles } from "../src/components/course/steps/Tiles";
import type { LessonStep } from "../src/course/types";

const STEP: LessonStep = {
  id: "add_condition",
  type: "condition_choice",
  title: "条件を選ぶ",
  poMessage: "",
  poEmotion: "neutral",
  options: [
    { value: "audience", label: "誰向けかを伝える" },
    { value: "tone", label: "表現のかたさを指定する" },
  ],
};

describe("ChoiceTiles", () => {
  it("チェックの場所は、選ぶ前から確保されている", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChoiceTiles step={STEP} value="" onChange={onChange} />);

    const button = screen.getByRole("button", { name: /誰向けかを伝える/ });
    const before = button.childElementCount;

    await user.click(button);
    render(<ChoiceTiles step={STEP} value="audience" onChange={onChange} />);
    const selected = screen.getAllByRole("button", { name: /誰向けかを伝える/ })[1];

    expect(selected.childElementCount).toBe(before);
  });

  it("押すと選んだ値が伝わる", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChoiceTiles step={STEP} value="" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /表現のかたさを指定する/ }));

    expect(onChange).toHaveBeenCalledWith("tone");
  });
});
