/**
 * 完了画面の「こんな使い方もできます」に、いま終えたレッスンを
 * 足りない技として出さないこと。
 *
 * `completedIds` には、この画面を出している時点ではまだ
 * いまのレッスンが入っていない（`done` の数え方と同じ理由）。
 * 素通しすると、たったいま終えたばかりの技を
 * 「◯◯を学ぶ →」と案内してしまう。実際に一度その形で出た
 * （実機のスクリーンショットで確認）。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CompletionView } from "../src/components/course/steps/Completion";
import { COURSE } from "../src/course/catalog";

/**
 * 「このレッスンの記録」をひらく。
 *
 * 応用例・進み具合・アンケートは、完了画面ではなくこの一枚の中にある。
 * 画面に残すのは3つだけと決めたため
 * （`components/course/steps/Completion.tsx` の冒頭）。
 */
async function openRecord() {
  await userEvent.setup().click(screen.getByTestId("completion-more"));
}

describe("完了画面の応用例", () => {
  it("いま終えたレッスンを、足りない技として案内しない", async () => {
    /*
      「長い文章を短くまとめる」（summarize_text）をいま終えたところ。
      端末の完了記録（completedIds）にはまだ入っていない。
    */
    render(
      <CompletionView
        course={COURSE}
        skills={["要点だけを取り出せる"]}
        outcomeLabel="AIが書いた要約"
        lessonId="summarize_text"
        lessonNumber={2}
        done={1}
        total={9}
        next={[]}
        completedIds={[]}
        onSelectLesson={() => {}}
      />,
    );

    await openRecord();

    // summarize_text 単独の応用例は「いまの技で使えます」になるはず
    const solo = screen.getByTestId("applied-tip-meeting_summary_only");
    expect(solo).toHaveTextContent("いまの技で使えます");
    expect(
      screen.queryByTestId("applied-tip-learn-meeting_summary_only"),
    ).not.toBeInTheDocument();
  });

  it("組み合わせでは、本当に足りない技だけを案内する", async () => {
    render(
      <CompletionView
        course={COURSE}
        skills={["要点だけを取り出せる"]}
        outcomeLabel="AIが書いた要約"
        lessonId="summarize_text"
        lessonNumber={2}
        done={1}
        total={9}
        next={[]}
        completedIds={[]}
        onSelectLesson={() => {}}
      />,
    );

    await openRecord();

    // 「summarize_text + rewrite_text」の組み合わせは、
    // rewrite_text のほうを学ぶよう案内するはず（summarize_text ではない）
    const combo = screen.getByTestId("applied-tip-learn-meeting_notes_share");
    expect(combo).toHaveTextContent("文章を分かりやすくする");
    expect(combo).not.toHaveTextContent("長い文章を短くまとめる");
  });
});
