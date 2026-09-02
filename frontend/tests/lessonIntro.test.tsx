/**
 * レッスンの入口を、二段の一枚にした。
 *
 *   導入 … 中央に浮かぶ小さな一枚。見出し・一言・できること2つ・
 *          「さっそく試す」。開いた瞬間に自分から出る
 *   詳細 … 「詳しく見る」を押した人にだけ、画面いっぱいの一枚で
 *          ねらい・完成イメージ・流れ・覚えるAI技を全部
 *
 * 見張るのは4つ。
 *
 *   1. 開いた最初に導入が出て、押す先が1つに絞られていること
 *   2. 「さっそく試す」で閉じて、そのまま次へ進むこと
 *   3. 「詳しく見る」で詳細が上に重なり、閉じれば導入へ戻ること
 *   4. 一枚が開いているあいだ、**後ろの画面が送れない**こと
 *
 * 4 は目で気づけない。スマホで一枚の中を送りきると、そのまま後ろの
 * 画面が動き出す（scroll chaining）。閉じたときに元と違う場所に居る
 * ので、開いた人からは「勝手に飛んだ」に見える。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OutcomePreview } from "../src/components/course/steps/Outcome";

const DETAIL = {
  goal: "むずかしい文章を、意味を変えずに分かりやすくする",
  before: "自己注意機構は……",
  after: "AIは文の中の言葉どうしを見比べて……",
  skills: ["読む相手を伝える"],
  outcomes: [
    "むずかしい文章を、意味を変えずに分かりやすくできる",
    "読む相手を伝えて、説明のしかたを変えられる",
    "言い方を指定して、伝わり方を整えられる",
  ],
  flow: ["ためす", "くらべる", "しあげる"],
};

function renderOutcome(
  onStart?: () => void,
  extra?: { introSeen?: boolean; onIntroSeen?: () => void },
) {
  return render(
    <OutcomePreview
      eyebrow="Lesson 1"
      title="専門的な文章を、誰にでも伝わる文章に変える"
      description="読む相手と言い方を伝えて、意味を変えずに分かりやすくします。"
      poMessage="いっしょにやってみよう"
      onStart={onStart}
      {...extra}
      {...DETAIL}
    />,
  );
}

afterEach(() => {
  document.body.style.overflow = "";
});

describe("レッスンの入口", () => {
  it("開いた最初に、導入の一枚が自分から出る", () => {
    renderOutcome();

    const intro = screen.getByTestId("lesson-intro");
    expect(intro).toBeInTheDocument();
    expect(screen.getByTestId("lesson-intro-sheet")).toHaveAttribute(
      "data-placement",
      "center",
    );
  });

  it("戻ってきた人には、もう一度かぶせない", () => {
    /*
      最初の画面は、進んで戻ってくるたびに作り直される。そこで
      「開いたら出す」だけにしていると、**自分で戻った人**に今日
      やることをもう一度かぶせることになる。出すのはレッスンを
      開いた1回（覚えているのは LessonRunner）。
    */
    const seen = vi.fn();
    renderOutcome(undefined, { introSeen: true, onIntroSeen: seen });

    expect(screen.queryByTestId("lesson-intro")).toBeNull();
    expect(seen).not.toHaveBeenCalled();
    expect(screen.getByTestId("outcome-preview")).toBeInTheDocument();
  });

  it("出したことを1つ上へ伝える", () => {
    const seen = vi.fn();
    renderOutcome(undefined, { onIntroSeen: seen });

    expect(screen.getByTestId("lesson-intro")).toBeInTheDocument();
    expect(seen).toHaveBeenCalled();
  });

  it("導入に置くのは、できること2つまで", () => {
    /*
      3つ目からは「詳しく見る」の中にある。ここは**始めるか決める
      材料**で、一覧ではない。全部並べると、始める前に読み物が1本になる。
    */
    renderOutcome();

    const lines = screen.getByTestId("lesson-intro-outcomes");
    expect(lines.children).toHaveLength(2);
    expect(lines).toHaveTextContent(DETAIL.outcomes[0]);
    expect(lines).not.toHaveTextContent(DETAIL.outcomes[2]);
  });

  it("「さっそく試す」で閉じて、そのまま次の画面へ進む", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderOutcome(onStart);

    await user.click(screen.getByTestId("lesson-intro-start"));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("lesson-intro")).toBeNull();
  });

  it("閉じても行き止まりにしない（後ろの画面が残る）", async () => {
    /*
      ×で閉じた人を、何も無い場所に置かない。後ろにはこの画面が
      あって、下の帯に同じ「さっそく試す」がある。
    */
    const user = userEvent.setup();
    renderOutcome();

    await user.click(screen.getByTestId("lesson-intro-close"));

    expect(screen.queryByTestId("lesson-intro")).toBeNull();
    expect(screen.getByTestId("outcome-preview")).toBeInTheDocument();
  });

  it("「詳しく見る」で、画面いっぱいの一枚に全部出る", async () => {
    const user = userEvent.setup();
    renderOutcome();

    await user.click(screen.getByTestId("lesson-intro-detail"));

    expect(screen.getByTestId("lesson-detail-sheet")).toHaveAttribute(
      "data-placement",
      "full",
    );
    expect(screen.getByTestId("outcome-goal")).toHaveTextContent(DETAIL.goal);
    expect(screen.getByTestId("outcome-before")).toBeInTheDocument();
    expect(screen.getByTestId("outcome-after")).toBeInTheDocument();
    expect(screen.getByTestId("outcome-flow")).toBeInTheDocument();
    // 導入は下に残る。閉じれば読んでいた続きから始められる
    expect(screen.getByTestId("lesson-intro")).toBeInTheDocument();
  });

  it("Esc は、いちばん上の一枚だけを閉じる", async () => {
    const user = userEvent.setup();
    renderOutcome();
    await user.click(screen.getByTestId("lesson-intro-detail"));

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("lesson-detail")).toBeNull();
    expect(screen.getByTestId("lesson-intro")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("lesson-intro")).toBeNull();
  });

  it("一枚は読み上げの区切りになっている（dialog）", () => {
    /*
      `aria-modal` が無いと、読み上げが後ろの画面まで読み続ける。
      同じ見出しが2回出るのは、後ろにも同じ題があるため。
    */
    renderOutcome();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent("Lesson 1");
  });

  it("2枚重なっても、見出しの名前が混ざらない", async () => {
    /*
      id を決め打ちにしていると、上に重ねた一枚が**下の一枚の名前**で
      読み上げられる（`aria-labelledby` は最初の1つを拾うため）。
    */
    const user = userEvent.setup();
    renderOutcome();
    await user.click(screen.getByTestId("lesson-intro-detail"));

    const ids = screen
      .getAllByRole("dialog")
      .map((dialog) => dialog.getAttribute("aria-labelledby"));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("一枚が開いているあいだ、後ろの画面は送れない", async () => {
    const user = userEvent.setup();
    renderOutcome();

    // 導入が出た時点で、もう止まっている
    expect(document.body.style.overflow).toBe("hidden");

    // 上に重ねても、閉じるのは上の一枚だけ。まだ止めたまま
    await user.click(screen.getByTestId("lesson-intro-detail"));
    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("hidden");

    // 全部閉じて、はじめて戻す
    await user.click(screen.getByTestId("lesson-intro-close"));
    expect(document.body.style.overflow).toBe("");
  });
});
