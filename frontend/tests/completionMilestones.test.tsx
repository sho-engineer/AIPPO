/**
 * 完了画面の、スタンプラリーまわり。
 *
 * ここで守るのは7つ。
 *
 *   1. 節目に届いた回だけ、節目のまとめが出る
 *   2. 節目に届いていない回では、出ない
 *   3. やり直し（前と同じ本数）では、二度と出ない
 *   4. まとめには**ここまでで何ができるようになったか**が入る
 *   5. コースを完走した回は、専用の締めくくりが出る
 *   6. 完走の回は、ふだんの節目のまとめ・節目の一覧と二重に出さない
 *   7. 完走していない回では、締めくくりを出さない
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CompletionView } from "../src/components/course/steps/Completion";
import { COURSE } from "../src/course/catalog";

const BASE = {
  course: COURSE,
  skills: ["要点だけを取り出せる"],
  outcomeLabel: "AIが書いた要約",
  lessonId: "summarize_text",
  lessonNumber: 2,
  next: [],
  completedIds: [],
  onSelectLesson: () => {},
};

describe("節目のまとめ", () => {
  it("節目に届いた回（2→3本目）に出る", () => {
    render(<CompletionView {...BASE} done={3} total={9} />);

    const card = screen.getByTestId("course-checkpoint");
    expect(card).toHaveTextContent("3個目のスタンプ");
    expect(card).toHaveTextContent("🎁 1 Credit");
  });

  it("節目に届いていない回（3→4本目）には出ない", () => {
    render(<CompletionView {...BASE} done={4} total={9} />);

    expect(screen.queryByTestId("course-checkpoint")).not.toBeInTheDocument();
  });

  it("ここまでで何ができるようになったかが入る", () => {
    /*
      1本ずつの完了画面は「今日できるようになったこと」しか言わない。
      3本目まで来た人が実際に持っているのはその合計だが、それを
      見せる場所がどこにも無かった。積み上がっていることは、
      積み上げた本人がいちばん気づきにくい。
    */
    render(
      <CompletionView
        {...BASE}
        done={3}
        total={9}
        completedIds={["rewrite_text", "summarize_text"]}
      />,
    );

    const outcomes = screen.getByTestId("checkpoint-outcomes");
    // 教材の outcomes をそのまま並べる。新しく言葉を作らない
    expect(outcomes).toHaveTextContent("読む相手を伝えられる");
    expect(outcomes).toHaveTextContent("何のためのまとめかを伝えられる");
  });

  it("いま終えた1本も、まとめに入る", () => {
    /*
      `completedIds` はサーバーと端末から取った一覧で、この画面を
      出している時点ではまだ今回の分が入っていないことがある。
      そのまま並べると、**節目を起こした当の1本だけ**が抜ける。
    */
    render(
      <CompletionView
        {...BASE}
        lessonId="summarize_text"
        done={3}
        total={9}
        completedIds={["rewrite_text"]}
      />,
    );

    expect(screen.getByTestId("checkpoint-outcomes")).toHaveTextContent(
      "何のためのまとめかを伝えられる",
    );
  });

  it("特典は『予告』であって、『獲得しました』ではない", () => {
    /*
      使える残高がまだ無い。過去形で「獲得しました」と言うと、
      押しても何も起きないのに起きたと言っていることになる。
    */
    render(<CompletionView {...BASE} done={3} total={9} />);

    const card = screen.getByTestId("course-checkpoint");
    expect(card).not.toHaveTextContent("獲得しました");
    expect(card).toHaveTextContent("近日公開");
  });
});

describe("コース完走", () => {
  it("完走した回に、専用の締めくくりが出る", () => {
    render(<CompletionView {...BASE} done={9} total={9} />);

    const card = screen.getByTestId("course-complete");
    expect(card).toHaveTextContent("COURSE COMPLETE");
    expect(card).toHaveTextContent(COURSE.title);
  });

  it("完走していない回には、締めくくりを出さない", () => {
    render(<CompletionView {...BASE} done={8} total={9} />);

    expect(screen.queryByTestId("course-complete")).not.toBeInTheDocument();
  });

  it("完走の回は、ふだんの節目のまとめ・節目の一覧を重ねて出さない", () => {
    /*
      9本目は3個・6個の節目もまたいでいないので、ふだんは
      milestone-reached が出ない回だが、9個目そのものが節目候補に
      入っていても、完走の締めくくり1つに絞る。
      「どちらが本番か」が2つあると、どちらも弱くなる。
    */
    render(<CompletionView {...BASE} done={9} total={9} />);

    expect(screen.queryByTestId("course-checkpoint")).not.toBeInTheDocument();
    expect(screen.queryByTestId("milestone-legend")).not.toBeInTheDocument();
  });

  it("『次のコースを見る』を押すと、渡した関数が呼ばれる", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const onOpenCourseCatalog = vi.fn();
    const user = userEvent.setup();

    render(
      <CompletionView {...BASE} done={9} total={9} onOpenCourseCatalog={onOpenCourseCatalog} />,
    );

    await user.click(screen.getByTestId("course-complete-next"));

    expect(onOpenCourseCatalog).toHaveBeenCalledTimes(1);
  });

  it("バッジと特典の予告が、完走の締めくくりに出る", () => {
    render(<CompletionView {...BASE} done={9} total={9} />);

    const card = screen.getByTestId("course-complete");
    expect(card).toHaveTextContent("Complete");
    expect(card).toHaveTextContent("🎁 5 Credits");
    expect(card).toHaveTextContent("近日公開");
  });
});
