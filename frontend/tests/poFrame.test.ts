/**
 * ポーが、状態を変えても跳ねないこと。
 *
 * 絵は8枚とも同じ台紙（512×512）だが、**中の絵の大きさと位置は違う**。
 * talking は neutral の4分の3ほどしかなく、warning は右へ寄っている。
 * そのまま出すと、しゃべるたび（160msごとに talking と neutral を
 * 入れ替える）にポーが縮んで跳ね、別人のように見える。
 *
 * 直すのは表示側だけ。作画は触らない（正式デザインを変えないため）。
 * ここが見張るのは「合わせた結果、みんな同じ場所・同じ背丈になるか」。
 *
 * 絵を差し替えたときは PO_BOX を測り直す。測り直しを忘れると、
 * ここが落ちる。
 */

import { describe, expect, it } from "vitest";

import { PO_BOX, PO_REFERENCE, poTransform } from "../src/po/assets";
import { PO_EMOTIONS } from "../src/course/types";

/** `translate(x%, y%) scale(s)` を数値へ戻す。 */
function parse(transform: string) {
  const match = transform.match(
    /translate\(([-\d.]+)%, ([-\d.]+)%\) scale\(([\d.]+)\)/,
  );
  if (!match) throw new Error(`読めない形: ${transform}`);
  return { dx: Number(match[1]), dy: Number(match[2]), scale: Number(match[3]) };
}

/** 合わせたあとの、絵の中心と背丈。 */
function placed(emotion: (typeof PO_EMOTIONS)[number]) {
  const box = PO_BOX[emotion];
  const { dx, dy, scale } = parse(poTransform(emotion));

  // scale は中心（50,50）を軸に掛かり、そのあと translate が足される
  return {
    cx: 50 + (box.cx - 50) * scale + dx,
    cy: 50 + (box.cy - 50) * scale + dy,
    height: box.height * scale,
  };
}

describe("ポーの枠", () => {
  it("8つの状態すべてに、測った値がある", () => {
    // 1つでも抜けると、その状態だけ跳ねる
    for (const emotion of PO_EMOTIONS) {
      expect(PO_BOX[emotion], `${emotion} の実測値が無い`).toBeDefined();
      expect(PO_BOX[emotion].height).toBeGreaterThan(0);
    }
  });

  it("合わせると、どの状態も同じ高さに揃う", () => {
    /*
      合わせる前は 57.6%（talking）〜78.7%（question）で、
      いちばん小さいものと大きいもので4割近く違っていた。
    */
    for (const emotion of PO_EMOTIONS) {
      expect(placed(emotion).height, `${emotion} の背丈がずれている`).toBeCloseTo(
        PO_REFERENCE.height,
        1,
      );
    }
  });

  it("合わせると、どの状態も同じ場所に立つ", () => {
    // 中心がずれると、入れ替わった瞬間に横や上下へ跳ねる
    for (const emotion of PO_EMOTIONS) {
      const { cx, cy } = placed(emotion);
      expect(cx, `${emotion} の左右がずれている`).toBeCloseTo(PO_REFERENCE.cx, 1);
      expect(cy, `${emotion} の上下がずれている`).toBeCloseTo(PO_REFERENCE.cy, 1);
    }
  });

  it("neutral は動かさない", () => {
    // 合わせる先そのものなので、変形は掛からない
    const { dx, dy, scale } = parse(poTransform("neutral"));
    expect(dx).toBeCloseTo(0, 2);
    expect(dy).toBeCloseTo(0, 2);
    expect(scale).toBeCloseTo(1, 4);
  });

  it("いちばん小さい絵は、拡大して合わせる", () => {
    /*
      talking と blink は小さく描かれている。ここが1.0のままだと、
      「合わせているつもりで何もしていない」ことになる。
    */
    expect(parse(poTransform("talking")).scale).toBeGreaterThan(1.1);
    expect(parse(poTransform("blink")).scale).toBeGreaterThan(1.1);
  });
});
