/**
 * レッスンの「進んだ感じ」を作っている部品。
 *
 * 動きそのものを確かめるのではない。動きは目で見るもので、
 * テストで固めると数を変えるたびに落ちるだけになる。
 *
 * ここで守るのは、**動かない人にも意味が残ること**と、
 * 向きが意味を持つこと。
 *
 *   1. 進み具合が読み上げに届くこと（色と幅だけで伝えない）
 *   2. 戻ったことが、進んだことと区別できること
 *   3. 「できた」が読み上げに届き、出しっぱなしにならないこと
 */

import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LessonProgress } from "../src/components/course/LessonProgress";
import { StepTransition } from "../src/components/course/StepTransition";
import { StepDone } from "../src/components/course/StepDone";

describe("進み具合", () => {
  it("何歩目かが読み上げに届く", () => {
    /*
      帯の幅だけで伝えると、見えない人には何も残らない。
      数字と、読み上げ用の文の両方を持たせる。
    */
    render(<LessonProgress current={3} total={19} />);

    const bar = screen.getByRole("progressbar", { name: "レッスンの進み具合" });
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "19");
    expect(bar).toHaveTextContent("3 / 19");
  });

  it("0本のレッスンでも壊れない", () => {
    // 教材の取り込み前など、総数が来ないことがある
    render(<LessonProgress current={1} total={0} />);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "1");
  });
});

describe("ステップの入れ替え", () => {
  it("初めての画面は「進んだ」向き", () => {
    render(<StepTransition stepKey="a">本文</StepTransition>);

    expect(screen.getByTestId("step-transition")).toHaveAttribute(
      "data-direction",
      "forward",
    );
  });

  it("一度出した画面へ返ると「戻った」向きになる", () => {
    /*
      向きを固定すると、戻ったのに進んだように見えて迷子になる。
      並び順は知らないので、「前に出した鍵をもう一度見た＝戻った」で判断する。
    */
    const { rerender } = render(<StepTransition stepKey="a">1</StepTransition>);
    rerender(<StepTransition stepKey="b">2</StepTransition>);
    rerender(<StepTransition stepKey="a">1</StepTransition>);

    expect(screen.getByTestId("step-transition")).toHaveAttribute(
      "data-direction",
      "back",
    );
  });

  it("動きが無くても中身は必ず出る", () => {
    // 透明度だけで隠す作りなので、要素そのものは常にある
    render(<StepTransition stepKey="a">たいせつな本文</StepTransition>);

    expect(screen.getByText("たいせつな本文")).toBeInTheDocument();
  });
});

describe("「できた」の印", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("読み上げに届く", () => {
    // 色と動きだけで伝えると、見えない人には何も起きていないのと同じ
    render(<StepDone label="AIが書き直しました" trigger={1} />);

    expect(screen.getByRole("status")).toHaveTextContent("AIが書き直しました");
  });

  it("出しっぱなしにしない", () => {
    /*
      残すと次の操作の邪魔になる。手応えは一瞬でよい。
    */
    render(<StepDone label="できました" trigger={1} />);
    expect(screen.getByTestId("step-done")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.queryByTestId("step-done")).not.toBeInTheDocument();
  });

  it("次の合図が来たら、もう一度出る", () => {
    const { rerender } = render(<StepDone label="できました" trigger={1} />);
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.queryByTestId("step-done")).not.toBeInTheDocument();

    rerender(<StepDone label="できました" trigger={2} />);

    expect(screen.getByTestId("step-done")).toBeInTheDocument();
  });
});
