/**
 * コースの画面の「続きから」。
 *
 * 数日ぶりに開いた人が、どこまでやったかを思い出さずに済むこと。
 * 見張るのは3つ。
 *
 *   1. 次に押す場所が1つに決まっていること
 *   2. 途中と、まだ始めていないのを言い分けること
 *   3. 開いただけの回を「途中」と言わないこと
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CourseResume } from "../src/components/course/CourseResume";
import { getLesson } from "../src/course/catalog";
import { saveDraft } from "../src/lib/draft";

const LESSON = getLesson("rewrite_text")!;

beforeEach(() => window.localStorage.clear());

describe("続きから", () => {
  it("次の1本と、かかる時間を出す", () => {
    render(<CourseResume lesson={LESSON} onStart={() => {}} />);

    expect(screen.getByTestId("course-resume")).toHaveTextContent(LESSON.title);
    expect(screen.getByTestId("course-resume")).toHaveTextContent(
      `約${LESSON.estimatedMinutes}分`,
    );
  });

  it("押すと、そのレッスンが開く", async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();
    render(<CourseResume lesson={LESSON} onStart={onStart} />);

    await user.click(screen.getByTestId("course-resume-start"));

    expect(onStart).toHaveBeenCalledWith(LESSON.id);
  });

  it("まだ始めていないときは「はじめる」", () => {
    render(<CourseResume lesson={LESSON} onStart={() => {}} />);

    expect(screen.getByTestId("course-resume-start")).toHaveTextContent("はじめる");
    expect(screen.getByTestId("course-resume-state")).toHaveTextContent("次はここから");
  });

  it("途中まで進んでいるときは「続きから」", async () => {
    saveDraft({
      lessonId: LESSON.id,
      stepId: "compare_results",
      values: {},
    });

    render(<CourseResume lesson={LESSON} onStart={() => {}} />);

    await waitFor(() =>
      expect(screen.getByTestId("course-resume-start")).toHaveTextContent("続きから"),
    );
    expect(screen.getByTestId("course-resume-state")).toHaveTextContent("途中です");
  });

  it("開いただけの回は、途中と言わない", async () => {
    /*
      最初の画面に居るだけで「途中から続ける」と出ると、
      やっていないことをやったことにしてしまう。
    */
    saveDraft({
      lessonId: LESSON.id,
      stepId: LESSON.steps[0].id,
      values: {},
    });

    render(<CourseResume lesson={LESSON} onStart={() => {}} />);

    await waitFor(() =>
      expect(screen.getByTestId("course-resume-start")).toHaveTextContent("はじめる"),
    );
  });

  it("次の1本が無いときは、何も出さない", () => {
    // コースを完走した人に、空の枠を見せない
    const { container } = render(<CourseResume lesson={null} onStart={() => {}} />);

    expect(container).toBeEmptyDOMElement();
  });
});
