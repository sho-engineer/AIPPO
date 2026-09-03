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

  it("途中まで進んでいるときは、どこまでやったかを言う", async () => {
    /*
      「途中です」だけでは、思い出す手間が残る。数日ぶりに開いた人が
      考えずに済むよう、**どこまで進んだか**を区切りの名前で返す。
      歩数（12 / 19）では言わない——内部の数で、本人には意味が無い。
    */
    saveDraft({
      lessonId: LESSON.id,
      stepId: "compare_results",
      values: {},
    });

    render(<CourseResume lesson={LESSON} onStart={() => {}} />);

    await waitFor(() =>
      expect(screen.getByTestId("course-resume-start")).toHaveTextContent("続きから"),
    );
    /*
      Day1 の2つ目の段の名前。章扉で見せた名前をそのまま使うので、
      共通の言い方（「変える」）ではなく「相手」になる。
    */
    expect(screen.getByTestId("course-resume-state")).toHaveTextContent("相手");
  });

  it("途中なら、残りの時間を言う", async () => {
    // 半分終えた人に「約8分」と出すと、進んだぶんが消える
    saveDraft({ lessonId: LESSON.id, stepId: "reflection", values: {} });

    render(<CourseResume lesson={LESSON} onStart={() => {}} />);

    await waitFor(() =>
      expect(screen.getByTestId("course-resume-time")).toHaveTextContent(/あと約\d+分/),
    );
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
