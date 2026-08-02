import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "../src/App";
import { DIAGNOSIS_QUESTIONS } from "../src/content/diagnosis";
import { BRAND } from "../src/content/ui";

/**
 * Phase 1 の完了条件:
 * 固定レスポンスでトップ → 診断 → レッスン画面まで遷移できること。
 */
describe("トップ → 診断 → レッスン の通し導線", () => {
  it("トップから始まる", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: BRAND.headline }),
    ).toBeInTheDocument();
  });

  it("3問答えてレッスン画面まで到達できる", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "はじめる" }));

    for (const question of DIAGNOSIS_QUESTIONS) {
      await screen.findByRole("heading", { name: question.question });
      await user.click(
        screen.getByRole("button", { name: question.choices[0].label }),
      );
    }

    await user.click(
      await screen.findByRole("button", { name: "これを試す" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "AIに文章を分かりやすくしてもらう",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("lesson-step")).toHaveAttribute(
      "data-step",
      "INTRO",
    );
  });

  it("レッスンからトップへ戻れる", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "はじめる" }));
    for (const question of DIAGNOSIS_QUESTIONS) {
      await screen.findByRole("heading", { name: question.question });
      await user.click(
        screen.getByRole("button", { name: question.choices[0].label }),
      );
    }
    await user.click(await screen.findByRole("button", { name: "これを試す" }));

    await user.click(
      await screen.findByRole("button", { name: "ひとつ前にもどる" }),
    );

    expect(
      await screen.findByRole("heading", { name: BRAND.headline }),
    ).toBeInTheDocument();
  });

  it("どの画面でもポーが表示される", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByTestId("poe-avatar")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "はじめる" }));
    expect(screen.getByTestId("poe-avatar")).toBeInTheDocument();
  });
});
