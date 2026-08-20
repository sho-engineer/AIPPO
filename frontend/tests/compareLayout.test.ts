/**
 * 見比べを横に並べてよいかの判定。
 *
 * 守るのは「長い文章をスマホで細い2列にしない」こと。
 * 1列は 390px の画面でおよそ12文字/行しか入らないので、
 * 段落を入れると10行の柱になり、読み比べにならない。
 */

import { describe, expect, it } from "vitest";

import { SHORT_TEXT_LIMIT, fitsSideBySide } from "../src/course/compareLayout";

const long =
  "AIを使えば、情報整理や文章作成、アイデア出しがぐっと楽になります。" +
  "まずは小さく試して、少しずつ日々の業務に取り入れていきましょう。";

describe("狭い画面で横に並べてよいか", () => {
  it("両方が短ければ並べる", () => {
    expect(fitsSideBySide("短くまとめました。", "もっと短くしました。")).toBe(true);
  });

  it("片方でも長ければ、縦に積む", () => {
    /*
      段違いを避けるため、片方だけの長さでも縦にする。
      長いほうに合わせて短いほうの下が空くと、比べる相手を見失う。
    */
    expect(fitsSideBySide("短い文です。", long)).toBe(false);
    expect(fitsSideBySide(long, "短い文です。")).toBe(false);
  });

  it("改行を含むものは、字数にかかわらず縦に積む", () => {
    // 箇条書きは1行が短くても行数が伸びる。細い列だと柱が2本になる
    expect(fitsSideBySide("・短い\n・短い", "・短い\n・短い")).toBe(false);
  });

  it("境目のちょうどは並べる", () => {
    const edge = "あ".repeat(SHORT_TEXT_LIMIT);
    expect(fitsSideBySide(edge, edge)).toBe(true);
  });

  it("境目を1字でも超えたら積む", () => {
    const over = "あ".repeat(SHORT_TEXT_LIMIT + 1);
    expect(fitsSideBySide(over, "短い")).toBe(false);
  });

  it("まだ結果が無いときも壊れない", () => {
    // 1回目を送る前は空。空は「短い」ので並べてよい
    expect(fitsSideBySide("", "")).toBe(true);
  });
});
