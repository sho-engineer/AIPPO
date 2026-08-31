/**
 * 終えたときに増えた分（XP と AI技）。
 *
 * 完了画面の並びは **祝う → XP → AI技 → 成果物**。
 * 数の前に祝いを置き、数のあとに持ち帰れるものを置く。
 *
 * 見張るのは3つ。
 *
 *   1. 増えた分はサーバーが決めたものをそのまま出す（画面で数えない）
 *   2. 何も増えていない回（やり直し）は、節ごと出さない
 *   3. 技の名前が引けなくても、行き止まりにしない
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LessonAwardCard } from "../src/components/course/LessonAwardCard";
import type { Skill } from "../src/api/skills";

const TONE: Skill = {
  slug: "tone",
  name: "トーン指定",
  one_line: "文章の雰囲気を指定する",
  description: "",
  example: "",
  acquired: true,
  acquired_at: null,
  lessons: [],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("増えた分", () => {
  it("XPと、新しく覚えた技を出す", () => {
    render(
      <LessonAwardCard
        award={{ skills: ["tone"], xp: 30, checkpoint: null }}
        skills={[TONE]}
      />,
    );

    const card = screen.getByTestId("lesson-award");
    expect(card).toHaveTextContent("+30 XP");
    expect(card).toHaveTextContent("トーン指定");
    expect(card).toHaveTextContent("文章の雰囲気を指定する");
  });

  it("何も増えていない回は、節ごと出さない", () => {
    // 「+0 XP」は祝いにならない。やり直しの回に演出を出さない
    render(<LessonAwardCard award={{ skills: [], xp: 0, checkpoint: null }} />);

    expect(screen.queryByTestId("lesson-award")).not.toBeInTheDocument();
  });

  it("届かなかったときも、節ごと出さない", () => {
    // 学習は終わっている。祝いの材料が無いだけ
    render(<LessonAwardCard award={null} />);

    expect(screen.queryByTestId("lesson-award")).not.toBeInTheDocument();
  });

  it("XPだけ増えた回も出す", () => {
    render(<LessonAwardCard award={{ skills: [], xp: 20, checkpoint: null }} />);

    expect(screen.getByTestId("lesson-award")).toHaveTextContent("+20 XP");
    expect(screen.queryByTestId("award-skills")).not.toBeInTheDocument();
  });

  it("技の名前が引けなくても、行き止まりにしない", () => {
    /*
      図鑑を読めていない（通信できない・古い版のサーバー）ことがある。
      名前が出ないだけで、増えたことは伝える。
    */
    render(
      <LessonAwardCard award={{ skills: ["tone"], xp: 10, checkpoint: null }} />,
    );

    expect(screen.getByTestId("award-skills")).toHaveTextContent("tone");
  });
});
