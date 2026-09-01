/**
 * Day を終えた画面。
 *
 * ここで見るのは「何を出し、何を出さないか」の分かれ目だけ。
 * 出る順番（0.8秒の段取り）や、1画面に収まるかは実寸の話なので
 * E2E が見る（`e2e/dayComplete.spec.ts`）。
 *
 * とくに大事なのは**押せる行き先が必ず1つ残る**こと。
 * 祝って行き止まり、はいちばんやってはいけない終わり方
 * （憲章 原則 I）。次の1本が無い回でも「コースに戻る」は残る。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DayCompletePage } from "../src/components/course/DayCompletePage";
import { CompletionView } from "../src/components/course/steps/Completion";
import { COURSE } from "../src/course/catalog";

const BASE = {
  day: 1,
  outcome: "文章を分かりやすくできるようになりました",
  skill: "ターゲット指定",
  onBackToCourse: () => {},
};

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 204,
    json: async () => null,
  } as Response);
  /*
    動きを減らす設定で描く。段取りを待たずに最終形が出るので、
    「何が出るか」だけを見たいここでは都合がよい。
    段取りそのものは E2E が見る。
  */
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

describe("Day を終えた画面", () => {
  it("何日目かを、教材データの番号から出す", () => {
    render(<DayCompletePage {...BASE} day={3} />);

    expect(screen.getByTestId("day-complete-title")).toHaveTextContent("Day3 終了！");
  });

  it("できるようになったことを、1行だけ出す", () => {
    render(<DayCompletePage {...BASE} />);

    expect(screen.getByTestId("day-complete-outcome")).toHaveTextContent(
      "文章を分かりやすくできるようになりました",
    );
  });

  it("覚えたAI技を出す", () => {
    render(<DayCompletePage {...BASE} />);

    const skill = screen.getByTestId("day-complete-skill");
    expect(skill).toHaveTextContent("AI技 GET");
    expect(skill).toHaveTextContent("ターゲット指定");
  });

  it("技を覚えなかった回は、その段ごと出さない", () => {
    // 空の枠だけが残ると、「何か貰えるはずだった」と読める
    render(<DayCompletePage {...BASE} skill={undefined} />);

    expect(screen.queryByTestId("day-complete-skill")).toBeNull();
  });

  it("次の日が分かるときは、進み具合に日付を出す", () => {
    /*
      線が伸びるだけにしない。動きを止めている人にも、どこから
      どこへ進んだのかが**文字で**分かるようにする（要件 §6.12）。
    */
    render(<DayCompletePage {...BASE} nextDay={2} />);

    const progress = screen.getByTestId("day-complete-progress");
    expect(progress).toHaveTextContent("Day1");
    expect(progress).toHaveTextContent("Day2");
  });

  it("コースを終えた回は、次の日ではなく完走を出す", () => {
    render(<DayCompletePage {...BASE} nextDay={undefined} />);

    expect(screen.getByTestId("day-complete-progress")).toHaveTextContent("完走");
  });

  it("次の1本があれば、そこへ入るボタンを出す", async () => {
    const onClick = vi.fn();
    render(
      <DayCompletePage {...BASE} nextDay={2} primary={{ label: "次のレッスンへ", onClick }} />,
    );

    await userEvent.setup().click(screen.getByTestId("day-complete-next"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("行き先が無い回でも、戻る道は残る", () => {
    /*
      **この1本がいちばん大事。** 押せる場所が1つも無い画面を作らない。
      次の1本もコース一覧も渡されなかったとき、ここだけが出口になる。
    */
    render(<DayCompletePage {...BASE} primary={undefined} />);

    expect(screen.queryByTestId("day-complete-next")).toBeNull();
    expect(screen.getByTestId("day-complete-back")).toBeInTheDocument();
  });

  it("演出の途中でも押せる（0ms の時点から）", async () => {
    /*
      動きを減らす設定を外して、**段取りが始まったばかりの状態**で描く。
      ここで押せないと「演出が終わるまで操作不能」になる。
    */
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const onBackToCourse = vi.fn();
    render(<DayCompletePage {...BASE} onBackToCourse={onBackToCourse} />);

    await userEvent.setup().click(screen.getByTestId("day-complete-back"));

    expect(onBackToCourse).toHaveBeenCalledTimes(1);
  });
});

describe("完了画面には重ねない", () => {
  it("完了画面そのものには、祝いの画面が出ない", () => {
    /*
      前はここへ重ねていた。祝いの下に成果物・スタンプ・アンケート・
      次におすすめが透けて並び、**1日やり切った瞬間が長い縦積みの
      前置き**になっていた。戻すとここで落ちる。
    */
    render(
      <CompletionView
        course={COURSE}
        skills={["ターゲット指定"]}
        outcomes={["文章を分かりやすくできるようになりました"]}
        outcomeLabel="AIが書いた文章"
        lessonId="rewrite_text"
        lessonNumber={1}
        done={1}
        total={9}
        next={[]}
        completedIds={[]}
      />,
    );

    expect(screen.queryByTestId("day-complete")).toBeNull();
    expect(screen.getByTestId("completion-view")).toBeInTheDocument();
  });
});
