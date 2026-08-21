/**
 * 「このコースで作れるようになるもの」（コースの中身の画面）。
 *
 * ここで守るのは3つ。
 *
 *   1. 押した先に説明があるものだけ出す
 *   2. 1件も出せないなら、節ごと出さない（空の見出しを残さない）
 *   3. 押すと、その id で説明がひらく
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PathRecipes } from "../src/components/course/PathRecipes";
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
    render(<PathRecipes recipes={[KNOWN]} onOpenRecipe={() => {}} />);

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
    render(<PathRecipes recipes={[KNOWN]} onOpenRecipe={() => {}} />);

    expect(screen.getByTestId("path-recipes")).toBeInTheDocument();
  });

  it("説明が無いものは出さない", () => {
    /*
      サーバー側にだけあるレシピを出すと、押しても開けない案内になる
      （憲章 原則 I）。
    */
    render(<PathRecipes recipes={[KNOWN, UNKNOWN]} onOpenRecipe={() => {}} />);

    expect(
      screen.queryByTestId("path-recipe-recipe_the_frontend_does_not_know"),
    ).not.toBeInTheDocument();
  });

  it("1件も出せないなら、節ごと出さない", () => {
    render(<PathRecipes recipes={[UNKNOWN]} onOpenRecipe={() => {}} />);

    expect(screen.queryByTestId("path-recipes")).not.toBeInTheDocument();
    expect(
      screen.queryByText("このコースで作れるようになるもの"),
    ).not.toBeInTheDocument();
  });

  it("そもそも空でも落ちない", () => {
    render(<PathRecipes recipes={[]} onOpenRecipe={() => {}} />);

    expect(screen.queryByTestId("path-recipes")).not.toBeInTheDocument();
  });
});

describe("押したとき", () => {
  it("その id で説明がひらく", async () => {
    const onOpenRecipe = vi.fn();
    const user = userEvent.setup();
    render(<PathRecipes recipes={[KNOWN]} onOpenRecipe={onOpenRecipe} />);

    await user.click(screen.getByTestId("path-recipe-clear_writing_for_email"));

    expect(onOpenRecipe).toHaveBeenCalledWith("clear_writing_for_email");
  });
});
