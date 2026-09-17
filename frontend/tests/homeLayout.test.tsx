/**
 * ホームの並び。
 *
 * ここは「ダッシュボード」ではなく、**今日のつづきをやりに戻ってくる
 * 場所**。作り直しで守ると決めたのは6つ。
 *
 *   1. 開いた直後に見えるのは あいさつ → 今日の1本 → はじめるボタン
 *   2. 今日の1本が主役。記録より前に出す
 *   3. ポーは1体だけ。吹き出しで1画面を使い切らない
 *   4. 今日の1本の絵は、横いっぱいに敷かない（1画面を占有しない）
 *   5. **積むものを4つに絞る**。送らずに全部見えることを保つため
 *   6. 「身についたこと／今週」で**「AI技」とは書かない**
 *
 * 5 が今回の作り直しの中心。前はこの下に「そろそろもう一度」「飛ばした
 * 解説」「ほかにも見る」「学習の道のり」が積まれていて、実測で 390×844
 * の下が切れていた。**消したのではなく、移した**——行き先はどれも
 * 下タブの中にあり、そちらで使えることは `e2e/homeMoved.spec.ts` が見る。
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import { forgetGuestSeen } from "../src/course/diagnosisNudge";
import { resetCatalog } from "../src/course/live";

describe("ホームの並び", () => {
  beforeEach(() => {
    window.localStorage.clear();
    /*
      この回のあいだの控えも落とす。端末の控えと別に持っているので
      （`course/diagnosisNudge.ts`）、これが残ると2回目からようこそが
      出ない。
    */
    forgetGuestSeen();
    resetCatalog();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetCatalog();
  });

  const openHome = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<App />);
    /*
      ようこそ → （案内）→ ホーム。

      入口が2枚あるので、押すのも2回になることがある。案内は
      **出ていたら閉じる**形にしてある——見た印が端末に残っている
      回では出ないので、決め打ちにすると落ちる。
    */
    await user.click(await screen.findByTestId("welcome-guest"));
    const later = screen.queryByTestId("diagnosis-intro-later");
    if (later) await user.click(later);
    await screen.findByTestId("next-up");
  };

  it("上から、あいさつ → 今日の1本 → これまでの記録 の順に並ぶ", async () => {
    /*
      順番そのものを見る。「今日の1本」へ着くまでにスクロールが要る
      並びに戻っていないこと。

      記録と数字は後ろ。どれも「ここまでの自分」の話で、**まだ今日を
      始めていない人に先に見せるもの**ではない。
    */
    const user = userEvent.setup();
    await openHome(user);

    const order = ["home-greeting", "next-up", "progress-summary"];
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

  it("これまでの記録は、3つの数を1行に収める", async () => {
    /*
      前は「進み具合の帯」「◯/◯ レッスン完了」「数字の札2枚」で
      3段になっていて、**同じ話が3回**出たうえに 150px を使っていた。
      そのぶん主役が上へ追いやられ、下が画面から出ていた。

      いまは枠1つ。中は3つに区切るだけで、縦には積まない。
    */
    const user = userEvent.setup();
    await openHome(user);

    const record = screen.getByTestId("progress-summary");
    expect(within(record).getAllByRole("button")).toHaveLength(3);
    expect(record).toHaveTextContent("レッスン完了");
    expect(record).toHaveTextContent("身についたこと");
    expect(record).toHaveTextContent("今週");
    // 学びの画面で数える話ではない
    expect(record).not.toHaveTextContent("Credit");
  });

  it("3つの数に「AI技」とは書かない", async () => {
    /*
      同じものを図鑑の中では技として扱うが、毎日ひらく場所に AI の語を
      並べると、学習アプリではなく AI の道具箱に見える。
    */
    const user = userEvent.setup();
    await openHome(user);

    const skills = screen.getByTestId("stat-skills");
    expect(skills).toHaveTextContent("身についたこと");
    expect(skills).not.toHaveTextContent("AI技");
  });

  it("積むのは4つまで。移したものは、ホームに戻さない", async () => {
    /*
      **今回の作り直しの中心。** 送らずに全部見えることを保つため、
      ホームに置くのは 帯・あいさつ・今日の1本・記録 の4つだけにした。

      移した先で使えることは `e2e/homeMoved.spec.ts` が見る。ここでは
      **戻ってきていないこと**だけを見張る——積み直すのは簡単なので、
      気づける場所を1つ置いておく。
    */
    const user = userEvent.setup();
    await openHome(user);

    expect(screen.queryByTestId("review-prompt")).not.toBeInTheDocument();
    expect(screen.queryByText("ほかにも見る")).not.toBeInTheDocument();
    expect(screen.queryByTestId("open-path")).not.toBeInTheDocument();
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

      いまは今日の1本だけ。記録の3つも、線で囲うだけで浮かせない。

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

  it("記録への入口は残す", async () => {
    /*
      数字を見て「もっと見たい」と思う場所はここ。数だけ見せて終わりに
      すると、「5」が何のことか確かめる道が無くなる。
    */
    const user = userEvent.setup();
    await openHome(user);

    await user.click(screen.getByTestId("stat-done"));

    expect(
      await screen.findByRole("heading", { name: "学習記録" }),
    ).toBeInTheDocument();
  });
});
