import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DiagnosisPage } from "../src/pages/DiagnosisPage";
import { DIAGNOSIS_QUESTIONS } from "../src/content/diagnosis";

/** 3問すべてに順番に答える。 */
async function answerAll(user: ReturnType<typeof userEvent.setup>) {
  for (const question of DIAGNOSIS_QUESTIONS) {
    const heading = await screen.findByRole("heading", {
      name: question.question,
    });
    expect(heading).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: question.choices[0].label }),
    );
  }
}

describe("DiagnosisPage", () => {
  it("設問は3問だけ（設計判断 Q-1）", () => {
    expect(DIAGNOSIS_QUESTIONS).toHaveLength(3);
  });

  it("最初は1問目だけを表示する", () => {
    render(<DiagnosisPage onSelectLesson={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: DIAGNOSIS_QUESTIONS[0].question }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: DIAGNOSIS_QUESTIONS[1].question }),
    ).not.toBeInTheDocument();
  });

  it("選ぶと自動で次の問いへ進む（次へボタンを置かない）", async () => {
    const user = userEvent.setup();
    render(<DiagnosisPage onSelectLesson={vi.fn()} />);

    await user.click(
      screen.getByRole("button", {
        name: DIAGNOSIS_QUESTIONS[0].choices[0].label,
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: DIAGNOSIS_QUESTIONS[1].question,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "次へ" })).toBeNull();
  });

  it("進捗を 1/3 から表示する", async () => {
    const user = userEvent.setup();
    render(<DiagnosisPage onSelectLesson={vi.fn()} />);

    expect(screen.getByText("1 / 3")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: DIAGNOSIS_QUESTIONS[0].choices[0].label,
      }),
    );

    expect(await screen.findByText("2 / 3")).toBeInTheDocument();
  });

  it("3問答えるとおすすめ用途を表示する", async () => {
    const user = userEvent.setup();
    render(<DiagnosisPage onSelectLesson={vi.fn()} />);

    await answerAll(user);

    expect(
      await screen.findByText("あなたに合いそうな使い道です"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "文章を分かりやすくしてもらう" }),
    ).toBeInTheDocument();
  });

  it("いま試せるのは1件だけ（憲章 原則 I: 次の行動は1つ）", async () => {
    const user = userEvent.setup();
    render(<DiagnosisPage onSelectLesson={vi.fn()} />);

    await answerAll(user);

    await screen.findByText("あなたに合いそうな使い道です");
    expect(screen.getAllByRole("button", { name: "これを試す" })).toHaveLength(1);
  });

  it("試せないものは「このあと追加予定」と示す", async () => {
    const user = userEvent.setup();
    render(<DiagnosisPage onSelectLesson={vi.fn()} />);

    await answerAll(user);

    await screen.findByText("あなたに合いそうな使い道です");
    expect(screen.getByText("このあと追加予定")).toBeInTheDocument();
  });

  it("「これを試す」でレッスンIDを渡す", async () => {
    const user = userEvent.setup();
    const onSelectLesson = vi.fn();
    render(<DiagnosisPage onSelectLesson={onSelectLesson} />);

    await answerAll(user);
    await user.click(
      await screen.findByRole("button", { name: "これを試す" }),
    );

    await waitFor(() =>
      expect(onSelectLesson).toHaveBeenCalledWith("rewrite_text_001"),
    );
  });

  it("ポーが表示される", () => {
    render(<DiagnosisPage onSelectLesson={vi.fn()} />);
    expect(screen.getByTestId("poe-avatar")).toBeInTheDocument();
  });

  it("設問中のポーは question 状態", () => {
    render(<DiagnosisPage onSelectLesson={vi.fn()} />);
    expect(screen.getByTestId("poe-avatar")).toHaveAttribute(
      "data-emotion",
      "question",
    );
  });
});
