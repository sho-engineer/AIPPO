/**
 * ホームの並び。
 *
 * ここは「ダッシュボード」ではなく、**今日のつづきをやりに戻ってくる
 * 場所**。作り直しで守ると決めたのは7つ。
 *
 *   1. 開いた直後に見えるのは あいさつ → 今日の1本 → はじめるボタン
 *   2. 今日の1本が主役。記録より前に出す
 *   3. ポーは1体だけ。吹き出しで1画面を使い切らない
 *   4. 今日の1本の絵は、横いっぱいに敷かない（1画面を占有しない）
 *   5. ホームに**全レッスンの一覧は出さない**（順番は道のりの画面が持つ）
 *   6. 道のり・記録への入口は、ホームから1回で届く
 *   7. 「身についたこと／今週の学習」で**「AI技」とは書かない**
 *
 * 5 と 6 は対になっている。一覧を畳んだ代わりに、入口は必ず残す
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

  it("上から、あいさつ → 今日の1本 → これまで → 2つの数字 の順に並ぶ", async () => {
    /*
      順番そのものを見る。「今日の1本」へ着くまでにスクロールが要る
      並びに戻っていないこと。

      記録と数字は後ろ。どれも「ここまでの自分」の話で、**まだ今日を
      始めていない人に先に見せるもの**ではない。
    */
    const user = userEvent.setup();
    await openHome(user);

    const order = [
      "home-greeting",
      "next-up",
      "progress-summary",
      "skill-summary",
      "week-summary",
    ];
    const positions = order.map((id) => ({ id, el: screen.getByTestId(id) }));

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

  it("見出しは、迎える一言ひとつ", async () => {
    /*
      前は「こんにちは！ / ポーです」という h1 と、その下に吹き出しが
      あった。見出しと吹き出しで同じことを二度言い、開いた直後の
      1画面をほぼ使い切っていた。

      いまは見出しが**迎える一言**を持ち、ポーは横で短く添える。
      初めての人に「おかえり」とは言わない。
    */
    const user = userEvent.setup();
    await openHome(user);

    const greeting = screen.getByTestId("home-greeting");
    const headings = within(greeting).getAllByRole("heading");

    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("はじめまして");
    expect(within(greeting).getByTestId("po-avatar")).toBeInTheDocument();
    expect(within(greeting).getByTestId("po-hero-message")).toBeInTheDocument();
  });

  it("ポーは1体だけ", async () => {
    // 何体も置くと、案内役ではなく壁紙になる
    const user = userEvent.setup();
    await openHome(user);

    expect(screen.getAllByTestId("po-avatar")).toHaveLength(1);
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

  it("今日の1本は、かかる時間と何日目かを出す", async () => {
    // 押す前に決める材料。始めてから「思ったより長い」と気づかせない
    const user = userEvent.setup();
    await openHome(user);

    const card = screen.getByTestId("next-up");
    expect(card).toHaveTextContent(/約\d+分/);
    expect(card).toHaveTextContent(/Day\s*\d+\s*\/\s*\d+/);
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

  it("これまでの記録は、終えた本数だけを出す", async () => {
    /*
      前はここに「あと3レッスンで 1 Credit」まで出していた。学びの画面で
      数える話ではないうえ、進み具合の意味が「あと何回でもらえるか」に
      すり替わる。
    */
    const user = userEvent.setup();
    await openHome(user);

    const record = screen.getByTestId("progress-summary");
    expect(record).toHaveTextContent("レッスン完了");
    expect(record).not.toHaveTextContent("Credit");
  });

  it("2つの数字に「AI技」とは書かない", async () => {
    /*
      同じものを図鑑の中では技として扱うが、毎日ひらく場所に AI の語を
      並べると、学習アプリではなく AI の道具箱に見える。
    */
    const user = userEvent.setup();
    await openHome(user);

    const skills = screen.getByTestId("skill-summary");
    expect(skills).toHaveTextContent("身についたこと");
    expect(skills).not.toHaveTextContent("AI技");

    expect(screen.getByTestId("week-summary")).toHaveTextContent("今週の学習");
  });

  it("測っていない数字を出さない", async () => {
    /*
      支給デザインには「学習時間 2時間15分」がある。このアプリは滞在
      時間を測っていないので、出すなら数え始めるところからになる。
    */
    const user = userEvent.setup();
    await openHome(user);

    expect(screen.queryByText(/学習時間/)).not.toBeInTheDocument();
    expect(screen.queryByText(/時間\d+分/)).not.toBeInTheDocument();
  });

  it("面で囲うのは、今日の1本だけ", async () => {
    /*
      白い面が並ぶほど、どれが本題かが分からなくなる。前は
      今日の1本・道のり・おすすめ2件・カテゴリ6件 で、**10枚の浮いた面**
      がホームに並んでいた。

      いまは今日の1本だけ。記録も、2つの数字も、「ほかにも見る」も、
      線と余白で区切る（数字の2枚は器として線で囲うが、浮かせない）。

      影（shadow-card）の有無で数える。囲うかどうかを決めているのは
      そこで、線や角丸は札にも付くため。ポーの吹き出しは面ではなく
      **しゃべっている印**なので、ここには数えるが1つに収める。
    */
    const user = userEvent.setup();
    await openHome(user);

    const floating = Array.from(
      document.querySelectorAll<HTMLElement>(".shadow-card"),
    ).map((el) => el.dataset.testid);

    expect(floating).toEqual(["po-hero-message", "next-up"]);
  });

  it("「ほかにも見る」は、2列で4つまで", async () => {
    /*
      前は6つを札で折り返して並べていた。字の長さで幅が変わるので列が
      そろわず、いちばん下の節がいちばん賑やかに見えていた。
      **探すのはホームの主役ではない。**残りは「すべて見る」の先。
    */
    const user = userEvent.setup();
    await openHome(user);

    const list = screen
      .getByRole("heading", { name: "ほかにも見る" })
      .closest("section")!
      .querySelector("ul")!;

    expect(list.className).toContain("grid-cols-2");
    expect(list.querySelectorAll("li")).toHaveLength(4);
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
