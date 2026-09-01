/**
 * 見比べる画面。
 *
 * このアプリでいちばん大事な気づきの場面（条件を1つ足すと結果が変わる）。
 * 見張るのは3つ。
 *
 *   1. 「何を変えたから、どう変わったのか」が1枚で組み上がること
 *   2. 長い文が2つ来ても、狭い画面で見比べられること
 *   3. 測って分かる差が無いときも、黙って消えないこと
 *
 * 置き場所が変わった
 * ------------------
 * 1 と 3 と「元からの道のり」は、画面ではなく**「変わったところを見る」で
 * 開く一枚**の中にある。レッスンは1画面＝1アクションに収めると決めたので、
 * 縦に積むと肝心の「2つを見比べる」が押し出される（実測で、比べる面が
 * 32px まで潰れていた）。**中身は減っていない**ので、開いてから見る。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ThreeWayCompare } from "../src/components/course/steps/Compare";

/** 「変わったところを見る」を開く。 */
async function openDetails() {
  await userEvent.setup().click(screen.getByTestId("compare-more"));
}

const LONG_FIRST =
  "明日の会議についてご連絡いたします。開始時間は10時を予定しております。" +
  "場所は3階の会議室となりますので、お間違えのないようお願いいたします。";
const LONG_IMPROVED =
  "明日の会議のご連絡です。10時から、3階会議室で行います。" +
  "資料は当日お配りしますので、手ぶらでお越しください。よろしくお願いします。";

describe("何を変えたから、どう変わったのか", () => {
  it("原因と結果を、同じ1枚に並べる", async () => {
    /*
      前は「追加した条件」が矢印の下、変わった中身が別の枠にあり、
      原因と結果が離れていた。離れていると、片方だけ読んで終わる。
    */
    render(
      <ThreeWayCompare
        original="もと"
        first={LONG_FIRST}
        improved={LONG_IMPROVED}
        condition="もっと短く"
      />,
    );

    await openDetails();

    /*
      「何を変えた？」と「どう変わった？」は、開いた一枚の中で隣に並ぶ。
      離して置くと、片方だけ読んで終わる。
    */
    const sheet = screen.getByTestId("more-sheet");
    expect(screen.getByTestId("compare-why")).toHaveTextContent("何を変えた？");
    expect(screen.getByTestId("added-condition")).toHaveTextContent("もっと短く");
    expect(sheet).toHaveTextContent("どう変わった？");
  });

  it("測って分かる差が無くても、黙って消えない", async () => {
    /*
      隣が空欄だと、測れなかったのか変わらなかったのかが分からない。
      分からないことは分からないと書く。
    */
    render(
      <ThreeWayCompare
        original="もと"
        first="おはようございます。よろしくお願いします。"
        improved="おはようございます。よろしくおねがいします。"
        condition="やわらかく"
      />,
    );

    await openDetails();

    expect(screen.getByTestId("change-points")).toHaveTextContent(
      "見比べてみてください",
    );
  });

  it("条件を足していないときも、そう書く", async () => {
    render(
      <ThreeWayCompare original="もと" first="いち" improved="に" condition="" />,
    );

    await openDetails();

    expect(screen.getByTestId("added-condition")).toHaveTextContent(
      "条件は足していません",
    );
  });
});

describe("狭い画面で見比べる", () => {
  it("長い文が2つ来たら、タブで入れ替える", () => {
    /*
      縦に積むと1回目と改善後が画面2つぶん離れ、**スクロールしないと
      見比べられない**——見比べる画面なのに、同時に見えない。
    */
    render(
      <ThreeWayCompare
        original="もと"
        first={LONG_FIRST}
        improved={LONG_IMPROVED}
        condition="もっと短く"
      />,
    );

    const tabs = screen.getByTestId("compare-tabs");
    expect(tabs).toBeInTheDocument();
    expect(
      screen.getAllByRole("tab").map((tab) => tab.textContent),
    ).toEqual(["最初", "改善後"]);
  });

  it("両方短いときは、タブにしない", () => {
    // いっぺんに見えるほうが速い。タップを1回増やさない
    render(
      <ThreeWayCompare
        original="もと"
        first="10時からです。"
        improved="10時開始です。"
        condition="もっと短く"
      />,
    );

    expect(screen.queryByTestId("compare-tabs")).not.toBeInTheDocument();
  });

  it("元からの道のりは、一枚の中で縦に並べる", async () => {
    /*
      前は画面の中で横へ流していた（390px で3列に割ると1列は約110px
      にしかならないため）。いまは開いた一枚の中にあり、幅が使えるので
      縦に並べる——横流しは「そこにもある」ことに気づきにくい。
    */
    render(
      <ThreeWayCompare
        original="もと"
        first={LONG_FIRST}
        improved={LONG_IMPROVED}
        condition="もっと短く"
      />,
    );

    await openDetails();

    expect(screen.getByTestId("compare-original")).toHaveTextContent("もと");
    expect(screen.getByTestId("compare-improved")).toHaveTextContent(
      LONG_IMPROVED.slice(0, 10),
    );
  });
});
