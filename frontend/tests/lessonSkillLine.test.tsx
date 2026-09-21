/**
 * 開始画面の1行——今回の技と、次の段までの残り。
 *
 * 見張るのは3つ。
 *
 * - **「これをやれば上がる」と書かない。** 上がる条件は2つあって、
 *   レッスンで動くのは片方だけ
 * - すでに持っている技を「今回身につく」と書かない（やり直しの回）
 * - 読めなかったときに、行き止まりや空の見出しを作らない
 */

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LessonSkillLine } from "../src/components/course/LessonSkillLine";
import type { LessonReward } from "../src/api/progression";

const REWARD: LessonReward = {
  lesson: "rewrite_text",
  skills: [
    {
      slug: "prompt",
      name: "プロンプト",
      one_line: "してほしいことをAIに伝える",
      acquired: false,
    },
  ],
  next_level: { number: 2, name: "頼む", remaining: 2, has_challenge: true },
  remaining_after: 1,
};

function serve(body: LessonReward | null) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if (body === null) throw new Error("offline");
    return { ok: true, status: 200, json: async () => body } as Response;
  });
}

function open(body: LessonReward | null = REWARD) {
  serve(body);
  return render(<LessonSkillLine lessonId="rewrite_text" />);
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("開始画面の、今回の技", () => {
  it("今回の技の名前を出す", async () => {
    open();

    expect(await screen.findByTestId("lesson-skill-line")).toHaveTextContent(
      "プロンプト",
    );
  });

  it("次の段までの残りを、数で言う", async () => {
    open();

    expect(await screen.findByTestId("lesson-skill-line")).toHaveTextContent(
      "あと1つ",
    );
  });

  it("「必ず上がる」とは言わない", async () => {
    open();

    const line = await screen.findByTestId("lesson-skill-line");
    const text = line.textContent ?? "";
    for (const phrase of ["レベルアップします", "Level Up します", "上がります"]) {
      expect(text).not.toContain(phrase);
    }
  });

  it("技がそろう回でも、「上がる」とは言わない", async () => {
    /*
      残りが 0 になるのは「技がそろう」であって「上がる」ではない。
      もう片方（昇段の実践問題）が残っている。
    */
    open({ ...REWARD, remaining_after: 0 });

    const line = await screen.findByTestId("lesson-skill-line");
    expect(line).toHaveTextContent("必要な技が、このあとそろいます");
    expect(line.textContent ?? "").not.toContain("上がり");
  });

  it("もう持っている技しか無い回は、行ごと出さない", async () => {
    /*
      やり直しの回に「今回身につきます」と出すと、嘘になる。
    */
    open({
      ...REWARD,
      skills: [{ ...REWARD.skills[0], acquired: true }],
    });

    await waitFor(() =>
      expect(screen.queryByTestId("lesson-skill-line")).not.toBeInTheDocument(),
    );
  });

  it("技がひも付いていない教材では、何も出さない", async () => {
    open({ ...REWARD, skills: [] });

    await waitFor(() =>
      expect(screen.queryByTestId("lesson-skill-line")).not.toBeInTheDocument(),
    );
  });

  it("いちばん上の段では、次の段の話をしない", async () => {
    open({ ...REWARD, next_level: null, remaining_after: 0 });

    const line = await screen.findByTestId("lesson-skill-line");
    expect(line).toHaveTextContent("プロンプト");
    expect(line.textContent ?? "").not.toContain("Lv.");
  });

  it("読めなかったときは、黙って出ない", async () => {
    open(null);

    await waitFor(() =>
      expect(screen.queryByTestId("lesson-skill-line")).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
