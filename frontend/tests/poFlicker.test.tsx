/**
 * ポーがちらつかない。
 *
 * 何が起きていたか
 * ----------------
 * まばたき（5〜8秒ごと）も口の動き（160msごと）も、**別のファイルへ
 * 差し替える**やり方で作ってあった。実機の録画を測ると、差し替わる
 * 瞬間だけ画面の変化量がふだんの浮き沈みの**10倍**あり、はっきり
 * 点滅として映っていた。
 *
 * 原因は8枚の描かれ方が揃っていないこと。台紙に対する絵の大きさが
 * 状態ごとに違い（`PO_BOX`）、`poTransform` は背丈しか合わせない。
 * 背丈が同じでも体に対する頭の比が違うので、差し替えた瞬間に
 * **別の体格の子**へ入れ替わって見える（blink は neutral より 17%
 * 小さく描かれている）。
 *
 * 絵は描き直さない決まりなので、動かすほうをやめた。
 *
 * 見張り方
 * --------
 * 時間を進めても**絵の道すじが変わらない**ことを見る。ちらつきそのものは
 * 測れないが、差し替えが起きていなければちらつきようがない。
 */

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PoFace, PoAvatar } from "../src/po/PoAvatar";

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** 20秒ぶん進める。まばたきの間隔（5〜8秒）を何回もまたぐ長さ。 */
function waitLongEnough() {
  act(() => {
    vi.advanceTimersByTime(20_000);
  });
}

describe("ポーは絵を差し替えない", () => {
  it("時間が経っても、同じ絵のまま", () => {
    render(<PoFace emotion="neutral" />);
    const before = screen.getByTestId("po-image").getAttribute("src");

    waitLongEnough();

    expect(screen.getByTestId("po-image")).toHaveAttribute("src", before);
  });

  it("話している状態でも、口の絵と入れ替わらない", () => {
    /*
      前は `talking` と `neutral` を 160ms ごとに入れ替えていた。
      2枚は口だけでなく**腕の位置も体の比も違う**ので、口が動くのではなく
      別の絵が点滅して見えていた。
    */
    render(<PoFace emotion="talking" />);
    const before = screen.getByTestId("po-image").getAttribute("src");
    expect(before).toContain("talking.webp");

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByTestId("po-image")).toHaveAttribute("src", before);
  });

  it("吹き出し付きのほうも、同じ絵のまま", () => {
    render(
      <PoAvatar po={{ message: "こんにちは", emotion: "talking", action: "next" }} />,
    );
    const before = screen.getByTestId("po-image").getAttribute("src");

    waitLongEnough();

    expect(screen.getByTestId("po-image")).toHaveAttribute("src", before);
  });

  it("時間が経っても、同じ `<img>` を使い回す", () => {
    /*
      作り直された `<img>` は、次の絵を描き終えるまで**何も出さない**。
      差し替えをやめたので作り直す理由も無くなったが、
      うっかり `key` を戻したときにここで気づけるようにしておく。
    */
    render(<PoFace emotion="neutral" />);
    const before = screen.getByTestId("po-image");

    waitLongEnough();

    expect(screen.getByTestId("po-image")).toBe(before);
  });
});
