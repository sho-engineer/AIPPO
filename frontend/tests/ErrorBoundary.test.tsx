import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { CRASH } from "../src/content/ui";

/**
 * 真っ白な画面は、初心者に「自分が壊した」と受け取られて離脱につながる。
 * どこかで例外が出ても、次にやることが1つだけ見えている状態にする。
 */

function Boom(): never {
  throw new Error("描画で失敗した");
}

describe("画面が壊れたときの受け皿", () => {
  beforeEach(() => {
    // React は境界で捕まえた例外もコンソールへ出す。テスト出力を汚さない。
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("普段は中身をそのまま出す", () => {
    render(
      <ErrorBoundary onError={() => {}}>
        <p>ふつうの中身</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("ふつうの中身")).toBeInTheDocument();
  });

  it("例外が出ても真っ白にならない", () => {
    render(
      <ErrorBoundary onError={() => {}}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId("crash-view")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: CRASH.title })).toBeInTheDocument();
  });

  it("次にやることが1つだけ示される（憲章 原則 I）", () => {
    render(
      <ErrorBoundary onError={() => {}}>
        <Boom />
      </ErrorBoundary>,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent(CRASH.retry);
  });

  it("ポーが出て、ひとりにしない", () => {
    render(
      <ErrorBoundary onError={() => {}}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("poe-avatar")).toBeInTheDocument();
  });

  it("画面に専門用語や内部の事情を出さない", () => {
    render(
      <ErrorBoundary onError={() => {}}>
        <Boom />
      </ErrorBoundary>,
    );

    const body = screen.getByTestId("crash-view").textContent ?? "";
    expect(body).not.toContain("描画で失敗した");
    for (const word of ["エラー", "例外", "Error", "undefined"]) {
      expect(body).not.toContain(word);
    }
  });

  it("原因は追えるように渡される", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0][0] as Error).message).toBe("描画で失敗した");
  });
});
