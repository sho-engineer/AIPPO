/**
 * 再送までの残り時間。
 *
 * ここで守るのは4つ。
 *
 *   1. 残りを**数字で**出す（「しばらく」では、待つべきか壊れているかが
 *      分からず、結局押し直される）
 *   2. 0になったら消えて、押せる状態へ戻る（**永久に止めない**）
 *   3. 秒数を画面に書き写さない。サーバーが言った値をそのまま数える
 *   4. 1秒ごとに読み上げへ割り込まない
 *
 * 押せなくするのは親切のためで、守りではない。手元でいくらでも外せるので、
 * 実際に止めているのはサーバー（apps/accounts/throttle.py の間隔）。
 */

import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ResendCountdown,
  formatRemaining,
} from "../src/components/auth/ResendCountdown";

describe("残り時間の書き方", () => {
  it("mm:ss にする", () => {
    expect(formatRemaining(59)).toBe("00:59");
    expect(formatRemaining(60)).toBe("01:00");
    expect(formatRemaining(5)).toBe("00:05");
  });

  it("マイナスでも壊れない", () => {
    // 時計のずれで負になることがある。00:00 で止める
    expect(formatRemaining(-3)).toBe("00:00");
  });
});

describe("再送までの残り", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("渡された秒数から数え始める", () => {
    render(<ResendCountdown seconds={60} />);

    const line = screen.getByTestId("resend-countdown");
    expect(line).toHaveTextContent("60秒後");
    expect(line).toHaveTextContent("01:00");
  });

  it("1秒ごとに減る", () => {
    render(<ResendCountdown seconds={60} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByTestId("resend-countdown")).toHaveTextContent("00:57");
  });

  it("0になったら消えて、知らせる", () => {
    /*
      永久に止めない。消えないと、待った人が押せないままになる。
    */
    const onFinished = vi.fn();
    render(<ResendCountdown seconds={2} onFinished={onFinished} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByTestId("resend-countdown")).not.toBeInTheDocument();
    expect(onFinished).toHaveBeenCalled();
  });

  it("0以下なら最初から出さない", () => {
    // サーバーが間隔を切っている（0）ときは、待ち時間そのものが無い
    render(<ResendCountdown seconds={0} />);

    expect(screen.queryByTestId("resend-countdown")).not.toBeInTheDocument();
  });

  it("秒数が変わったら数え直す", () => {
    // もう一度断られたとき。前の残りを引きずらない
    const { rerender } = render(<ResendCountdown seconds={10} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId("resend-countdown")).toHaveTextContent("00:05");

    rerender(<ResendCountdown seconds={30} />);

    expect(screen.getByTestId("resend-countdown")).toHaveTextContent("00:30");
  });

  it("1秒ごとに読み上げへ割り込まない", () => {
    /*
      変化を追わせたい情報ではない。「いま待ちの状態」が分かれば足りる。
      polite にすると、1秒ごとに読み上げが差し込まれて操作を邪魔する。
    */
    render(<ResendCountdown seconds={60} />);

    expect(screen.getByTestId("resend-countdown")).toHaveAttribute(
      "aria-live",
      "off",
    );
  });
});
