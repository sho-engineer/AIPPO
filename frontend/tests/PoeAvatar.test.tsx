import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EMOTION_IMAGES, PoeAvatar } from "../src/components/PoeAvatar";
import type { TutorEmotion, TutorMessage } from "../src/types/tutor";

const tutor = (overrides: Partial<TutorMessage> = {}): TutorMessage => ({
  message: "まずは、短くて身近な文章から試してみましょう。",
  emotion: "question",
  action: "wait",
  ...overrides,
});

describe("PoeAvatar", () => {
  it("メッセージを吹き出しに表示する", () => {
    render(<PoeAvatar tutor={tutor()} />);
    expect(
      screen.getByText("まずは、短くて身近な文章から試してみましょう。"),
    ).toBeInTheDocument();
  });

  const emotions: TutorEmotion[] = [
    "neutral",
    "question",
    "thinking",
    "hint",
    "warning",
    "celebrate",
  ];

  it.each(emotions)("%s の状態で対応する画像へ切り替わる（§7）", (emotion) => {
    render(<PoeAvatar tutor={tutor({ emotion })} />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      EMOTION_IMAGES[emotion],
    );
  });

  it("6状態すべてに画像が定義されている", () => {
    expect(Object.keys(EMOTION_IMAGES)).toHaveLength(6);
    for (const src of Object.values(EMOTION_IMAGES)) {
      expect(src).toMatch(/^\/poe\/.+\.(webp|png|svg)$/);
    }
  });

  it("画像に代替テキストがある", () => {
    render(<PoeAvatar tutor={tutor()} />);
    expect(screen.getByAltText("AIPPOの案内役 ポー")).toBeInTheDocument();
  });

  it("aria-live で変更をスクリーンリーダーへ通知する", () => {
    render(<PoeAvatar tutor={tutor()} />);
    expect(screen.getByTestId("poe-avatar")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("isVisible=false のとき何も描画しない", () => {
    const { container } = render(<PoeAvatar tutor={tutor()} isVisible={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("狭い画面では下部に固定される", () => {
    render(<PoeAvatar tutor={tutor()} />);
    const avatar = screen.getByTestId("poe-avatar");
    expect(avatar.className).toContain("fixed");
    expect(avatar.className).toContain("bottom-0");
  });

  it("hero では画面に固定せず、その場で浮かせる", () => {
    // タイトル画面の主役。隅に貼り付いていると主役に見えない。
    render(<PoeAvatar variant="hero" tutor={tutor()} />);
    const avatar = screen.getByTestId("poe-avatar");
    expect(avatar.className).not.toContain("fixed");
    expect(screen.getByAltText("AIPPOの案内役 ポー").className).toContain(
      "animate-float",
    );
  });

  it("imageSrc で表情の画像を差し替えられる", () => {
    // トップでは表情ではなく「手を振っているポー」を出す
    render(
      <PoeAvatar variant="hero" imageSrc="/brand/poe-wave.webp" tutor={tutor()} />,
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "/brand/poe-wave.webp",
    );
  });

  it("メッセージが変わると表示も変わる", () => {
    const { rerender } = render(<PoeAvatar tutor={tutor()} />);
    rerender(
      <PoeAvatar
        tutor={tutor({ message: "できました。", emotion: "celebrate" })}
      />,
    );

    expect(screen.getByText("できました。")).toBeInTheDocument();
    expect(screen.getByTestId("poe-avatar")).toHaveAttribute(
      "data-emotion",
      "celebrate",
    );
  });
});
