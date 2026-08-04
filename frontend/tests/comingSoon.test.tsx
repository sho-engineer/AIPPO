import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "../src/App";
import { COURSE } from "../src/course/catalog";
import {
  comingSoonNote,
  isComingSoon,
  isStartable,
  startableLessons,
} from "../src/course/availability";
import type { Lesson } from "../src/course/types";

/**
 * 第一リリース（Closed Beta）で始められるのは診断と文章改善だけ。
 * 残りは一覧に出すが、始められないこと。
 *
 * 押せるボタンが1つ残るだけで、始められないはずの教材が始まる。
 * 画面の入口をすべて見る。
 */
const RELEASE_AVAILABLE = ["diagnosis", "rewrite_text"];

describe("近日公開の判定", () => {
  const lesson = (over: Partial<Lesson>): Lesson =>
    ({ id: "x", number: 1, title: "", goal: "", outcomes: [], tags: [], usesAi: true, steps: [], ...over }) as Lesson;

  it("availability が coming_soon のときだけ止める", () => {
    expect(isComingSoon(lesson({ availability: "coming_soon" }))).toBe(true);
    expect(isComingSoon(lesson({ availability: "available" }))).toBe(false);
  });

  it("指定が無ければ始められる扱いにする", () => {
    // 同梱データで動かすとき、全部が近日公開になると何も始められない
    expect(isStartable(lesson({}))).toBe(true);
  });

  it("公開予定日があるときだけ日付を出す", () => {
    expect(comingSoonNote(lesson({ availability: "coming_soon" }))).not.toMatch(/\d年/);
    expect(
      comingSoonNote(
        lesson({ availability: "coming_soon", plannedReleaseDate: "2026-09-01" }),
      ),
    ).toContain("2026年9月1日");
  });

  it("独自の一言があれば、そちらを優先する", () => {
    expect(
      comingSoonNote(
        lesson({ availability: "coming_soon", comingSoonMessage: "準備中です" }),
      ),
    ).toBe("準備中です");
  });
});

describe("第一リリースの範囲", () => {
  it("始められるのは診断と文章改善だけ", () => {
    const startable = startableLessons(COURSE.lessons).map((lesson) => lesson.id);

    expect(startable).toEqual(RELEASE_AVAILABLE);
  });

  it("残りは一覧から消えず、近日公開になる", () => {
    const soon = COURSE.lessons.filter(isComingSoon);

    expect(soon).toHaveLength(7);
  });
});

describe("画面での見え方", () => {
  beforeEach(() => window.localStorage.clear());

  const start = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getAllByRole("button", { name: "はじめる" })[0]);
  };

  it("教材一覧に近日公開の教材も並ぶが、押せない", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);
    await user.click(await screen.findByRole("button", { name: "教材一覧" }));

    // 一覧からは消さない。何が来るのかは見せる
    const soon = await screen.findByTestId("lesson-summarize_text");
    expect(soon).toBeInTheDocument();
    expect(soon).toBeDisabled();
    expect(soon).toHaveAttribute("data-availability", "coming_soon");

    // 始められるものは押せる
    expect(screen.getByTestId("lesson-rewrite_text")).toBeEnabled();
  });

  it("近日公開のカードには「近日公開」と出る", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);
    await user.click(await screen.findByRole("button", { name: "教材一覧" }));

    const soon = await screen.findByTestId("lesson-summarize_text");
    expect(soon).toHaveTextContent("近日公開");
  });

  it("押してもレッスンは始まらない", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);
    await user.click(await screen.findByRole("button", { name: "教材一覧" }));

    const soon = await screen.findByTestId("lesson-summarize_text");
    await user.click(soon).catch(() => {
      // 押せないボタンなので、クリックが弾かれてもよい
    });

    // レッスン画面へは移っていないこと
    expect(screen.queryByTestId("phase-stepper")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: COURSE.title })).toBeInTheDocument();
  });

  it("進捗の分母に近日公開を混ぜない", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);

    // 始められるのは2本なので、分母は 2（9ではない）
    const progress = await screen.findByTestId("progress-summary");
    expect(progress).toHaveTextContent("0/2");
  });
});
