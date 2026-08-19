/**
 * 教材を探す。
 *
 * 9件しか無いので目次でも足りる、とは言えない。「請求書」「議事録」の
 * ように**やりたいことの言葉**で来る人は、題（「文章を書き直す」）と
 * 自分の言葉が一致せず、合う1本にたどり着けない。
 *
 * ここで守るのは4つ。
 *
 *   1. 用途の言葉（タグ）で当たること
 *   2. 打ち方の違いで結果が変わらないこと（メール／めーる／ＡＩ）
 *   3. 語を足したら絞られること（増えないこと）
 *   4. 空のときは全件に戻ること
 */

import { describe, expect, it } from "vitest";

import { normalize, searchLessons } from "../src/course/search";
import type { Lesson } from "../src/course/types";

function lesson(over: Partial<Lesson> & { id: string }): Lesson {
  return {
    number: 1,
    title: "",
    goal: "",
    outcomes: [],
    tags: [],
    usesAi: true,
    steps: [],
    ...over,
  } as Lesson;
}

const LESSONS = [
  lesson({
    id: "rewrite_text",
    number: 1,
    title: "文章を書き直す",
    goal: "そのまま送れる文にする",
    tags: ["メール", "ビジネス"],
  }),
  lesson({
    id: "summarize_text",
    number: 2,
    title: "長い文をまとめる",
    goal: "要点だけ取り出す",
    tags: ["議事録", "資料"],
  }),
  lesson({
    id: "safety",
    number: 3,
    title: "気をつけること",
    goal: "AIに入れてはいけないものを知る",
    tags: [],
    usesAi: false,
  }),
];

const ids = (query: string) => searchLessons(LESSONS, query).map((l) => l.id);

describe("用途の言葉で探す", () => {
  it("タグに当たる", () => {
    /*
      題は「文章を書き直す」。この人が打つのは「メール」。
      タグを見ないと、一番効く手がかりを捨てることになる。
    */
    expect(ids("メール")).toEqual(["rewrite_text"]);
  });

  it("ねらいの文にも当たる", () => {
    expect(ids("要点")).toEqual(["summarize_text"]);
  });

  it("題にも当たる", () => {
    expect(ids("書き直す")).toEqual(["rewrite_text"]);
  });
});

describe("打ち方の違いを吸収する", () => {
  it("カタカナとひらがなで同じ結果になる", () => {
    // 打ち直させない
    expect(ids("めーる")).toEqual(ids("メール"));
  });

  it("全角と半角で同じ結果になる", () => {
    expect(ids("ＡＩ")).toEqual(ids("AI"));
  });

  it("大文字と小文字で同じ結果になる", () => {
    expect(ids("ai")).toEqual(ids("AI"));
  });

  it("normalize は濁点の分かれ方もそろえる", () => {
    /*
      「が」には2通りの持ち方がある。1文字の U+304C と、
      「か」+ 濁点（U+3099）に分かれた形。見た目は同じなので、
      分かれた形で貼り付けた人は「打った字が当たらない」としか思えない。

      ここは文字をそのまま書かない——エディタや保存の際にどちらかへ
      寄ってしまい、確かめたつもりが確かめられなくなる。
    */
    const composed = "\u304c";
    const decomposed = "\u304b\u3099";

    expect(composed).not.toBe(decomposed);
    expect(normalize(decomposed)).toBe(normalize(composed));
  });
});

describe("絞り込み", () => {
  it("語を足すと絞られる", () => {
    /*
      OR にすると、語を足すほど結果が増える。
      絞るつもりで打った人の期待と逆になる。
    */
    const one = ids("文");
    const two = ids("文 まとめる");

    expect(two.length).toBeLessThanOrEqual(one.length);
    expect(two).toEqual(["summarize_text"]);
  });

  it("当てはまらない語では0件になる", () => {
    expect(ids("そんな教材はない")).toEqual([]);
  });
});

describe("空のとき", () => {
  it("全件に戻る", () => {
    expect(ids("")).toEqual(LESSONS.map((l) => l.id));
  });

  it("空白だけでも全件に戻る", () => {
    // 打ちかけて消した状態。ここで0件になると、消えたように見える
    expect(ids("   ")).toEqual(LESSONS.map((l) => l.id));
  });

  it("並び順を変えない", () => {
    /*
      一致の強さで並べ替えると、さっき見た位置に無くなる。
    */
    expect(ids("")).toEqual(["rewrite_text", "summarize_text", "safety"]);
  });
});
