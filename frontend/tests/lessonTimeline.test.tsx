/**
 * コースの道のり（縦一本の並び）。
 *
 * ここで守るのは7つ。
 *
 *   1. 状態は**教材データと進捗**が決める（絵の有無では決めない）
 *   2. 終えた回は、あとから近日公開に戻されても「完了」のまま
 *      ——ただし押せない（押した先が行き止まりにならない）
 *   3. 一覧に絵は置かない（ここは「探す」場所ではない）
 *   4. 進む口が出るのは**いまの1本だけ**
 *   5. 状態を色だけで言わない。必ず文字を添える
 *   6. 終えた回に、いつやったかは出さない
 *   7. Day・節・題の桁が全行でそろう
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  LessonTimeline,
  statusOf,
} from "../src/components/lessons/LessonTimeline";
import { COURSE } from "../src/course/catalog";
import type { Lesson } from "../src/course/types";

const lessonOf = (id: string): Lesson =>
  COURSE.lessons.find((entry) => entry.id === id)!;

const REWRITE = lessonOf("rewrite_text");
const SUMMARIZE = lessonOf("summarize_text");

/** 近日公開に倒した写し。同梱データは書き換えない。 */
const soonOf = (lesson: Lesson): Lesson => ({
  ...lesson,
  availability: "coming_soon",
  plannedReleaseDate: "2026-09-01",
});

function renderTimeline(
  lessons: Lesson[],
  {
    completed = [] as string[],
    currentId = null as string | null,
    onSelect = vi.fn(),
    onToggleBookmark,
  }: {
    completed?: string[];
    currentId?: string | null;
    onSelect?: (id: string) => void;
    onToggleBookmark?: (id: string) => void;
  } = {},
) {
  render(
    <LessonTimeline
      lessons={lessons}
      completed={completed}
      currentId={currentId}
      bookmarked={() => false}
      onToggleBookmark={onToggleBookmark}
      onSelect={onSelect}
    />,
  );
}

describe("状態の決まり方", () => {
  it("進捗と教材データだけで決まる", () => {
    expect(statusOf(REWRITE, ["rewrite_text"], null)).toBe("completed");
    expect(statusOf(REWRITE, [], "rewrite_text")).toBe("current");
    expect(statusOf(REWRITE, [], "summarize_text")).toBe("available");
    expect(statusOf(soonOf(REWRITE), [], null)).toBe("coming_soon");
  });

  it("絵があることは、始められる合図にならない", () => {
    /*
      絵は、まだ開いていない教材のぶんも先に用意してある。
      絵の有無で状態を決めると、押した先に中身の無い教材が開く。
    */
    const soon = soonOf(REWRITE); // rewrite_text には絵がある
    expect(statusOf(soon, [], "rewrite_text")).toBe("coming_soon");
  });

  it("終えた回は、あとから近日公開に戻されても『完了』のまま", () => {
    // 管理画面で公開範囲を絞ることがある。やったことを、あとから消さない
    expect(statusOf(soonOf(REWRITE), ["rewrite_text"], null)).toBe("completed");
  });
});

describe("並びの見え方", () => {
  it("絵は置かない", () => {
    /*
      ここは「順番に進む」場所。小さく並べた絵は中身が読めず、
      題を絵の中と外に二度書くことになる。
    */
    renderTimeline([REWRITE, SUMMARIZE], { currentId: "rewrite_text" });

    expect(screen.queryByTestId("lesson-thumbnail")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("lesson-thumbnail-placeholder"),
    ).not.toBeInTheDocument();
  });

  it("Day・節・題の桁が、全行でそろう", () => {
    /*
      幅を固定しないと、題の長さで Day の位置が動き、縦に読み下せない。
      桁は格子（grid-template-columns）が決めているので、
      全行が同じ組みになっていることを確かめる。
    */
    renderTimeline([REWRITE, SUMMARIZE, soonOf(lessonOf("explain_topic"))], {
      currentId: "rewrite_text",
    });

    const rows = screen
      .getAllByRole("button")
      .filter((el) => el.dataset.testid?.startsWith("lesson-"));

    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.className).toContain("grid-cols-[3.5rem_1.5rem_minmax(0,1fr)]");
    }
  });

  it("進む口が出るのは、いまの1本だけ", () => {
    renderTimeline([REWRITE, SUMMARIZE], { currentId: "rewrite_text" });

    expect(
      within(screen.getByTestId("lesson-rewrite_text")).getByText("はじめる"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("lesson-summarize_text")).queryByText("はじめる"),
    ).not.toBeInTheDocument();
  });

  it("いまの1本は、読み上げにも『ここ』と伝わる", () => {
    /*
      色と大きさだけで現在地を示すと、見えない人には位置が分からない。

      「ここ」に立てるのは**始められる教材だけ**。準備中のものは
      `coming_soon` が先に決まるので、`currentId` を向けても
      「ここ」にはならない（`statusOf`）——開けない場所を現在地と
      言わない。第1リリースでは Day2 以降が全部そちら側なので、
      ここは Day1 で見る。
    */
    renderTimeline([REWRITE, SUMMARIZE], { currentId: "rewrite_text" });

    expect(screen.getByTestId("lesson-rewrite_text")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByTestId("lesson-summarize_text")).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("状態を色だけで言わない", () => {
    renderTimeline([REWRITE, SUMMARIZE], {
      completed: ["rewrite_text"],
      currentId: "summarize_text",
    });

    expect(screen.getByTestId("lesson-rewrite_text")).toHaveTextContent("完了");
  });

  it("終えた回に、いつやったかは出さない", () => {
    /*
      ここで確かめたいのは「どこまで来たか」であって、日付ではない。
      記録の画面が持っている。
    */
    renderTimeline([REWRITE], { completed: ["rewrite_text"] });

    expect(screen.getByTestId("lesson-rewrite_text")).not.toHaveTextContent(
      /\d+年|\d+月|\d+日/,
    );
  });
});

describe("近日公開", () => {
  it("準備中だと分かる。公開予定は文字で出す", () => {
    renderTimeline([soonOf(SUMMARIZE)]);

    const row = screen.getByTestId("lesson-summarize_text");
    expect(row).toHaveAttribute("data-availability", "coming_soon");
    expect(row).toHaveTextContent("2026年9月1日");
    /*
      **`disabled` にはしない。** 押しても何も起きないと、壊れて
      いるのか押し方が悪いのかが分からないまま終わる。押すと
      「準備中です」と一言返る形にしてあり、行き先を止めるのは
      `App.tsx` の `openLesson` 1か所。

      読み上げには「いまは押せない」と伝える。`aria-disabled` は
      `disabled` と違って押下が届くので、両方を満たせる。
    */
    expect(row).toHaveAttribute("aria-disabled", "true");
  });

  it("終えたあとに戻されても、準備中のまま", () => {
    /*
      見た目は「完了」だが、開いた先には中身が無い。
      表示の状態で開けると、押した先が行き止まりになる。
    */
    renderTimeline([soonOf(REWRITE)], { completed: ["rewrite_text"] });

    const row = screen.getByTestId("lesson-rewrite_text");
    expect(row).toHaveTextContent("完了");
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(row).toHaveAttribute("data-availability", "coming_soon");
  });

  it("取っておく口は出さない", () => {
    // 開ける日まで何も起きないものを、取っておけるようにしない
    renderTimeline([soonOf(SUMMARIZE), REWRITE], {
      onToggleBookmark: vi.fn(),
    });

    expect(screen.queryByTestId("bookmark-summarize_text")).not.toBeInTheDocument();
    expect(screen.getByTestId("bookmark-rewrite_text")).toBeInTheDocument();
  });
});

describe("押したとき", () => {
  it("行そのものを押せば、その教材へ進む", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderTimeline([REWRITE, SUMMARIZE], { currentId: "rewrite_text", onSelect });

    await user.click(screen.getByTestId("lesson-summarize_text"));

    expect(onSelect).toHaveBeenCalledWith("summarize_text");
  });
});
