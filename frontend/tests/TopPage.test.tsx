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
    // ブランド名はロゴ画像で出す。読み上げにも名前が届くこと。
    expect(screen.getByAltText(BRAND.name)).toBeInTheDocument();
    expect(screen.getByText(BRAND.tagline)).toBeInTheDocument();
  });

  it("行き先は「はじめる」の1つだけ（憲章 原則 I）", () => {
    // 画面が縦に伸びたので、最後まで読んだ場所にも同じボタンを置いている。
    // 原則 I が禁じているのはボタンの数ではなく「選ばせること」なので、
    // すべてのボタンが同じ名前・同じ行き先であることを確かめる。
    render(<TopPage onStart={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button).toHaveAccessibleName("はじめる");
    }
  });

  it.each([0, 1])("%i 番目の「はじめる」でも診断へ進む", async (index) => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<TopPage onStart={onStart} />);

    await user.click(screen.getAllByRole("button", { name: "はじめる" })[index]);

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
