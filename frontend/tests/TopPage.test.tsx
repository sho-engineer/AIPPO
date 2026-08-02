import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TopPage } from "../src/pages/TopPage";
import { BRAND } from "../src/content/ui";

describe("TopPage", () => {
  it("キャッチコピーを見出しに出す", () => {
    render(<TopPage onStart={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: BRAND.headline }),
    ).toBeInTheDocument();
  });

  it("サービスの説明を出す", () => {
    render(<TopPage onStart={vi.fn()} />);
    expect(screen.getByText(BRAND.subHeadline)).toBeInTheDocument();
  });

  it("ブランド名とブランドコピーを出す", () => {
    render(<TopPage onStart={vi.fn()} />);
    expect(screen.getByText(BRAND.name)).toBeInTheDocument();
    expect(screen.getByText(BRAND.tagline)).toBeInTheDocument();
  });

  it("押せるボタンは「はじめる」の1つだけ（憲章 原則 I）", () => {
    render(<TopPage onStart={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName("はじめる");
  });

  it("「はじめる」で診断へ進む", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<TopPage onStart={onStart} />);

    await user.click(screen.getByRole("button", { name: "はじめる" }));

    expect(onStart).toHaveBeenCalledOnce();
  });

  it("登録が不要であることを伝える", () => {
    render(<TopPage onStart={vi.fn()} />);
    expect(screen.getByText(/登録は必要ありません/)).toBeInTheDocument();
  });

  it("ポーが挨拶する", () => {
    render(<TopPage onStart={vi.fn()} />);
    const poe = screen.getByTestId("poe-avatar");
    expect(poe).toBeInTheDocument();
    expect(poe).toHaveTextContent("はじめまして、ポーです。");
  });
});
