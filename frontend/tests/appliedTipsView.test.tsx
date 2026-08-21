/**
 * 「こんな使い方もできます」の画面。
 *
 * ここで守るのは4つ。
 *
 *   1. 1件も無ければ、節ごと出さない
 *   2. 足りない技があれば、そこへ行ける
 *   3. 全部の技を終えていれば、押せない「試す」を出さない
 *      （無い機能への導線を作らない。憲章 原則 I）
 *   4. 本文は出さない（ここは技の名前だけ）
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AppliedTips } from "../src/components/course/AppliedTips";
import type { AppliedTip } from "../src/course/appliedTips";

const TITLES: Record<string, string> = {
  summarize_text: "長い文章を短くまとめる",
  rewrite_text: "文章を分かりやすくする",
};

const lessonTitle = (id: string) => TITLES[id] ?? null;

const COMBO: AppliedTip = {
  id: "combo_1",
  title: "長い会議メモを、上司へそのまま送れる文章にする",
  description: "決まったことだけを取り出してから、読む相手に合わせて整える。",
  category: "会議",
  requiredLessonIds: ["summarize_text", "rewrite_text"],
  flow: ["長い文章を短くまとめる", "誰向けかを整えて書き直す"],
  accessLevel: "free",
  order: 1,
};

describe("画面", () => {
  it("1件も無ければ、節ごと出さない", () => {
    render(
      <AppliedTips tips={[]} lessonTitle={lessonTitle} completedIds={[]} />,
    );

    expect(screen.queryByTestId("applied-tips")).not.toBeInTheDocument();
  });

  it("題と手順が出る", () => {
    render(
      <AppliedTips
        tips={[COMBO]}
        lessonTitle={lessonTitle}
        completedIds={["summarize_text"]}
      />,
    );

    const card = screen.getByTestId("applied-tip-combo_1");
    expect(card).toHaveTextContent(COMBO.title);
    expect(card).toHaveTextContent("長い文章を短くまとめる");
    expect(card).toHaveTextContent("誰向けかを整えて書き直す");
  });

  it("足りない技があれば、そこへ行ける", async () => {
    const user = userEvent.setup();
    const onSelectLesson = vi.fn();
    render(
      <AppliedTips
        tips={[COMBO]}
        lessonTitle={lessonTitle}
        completedIds={["summarize_text"]}
        onSelectLesson={onSelectLesson}
      />,
    );

    const learn = screen.getByTestId("applied-tip-learn-combo_1");
    expect(learn).toHaveTextContent("文章を分かりやすくする");

    await user.click(learn);

    expect(onSelectLesson).toHaveBeenCalledWith("rewrite_text");
  });

  it("全部の技を終えていれば、押せる「試す」を出さない", () => {
    /*
      複数レッスンを1つの流れとして実行する画面がまだ無い。
      無い機能への導線を置くと、押しても何も起きないボタンになる。
    */
    render(
      <AppliedTips
        tips={[COMBO]}
        lessonTitle={lessonTitle}
        completedIds={["summarize_text", "rewrite_text"]}
      />,
    );

    const card = screen.getByTestId("applied-tip-combo_1");
    expect(card).toHaveTextContent("いまの技で使えます");
    expect(
      screen.queryByTestId("applied-tip-learn-combo_1"),
    ).not.toBeInTheDocument();
  });

  it("本文は出さない", () => {
    // ここは技の名前と流れだけ。実際に作った文章はここに出さない
    render(
      <AppliedTips
        tips={[COMBO]}
        lessonTitle={lessonTitle}
        completedIds={[]}
      />,
    );

    expect(screen.queryByText(/来週の打ち合わせ/)).not.toBeInTheDocument();
  });
});
