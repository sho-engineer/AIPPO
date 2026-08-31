/**
 * 「このコースでできるようになること」（コースの中身の画面）。
 *
 * 主役は**1文**で、代表例はその添え物。前はここが6枚の長いカードで、
 * 始める前の人が読むには長すぎたうえ、「どれをやればこれができるのか」は
 * 結局どこにも書いていなかった。
 *
 * ここで守るのは4つ。
 *
 *   1. 1文を出すこと（レッスンごとの成果を並べ直さない）
 *   2. 代表例は3つまで（並べると、また読み下すことになる）
 *   3. 押した先に説明があるものだけ出す
 *   4. 何も出せないなら、節ごと出さない（空の見出しを残さない）
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CourseOutcome } from "../src/components/course/CourseOutcome";
import type { LearningPathRecipe } from "../src/api/rewards";

/** 画面側（appliedTips.ts）に説明があるもの。 */
const KNOWN: LearningPathRecipe = {
  id: "clear_writing_for_email",
  title: "そのまま送れるメールにする",
  description: "誰に、どんな言い方で送るかを決めてから書き直す。",
  access_type: "free",
};

/** サーバーにはあるが、画面側に説明が無いもの。 */
const UNKNOWN: LearningPathRecipe = {
  id: "recipe_the_frontend_does_not_know",
  title: "まだ画面が知らないレシピ",
  description: "",
  access_type: "free",
};

describe("押せる先があるものだけ出す", () => {
  it("説明があるものは出る", () => {
    render(<CourseOutcome recipes={[KNOWN]} onOpenRecipe={() => {}} />);

    expect(
      screen.getByTestId("path-recipe-clear_writing_for_email"),
    ).toBeInTheDocument();
  });

  it("節そのものに目印が付いている", () => {
    /*
      下の「出さない」検査は、目印を探して無いことを見る。
      目印がそもそも付いていないと、**出ているのに通ってしまう**。

      実際にそうなっていた。Card は data-testid をそのまま受け取らず
      testId という名前で取る作りで、渡し方を間違えていた。
      画面には出ているのに、検査は「出ていない」と言い続けていた
      （実機で見て気づいた）。ここで、目印の存在そのものを確かめる。
    */
    render(<CourseOutcome recipes={[KNOWN]} onOpenRecipe={() => {}} />);

    expect(screen.getByTestId("course-outcome")).toBeInTheDocument();
  });

  it("説明が無いものは出さない", () => {
    /*
      サーバー側にだけあるレシピを出すと、押しても開けない案内になる
      （憲章 原則 I）。
    */
    render(<CourseOutcome recipes={[KNOWN, UNKNOWN]} onOpenRecipe={() => {}} />);

    expect(
      screen.queryByTestId("path-recipe-recipe_the_frontend_does_not_know"),
    ).not.toBeInTheDocument();
  });

  it("1件も出せないなら、節ごと出さない", () => {
    render(<CourseOutcome recipes={[UNKNOWN]} onOpenRecipe={() => {}} />);

    expect(screen.queryByTestId("course-outcome")).not.toBeInTheDocument();
    expect(
      screen.queryByText("このコースでできるようになること"),
    ).not.toBeInTheDocument();
  });

  it("そもそも空でも落ちない", () => {
    render(<CourseOutcome recipes={[]} onOpenRecipe={() => {}} />);

    expect(screen.queryByTestId("course-outcome")).not.toBeInTheDocument();
  });
});

describe("押したとき", () => {
  it("その id で説明がひらく", async () => {
    const onOpenRecipe = vi.fn();
    const user = userEvent.setup();
    render(<CourseOutcome recipes={[KNOWN]} onOpenRecipe={onOpenRecipe} />);

    await user.click(screen.getByTestId("path-recipe-clear_writing_for_email"));

    expect(onOpenRecipe).toHaveBeenCalledWith("clear_writing_for_email");
  });
});

describe("1文が主役", () => {
  const OUTCOME = "文章・要約・整理・比較・画像まで、AIの基本が身につきます。";

  it("1文だけでも節は出る", () => {
    // 代表例が1つも無いコースでも、何ができるようになるかは言える
    render(<CourseOutcome outcome={OUTCOME} recipes={[]} onOpenRecipe={() => {}} />);

    expect(screen.getByTestId("course-outcome-line")).toHaveTextContent(OUTCOME);
  });

  it("代表例は3つまで", () => {
    /*
      並べると、また読み下すことになる。1本ずつの詳しい成果は
      レッスンを開いた最初の画面と、AI技図鑑・マイ成果物が持つ。
    */
    // 画面側に説明があるものだけを並べる。無いものは
    // どのみち落ちるので、上限を見たことにならない
    const many = [
      "clear_writing_for_email",
      "meeting_notes_share",
      "compare_new_tool",
      "plan_and_share",
      "improve_then_address",
    ].map((id) => ({ ...KNOWN, id }));

    render(<CourseOutcome outcome={OUTCOME} recipes={many} onOpenRecipe={() => {}} />);

    const list = screen.getByTestId("course-outcome-examples");
    expect(list.querySelectorAll("li")).toHaveLength(3);
  });

  it("行き先が無ければ、代表例そのものを出さない", () => {
    // 押しても開けない案内を作らない（憲章 原則 I）
    render(<CourseOutcome outcome={OUTCOME} recipes={[KNOWN]} />);

    expect(screen.queryByTestId("course-outcome-examples")).not.toBeInTheDocument();
    expect(screen.getByTestId("course-outcome-line")).toBeInTheDocument();
  });
});
