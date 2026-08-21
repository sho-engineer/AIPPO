/**
 * 使い方のくわしい説明（RecipePage）。
 *
 * ここで守るのは4つ。
 *
 *   1. 使う技のうち、終えたものと、まだのものを見分けられる
 *   2. まだのものからは、そのレッスンへ入れる（読んで終わりにしない）
 *   3. 「実行する」とは言わない。走らせる仕組みがまだ無いため
 *   4. 例が無い項目は、見出しごと出さない（空の欄を残さない）
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RecipePage } from "../src/pages/RecipePage";
import type { AppliedTip } from "../src/course/appliedTips";

const TITLES: Record<string, string> = {
  summarize_text: "長い文章を短くまとめる",
  rewrite_text: "文章を分かりやすくする",
};

const lessonTitle = (id: string) => TITLES[id] ?? null;

const TIP: AppliedTip = {
  id: "meeting_notes_share",
  title: "長い会議メモを、上司へそのまま送れる文章にする",
  description: "決まったことだけを取り出してから、読む相手に合わせて整える。",
  category: "会議",
  requiredLessonIds: ["summarize_text", "rewrite_text"],
  flow: ["長い文章を短くまとめる", "誰向けかを整えて書き直す"],
  accessLevel: "free",
  order: 1,
  steps: ["会議メモを貼る", "要点を取り出してもらう"],
  exampleInput: "・A案とB案で議論",
  exampleOutput: "【決定事項】B案で進めます。",
};

const BARE: AppliedTip = {
  ...TIP,
  id: "bare",
  steps: undefined,
  exampleInput: undefined,
  exampleOutput: undefined,
};

function renderPage(props: Partial<Parameters<typeof RecipePage>[0]> = {}) {
  return render(
    <RecipePage
      tip={TIP}
      lessonTitle={lessonTitle}
      completedIds={[]}
      onSelectLesson={() => {}}
      onBack={() => {}}
      {...props}
    />,
  );
}

describe("使う技", () => {
  it("終えた技には、済みの印が付く", () => {
    renderPage({ completedIds: ["summarize_text"] });

    expect(
      screen.getByTestId("recipe-skill-done-summarize_text"),
    ).toBeInTheDocument();
  });

  it("まだの技は、そのレッスンへ入れる", () => {
    renderPage({ completedIds: ["summarize_text"] });

    expect(
      screen.getByTestId("recipe-skill-learn-rewrite_text"),
    ).toBeInTheDocument();
  });

  it("押すと、そのレッスンが開く", async () => {
    const onSelectLesson = vi.fn();
    const user = userEvent.setup();
    renderPage({ completedIds: [], onSelectLesson });

    await user.click(screen.getByTestId("recipe-skill-learn-summarize_text"));

    expect(onSelectLesson).toHaveBeenCalledWith("summarize_text");
  });

  it("全部終えていれば、学ぶボタンは出ない", () => {
    renderPage({ completedIds: ["summarize_text", "rewrite_text"] });

    expect(
      screen.queryByTestId("recipe-skill-learn-summarize_text"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("recipe-skill-learn-rewrite_text"),
    ).not.toBeInTheDocument();
  });
});

describe("できないことを、できるように見せない", () => {
  it("「実行する」とは言わない", () => {
    /*
      複数レッスンを1つの流れとして走らせる仕組みは、まだ無い。
      押せば走り出すように見える言葉を置かない（憲章 原則 I）。
    */
    renderPage({ completedIds: ["summarize_text", "rewrite_text"] });

    expect(screen.queryByText(/実行する/)).not.toBeInTheDocument();
    expect(screen.queryByText(/自動で/)).not.toBeInTheDocument();
  });
});

describe("中身が無い項目", () => {
  it("手順が無ければ、その見出しごと出さない", () => {
    renderPage({ tip: BARE });

    expect(screen.queryByTestId("recipe-steps")).not.toBeInTheDocument();
    expect(screen.queryByText("やり方")).not.toBeInTheDocument();
  });

  it("例が無ければ、その見出しごと出さない", () => {
    renderPage({ tip: BARE });

    expect(screen.queryByTestId("recipe-example")).not.toBeInTheDocument();
    expect(screen.queryByText("できあがりの例")).not.toBeInTheDocument();
  });

  it("あるときは、ちゃんと出る", () => {
    renderPage();

    expect(screen.getByTestId("recipe-steps")).toBeInTheDocument();
    expect(screen.getByTestId("recipe-example")).toHaveTextContent(
      "【決定事項】B案で進めます。",
    );
  });
});

describe("行き止まりにしない", () => {
  it("もどれる", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    renderPage({ onBack });

    await user.click(screen.getByTestId("recipe-back"));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
