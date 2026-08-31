/**
 * ホームの並び。
 *
 * ここは「ダッシュボード」ではなく、**次に何をするか**を出す画面。
 * 作り直しで守ると決めたのは6つ。
 *
 *   1. 今日の1本が主役。あいさつのすぐ下に置き、記録より前に出す
 *   2. ポーは案内役。大きな見出しと吹き出しで1画面を使い切らない
 *   3. 今日の1本の絵は、横いっぱいに敷かない（1画面を占有しない）
 *   4. ホームに**全レッスンの一覧は出さない**（順番は道のりの画面が持つ）
 *   5. 道のりへの入口は、ホームから1回で届く
 *   6. 続けた日数と終えた本数は、小さく1行で出す
 *
 * 4 と 5 は対になっている。一覧を畳んだ代わりに、入口は必ず残す
 * ——畳んだうえに入口も消すと、全体の順番を見る手段が無くなる。
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import { COURSE } from "../src/course/catalog";
import { resetCatalog } from "../src/course/live";

describe("ホームの並び", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetCatalog();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetCatalog();
  });

  const openHome = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<App />);
    await user.click(screen.getAllByRole("button", { name: "はじめる" })[0]);
    await screen.findByTestId("next-up");
  };

  it("上から、あいさつ → 今日の1本 → これまで の順に並ぶ", async () => {
    /*
      順番そのものを見る。「今日の1本」へ着くまでにスクロールが要る
      並びに戻っていないこと。

      前は 記録の1行（progress-summary）が今日の1本より上にあった。
      下げた——どれも「ここまでの自分」の話で、**まだ今日を始めて
      いない人に先に見せるもの**ではない。
    */
    const user = userEvent.setup();
    await openHome(user);

    const order = ["home-greeting", "next-up", "progress-summary", "path-progress"];
    const positions = order.map((id) => {
      const el = screen.getByTestId(id);
      return { id, el };
    });

    for (let i = 0; i < positions.length - 1; i += 1) {
      const before = positions[i];
      const after = positions[i + 1];
      expect(
        before.el.compareDocumentPosition(after.el) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        `${after.id} が ${before.id} より前に出ている`,
      ).toBeTruthy();
    }
  });

  it("ポーのあいさつは、大きな見出しを持たない", async () => {
    /*
      前は「こんにちは！ / ポーです」という h1 と、その下に吹き出しが
      あった。見出しと吹き出しで同じことを二度言い、開いた直後の
      1画面をほぼ使い切っていた。ひとことだけにする。
    */
    const user = userEvent.setup();
    await openHome(user);

    const greeting = screen.getByTestId("home-greeting");
    expect(within(greeting).queryByRole("heading")).not.toBeInTheDocument();
    expect(within(greeting).getByTestId("po-avatar")).toBeInTheDocument();
    expect(within(greeting).getByTestId("po-hero-message")).toBeInTheDocument();
  });

  it("今日の1本の絵は、横いっぱいに敷かない", async () => {
    /*
      横いっぱいの 4:3 は、390px の画面でおよそ 260px の高さになる。
      題・ねらい・ボタンと合わせると、このカード1枚で1画面が埋まる。
    */
    const user = userEvent.setup();
    await openHome(user);

    const thumb = within(screen.getByTestId("next-up")).getByTestId(
      "lesson-thumbnail",
    );
    expect(thumb.className).not.toContain("w-full");
    expect(thumb.className).toContain("w-[38%]");
    // 引き伸ばさない（ポーが歪まない）。縦横比はここが決めている
    expect(thumb.className).toContain("aspect-[4/3]");
  });

  it("全レッスンの一覧は出さない", async () => {
    /*
      順番と現在地は道のりの画面が持つ。両方に置くと、片方を直したときに
      もう片方がずれる。ホームに出すのは「次の1本」だけ。
    */
    const user = userEvent.setup();
    await openHome(user);

    expect(screen.queryByTestId("course-outline")).not.toBeInTheDocument();

    // 9本ぶんの行がホームに並んでいないこと
    const rows = screen
      .queryAllByRole("button")
      .filter((el) => el.dataset.testid?.startsWith("lesson-"));
    expect(rows).toHaveLength(0);
  });

  it("「道のりを見る」で、コースの道のりへ1回で着く", async () => {
    // 一覧を畳んだ代わりに、入口は必ず残す（憲章 原則 I）
    const user = userEvent.setup();
    await openHome(user);

    await user.click(screen.getByTestId("open-path"));

    expect(await screen.findByTestId("course-outline")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: COURSE.title }),
    ).toBeInTheDocument();
  });

  it("続けた日数と終えた本数は、1行にまとめる", async () => {
    const user = userEvent.setup();
    await openHome(user);

    const stats = screen.getByTestId("progress-summary");
    expect(stats).toHaveTextContent("日連続");
    expect(stats).toHaveTextContent("レッスン完了");
  });

  it("面で囲うのは、今日の1本だけ", async () => {
    /*
      白い面が2つ3つと浮くと、どれが本題かが分からなくなる。
      前は 今日の1本・道のり・おすすめ2件・カテゴリ6件 で、
      **10枚の浮いた面**がホームに並んでいた。

      影（shadow-card）の有無で数える。囲うかどうかを決めているのは
      そこで、線や角丸は札にも付くため。
    */
    const user = userEvent.setup();
    await openHome(user);

    const floating = Array.from(
      document.querySelectorAll<HTMLElement>(".shadow-card"),
    );

    expect(floating).toHaveLength(1);
    expect(floating[0].dataset.testid).toBe("next-up");
  });

  it("カテゴリは、2列のカードではなく札で並べる", async () => {
    /*
      6枚のカードが2列に並ぶと、面積では画面のいちばん下の節が
      いちばん大きくなる。ここは見つからなかったときの逃げ道で、
      そこまで場所を取ってよい節ではない。
    */
    const user = userEvent.setup();
    await openHome(user);

    const list = screen
      .getByRole("heading", { name: "カテゴリから探す" })
      .closest("section")!
      .querySelector("ul")!;

    expect(list.className).not.toContain("grid-cols-2");
    expect(list.className).toContain("flex-wrap");
  });

  it("記録への入口は残す", async () => {
    /*
      節を畳んだときに、入口まで一緒に消さない。
      学習記録は下タブから外したので、**ここと その他 の2か所**が
      入口になる。数字を見て「もっと見たい」と思う場所はここ。
    */
    const user = userEvent.setup();
    await openHome(user);

    await user.click(screen.getByTestId("open-record"));

    expect(
      await screen.findByRole("heading", { name: "学習記録" }),
    ).toBeInTheDocument();
  });
});
