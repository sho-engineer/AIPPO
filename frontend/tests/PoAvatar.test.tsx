import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PoAvatar } from "../src/po/PoAvatar";
import { PO_ALT, poAssets } from "../src/po/assets";
import { PO_EMOTIONS, type PoEmotion, type PoMessage } from "../src/course/types";

const po = (overrides: Partial<PoMessage> = {}): PoMessage => ({
  message: "まずは、短くて身近な文章から試してみましょう。",
  emotion: "question",
  action: "wait",
  ...overrides,
});

describe("ポーの表示", () => {
  it("発言を吹き出しに出す", () => {
    render(<PoAvatar po={po()} />);
    expect(
      screen.getByText("まずは、短くて身近な文章から試してみましょう。"),
    ).toBeInTheDocument();
  });

  it("8状態すべてに画像が定義されている（要件 §5）", () => {
    expect(Object.keys(poAssets)).toHaveLength(8);
    for (const emotion of PO_EMOTIONS) {
      expect(poAssets[emotion]).toMatch(/^\/assets\/po\/.+\.webp$/);
    }
  });

  it.each(PO_EMOTIONS)("%s の状態が data 属性に出る", (emotion: PoEmotion) => {
    render(<PoAvatar po={po({ emotion })} />);
    expect(screen.getByTestId("po-avatar")).toHaveAttribute(
      "data-emotion",
      emotion,
    );
  });

  it("画像に代替テキストがある", () => {
    render(<PoAvatar po={po()} />);
    expect(screen.getByAltText(PO_ALT)).toBeInTheDocument();
  });

  it("aria-live で読み上げへ届ける", () => {
    render(<PoAvatar po={po()} />);
    expect(screen.getByTestId("po-avatar")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("下のボタンのタップを奪わない", () => {
    render(<PoAvatar po={po()} />);
    expect(screen.getByTestId("po-avatar").className).toContain(
      "pointer-events-none",
    );
  });

  it("isVisible=false のとき何も描画しない", () => {
    const { container } = render(<PoAvatar po={po()} isVisible={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("画像が無いとき", () => {
  it("壊れた画像を出さず、丸いプレースホルダーへ倒す", () => {
    // talking と blink には専用の絵がまだ無い。
    // 代わりの絵も読めなかったときに、壊れた画像を見せない。
    render(<PoAvatar po={po({ emotion: "warning" })} />);

    // 1枚目が失敗 → 代わりが無いのでプレースホルダー
    fireEvent.error(screen.getByTestId("po-image"));

    const placeholder = screen.getByTestId("po-placeholder");
    expect(placeholder).toHaveAttribute("role", "img");
    expect(placeholder).toHaveAttribute("aria-label", PO_ALT);
    // 状態を色だけで表さない（要件 §6.12）
    expect(placeholder.textContent?.trim()).not.toBe("");
  });

  it("専用の絵が無い状態は、近い絵へ寄せる", () => {
    render(<PoAvatar po={po({ emotion: "talking" })} />);

    fireEvent.error(screen.getByTestId("po-image"));

    // まだプレースホルダーにはならず、近い絵を試す
    expect(screen.queryByTestId("po-placeholder")).toBeNull();
    expect(screen.getByTestId("po-image")).toHaveAttribute(
      "src",
      poAssets.neutral,
    );
  });
});

describe("動き", () => {
  it("ふだんは浮くだけ", () => {
    render(<PoAvatar po={po({ emotion: "neutral" })} />);
    expect(screen.getByTestId("po-image").className).toContain("animate-float");
  });

  it("celebrate は一度だけ跳ねる（跳ね続けない）", () => {
    render(<PoAvatar po={po({ emotion: "celebrate" })} />);
    const className = screen.getByTestId("po-image").className;
    expect(className).toContain("animate-pop-in");
    expect(className).not.toContain("animate-float");
  });

  it("thinking のときだけアンテナが光る", () => {
    const { container, rerender } = render(
      <PoAvatar po={po({ emotion: "thinking" })} />,
    );
    expect(container.querySelector(".animate-twinkle")).not.toBeNull();

    rerender(<PoAvatar po={po({ emotion: "neutral" })} />);
    expect(container.querySelector(".animate-twinkle")).toBeNull();
  });
});
