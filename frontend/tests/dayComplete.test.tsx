/**
 * Day を終えた瞬間を、**初回だけ**祝う。
 *
 * やり直すたびに祝われると、祝いが安くなる。見分けは「終えた記録に
 * この教材が入っているか」の1行だが、そこが逆になっても画面は
 * 動き続けるので、目で見て気づくのは復習した日になる。
 *
 * E2E ではなくここで見る理由
 * --------------------------
 * レッスン中は下タブが出ないので、同じ教材へ戻るには完了画面から
 * コースの中身を経由することになる。**検査の道のりが、検査したい
 * ことより長くなる**。決まりは1行なので、その1行だけを見る。
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompletionView } from "../src/components/course/steps/Completion";
import { COURSE } from "../src/course/catalog";

const BASE = {
  course: COURSE,
  skills: ["ターゲット指定"],
  outcomes: ["文章を分かりやすくできるようになりました"],
  outcomeLabel: "AIが書いた文章",
  lessonId: "rewrite_text",
  lessonNumber: 1,
  done: 1,
  total: 9,
  next: [],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 204,
    json: async () => null,
  } as Response);
});

describe("Day を終えた瞬間", () => {
  it("初めて終えた回は出る", () => {
    render(<CompletionView {...BASE} completedIds={[]} />);

    expect(screen.getByTestId("day-complete")).toBeInTheDocument();
    expect(screen.getByTestId("day-complete-title")).toHaveTextContent("Day1 終了！");
  });

  it("やり直した回は出ない", () => {
    // 終えた記録にこの教材が入っている ＝ 前にもう終えている
    render(<CompletionView {...BASE} completedIds={["rewrite_text"]} />);

    expect(screen.queryByTestId("day-complete")).toBeNull();
    // 完了画面そのものは、これまでどおり出る
    expect(screen.getByTestId("completion-view")).toBeInTheDocument();
  });

  it("次の1本が無ければ、次へのボタンを出さない", () => {
    // コースを終えた回。押した先が無いボタンを置かない
    render(<CompletionView {...BASE} completedIds={[]} next={[]} />);

    expect(screen.queryByTestId("day-complete-next")).toBeNull();
    // 戻る道は必ず残す（行き止まりにしない）
    expect(screen.getByTestId("day-complete-back")).toBeInTheDocument();
  });

  it("何日目かを、教材データの番号から出す", () => {
    render(<CompletionView {...BASE} completedIds={[]} lessonNumber={3} />);

    expect(screen.getByTestId("day-complete-title")).toHaveTextContent("Day3 終了！");
  });
});
