/**
 * ポーがちらつかない。
 *
 * 何が起きていたか
 * ----------------
 * まばたきも口の動きも、**別のファイルへ差し替える**やり方で作って
 * ある。その `<img>` に「いまの表情」を目印（React の `key`）として
 * 付けていたので、表情が変わるたびに React が `<img>` を捨てて
 * 作り直していた。作り直した直後の `<img>` はまだ何も描かれて
 * いないので、絵が一瞬消える。
 *
 * ホームのポーは「話している」状態で、口は 160ms ごとに入れ替わる。
 * 1.6 秒のあいだに 10 回作り直され、そのたびに絵が消えていた——
 * **画面ではチカチカ光って見える。** まばたきのほうは 5〜8 秒ごとに、
 * 開いているあいだずっと続く。
 *
 * 見張り方
 * --------
 * 「同じ `<img>` が使い回されているか」を見る。見た目のちらつきは
 * 測れないが、**作り直しは測れる**——作り直されていなければ、
 * ブラウザは次の絵を描けるまで前の絵を出したままにするので、
 * 途切れようがない。
 */

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PoFace } from "../src/po/PoAvatar";

beforeEach(() => {
  vi.useFakeTimers();
  // 動きを減らす設定は「していない」を既定にする
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

afterEach(() => vi.useRealTimers());

/**
 * 少しずつ時間を進めながら見る。
 *
 * **一気に進めてはいけない。** `advanceTimersByTime` を1回の `act` で
 * 大きく進めると、途中の状態変化がまとめて1回の描画になり、
 * 最後の姿しか残らない。作り直しは**途中で**起きるので、
 * まとめて進めると素通りする（実際、それで見逃した）。
 */
function watch(totalMs: number, stepMs: number) {
  const first = screen.getByTestId("po-image");
  const frames: string[] = [];
  let reused = true;

  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    act(() => vi.advanceTimersByTime(stepMs));
    const now = screen.getByTestId("po-image");
    frames.push(String(now.getAttribute("src")));
    if (now !== first) reused = false;
  }
  return { reused, frames, changed: new Set(frames).size > 1 };
}

describe("動いても、絵が消えない", () => {
  it("口が動くあいだ、同じ img を使い回す", () => {
    /*
      ホームのポーがこれ。160ms ごとに入れ替わる。
      毎回作り直していたのが、チカチカの正体。
    */
    render(<PoFace emotion="talking" message="こんにちは" />);

    const seen = watch(1600, 160);

    expect(seen.reused).toBe(true);
    // 使い回すあまり、動かなくなっていないこと
    expect(seen.changed).toBe(true);
  });

  it("まばたきでも、同じ img を使い回す", () => {
    render(<PoFace emotion="neutral" />);

    // まばたきは5〜8秒おき。何回か通る長さを、細かく刻んで進める
    const seen = watch(20000, 100);

    expect(seen.reused).toBe(true);
    expect(seen.changed).toBe(true);
  });
});

describe("動きを減らす設定", () => {
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  it("まばたきを止める", () => {
    /*
      **CSS では止められない。** まばたきは絵そのものを差し替える
      作りなので、`index.css` の一括指定が効かない。口の動きは
      自分で見ていたのに、まばたきだけ見ていなかった。
    */
    render(<PoFace emotion="neutral" />);
    const before = screen.getByTestId("po-image").getAttribute("src");

    act(() => vi.advanceTimersByTime(20000));

    expect(screen.getByTestId("po-image").getAttribute("src")).toBe(before);
  });

  it("口の動きも止める", () => {
    render(<PoFace emotion="talking" message="こんにちは" />);
    const before = screen.getByTestId("po-image").getAttribute("src");

    act(() => vi.advanceTimersByTime(2000));

    expect(screen.getByTestId("po-image").getAttribute("src")).toBe(before);
  });
});
