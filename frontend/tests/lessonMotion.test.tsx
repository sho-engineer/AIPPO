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
import { LessonCelebration } from "../src/components/course/LessonCelebration";

describe("進み具合", () => {
  it("進み具合が読み上げに届く", () => {
    /*
      帯の幅だけで伝えると、見えない人には何も残らない。
      ただし**内部の歩数は渡さない**——19 は実装上の数で、
      学習者にとって意味を持たない（下の「区切り」を参照）。
    */
    render(<LessonProgress current={3} total={19} />);

    const bar = screen.getByRole("progressbar", { name: "レッスンの進み具合" });
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "19");
    expect(bar).toHaveAttribute("aria-valuetext", "16パーセント");
    expect(bar).not.toHaveTextContent("3 / 19");
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

describe("完了の祝い", () => {
  /*
    紙吹雪は飾りで、意味は一切載せていない（終えたことは見出しと項目が
    伝える）。だから動きを減らす設定の人には**出さない**。

    CSS で秒数を0にする手は使えない。紙が散らばったまま画面に残る。
  */
  function setReducedMotion(reduce: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: reduce && query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }));
  }

  afterEach(() => vi.unstubAllGlobals());

  it("ふだんは出る", () => {
    setReducedMotion(false);
    render(<LessonCelebration />);

    expect(screen.getByTestId("lesson-celebration")).toBeInTheDocument();
  });

  it("動きを減らす設定なら、出さない", () => {
    setReducedMotion(true);
    render(<LessonCelebration />);

    expect(screen.queryByTestId("lesson-celebration")).not.toBeInTheDocument();
  });

  it("読み上げには出さない", () => {
    // 飾りなので、聞いている人には何も足さない
    setReducedMotion(false);
    render(<LessonCelebration />);

    expect(screen.getByTestId("lesson-celebration")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});

describe("進み具合の帯の区切り", () => {
  /**
   * 19歩の一本道に見えると、始めた人はまず「あと16回も押すのか」と
   * 思う。実際の中身は4つのまとまりで、どれも数歩で終わる。
   * その形を帯の割れ目と、区切りの名前で出す。
   *
   * **分数は1つのまま。** 「2 / 4」と「3 / 19」が並ぶと、どちらを
   * 見ればよいのか決められなくなる（前に3段で同じことを言って
   * 読まれなくなった件と同じ轍）。
   */
  const MISSIONS = [
    { key: "try" as const, label: "試す", steps: 4 },
    { key: "compare" as const, label: "変える", steps: 4 },
    { key: "own" as const, label: "自分で使う", steps: 7 },
  ];

  it("いまいる区切りの名前を出す", () => {
    render(
      <LessonProgress current={3} total={10} missions={MISSIONS} currentMission={2} />,
    );

    expect(screen.getByTestId("lesson-mission")).toHaveTextContent("変える");
  });

  it("分数は1つだけ。しかも区切りの番号のほう", () => {
    /*
      内部の歩数（3 / 10）は出さない。学習者にとって意味を持つのは
      「4つのうち2つ目」で、細かい進み具合は帯の幅が持っている。
    */
    render(
      <LessonProgress current={3} total={10} missions={MISSIONS} currentMission={2} />,
    );

    const text = screen.getByTestId("lesson-progress").textContent ?? "";
    expect(text.match(/\//g) ?? []).toHaveLength(1);
    expect(text).toContain(`2 / ${MISSIONS.length}`);
    expect(text).not.toContain("3 / 10");
  });

  it("読み上げにも、いまの区切りが伝わる", () => {
    render(
      <LessonProgress current={3} total={10} missions={MISSIONS} currentMission={2} />,
    );

    expect(screen.getByTestId("lesson-progress")).toHaveAttribute(
      "aria-valuetext",
      "3つのうち2つ目。いまは「変える」",
    );
  });

  it("区切りが無くても、帯だけは必ず出る", () => {
    // 区切りを持たない呼び出し側が残っていても、進み具合は消さない
    render(<LessonProgress current={3} total={10} />);

    const bar = screen.getByTestId("lesson-progress");
    expect(bar).toHaveAttribute("aria-valuetext", "30パーセント");
    // 名前も番号も出せないので、数字は置かない
    expect(bar.textContent).toBe("");
  });
});
