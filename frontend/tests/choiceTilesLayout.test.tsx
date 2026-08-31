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

import { render, screen, within } from "@testing-library/react";
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

  it("2列の格子ではなく、折り返す札で並べる", async () => {
    /*
      前は 3.5rem の高さを揃えた2列のカードで、1枚ずつに淡色の器つきの
      絵を載せ、白い面に影を落としていた。**選択肢が、今日の1本と同じ
      重さの部品として並ぶ**ことになる。ここで人がすることは
      「読んで、1つ押す」だけ。
    */
    render(<ChoiceTiles step={STEP} value="" onChange={vi.fn()} />);

    const list = screen.getByTestId("choice-tiles");
    expect(list.className).not.toContain("grid-cols-2");
    expect(list.className).toContain("flex-wrap");
  });

  it("押した札だけが跳ねる", async () => {
    /*
      押した「手ごたえ」を返すためだけの動き。
      **選ばれている札**ではなく**押した札**に付ける——復元して
      戻ってきたときに選択済みの札がひとりでに跳ねると、
      触ってもいないのに何かが起きたように見える。
    */
    const user = userEvent.setup();
    render(<ChoiceTiles step={STEP} value="" onChange={vi.fn()} />);

    const target = screen.getByRole("button", { name: /誰向けかを伝える/ });
    const other = screen.getByRole("button", { name: /表現のかたさを指定する/ });
    expect(target.className).not.toContain("animate-choice-pop");

    await user.click(target);

    expect(target.className).toContain("animate-choice-pop");
    expect(other.className).not.toContain("animate-choice-pop");
  });

  it("選択済みで開き直しても、勝手には跳ねない", async () => {
    render(<ChoiceTiles step={STEP} value="audience" onChange={vi.fn()} />);

    const selected = screen.getByRole("button", { name: /誰向けかを伝える/ });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(selected.className).not.toContain("animate-choice-pop");
  });
});

describe("自分で条件を書く", () => {
  /*
    用意した条件と同じ列に並べると、**押した先が違うもの**が
    1つだけ混ざる。押すと入力欄が開くので、選んだつもりの人はそこで
    止まる。並びの外に、小さな二次操作として置く。
  */
  const WITH_FREE: LessonStep = {
    ...STEP,
    options: [
      ...(STEP.options ?? []),
      { value: "", label: "自分で条件を追加", free: true },
    ],
  };

  it("札の並びには混ざらない", () => {
    render(<ChoiceTiles step={WITH_FREE} value="" onChange={vi.fn()} />);

    const list = screen.getByTestId("choice-tiles");
    expect(
      within(list).queryByRole("button", { name: /自分で条件を追加/ }),
    ).toBeNull();
    expect(within(list).getAllByRole("button")).toHaveLength(2);
  });

  it("並びの外から開ける", async () => {
    const user = userEvent.setup();
    render(<ChoiceTiles step={WITH_FREE} value="" onChange={vi.fn()} />);

    await user.click(screen.getByTestId("choice-free"));

    expect(screen.getByRole("textbox", { name: /自分で条件を書く/ })).toBeInTheDocument();
  });

  it("開いたら、選び直す道も残す", async () => {
    // 開いたら最後、では行き止まりになる
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChoiceTiles step={WITH_FREE} value="" onChange={onChange} />);

    await user.click(screen.getByTestId("choice-free"));
    await user.click(screen.getByRole("button", { name: "用意された条件から選ぶ" }));

    expect(screen.getByTestId("choice-tiles")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
