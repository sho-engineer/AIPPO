/**
 * 進み具合の足し合わせ。
 *
 * ここで見張るのは1つだけ。**表示が減らないこと。**
 *
 * 端末の分とサーバーの分のどちらか一方を選ぶと、必ず減って見える
 * 瞬間が出る。「終わったはずのレッスンが未完了に戻った」画面は、
 * 続ける気をいちばん削ぐ。
 */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCompletedLessons } from "../src/course/progress";
import { markCompleted } from "../src/lib/draft";

function reply(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const EMPTY = reply({
  lessons: [],
  completed_count: 0,
  in_progress_count: 0,
  skills: [],
  signed_in: false,
});

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("終わったレッスンの数え方", () => {
  it("サーバーの返事を待たずに、端末の分を先に出す", async () => {
    markCompleted("rewrite_text");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => EMPTY);

    const { result } = renderHook(() => useCompletedLessons());

    // 最初の描画で、もう出ている
    expect(result.current).toEqual(["rewrite_text"]);

    // 返事が届いたあとも変わらないことまで見る
    await waitFor(() => expect(result.current).toEqual(["rewrite_text"]));
  });

  it("別の端末で終えた分を足す", async () => {
    markCompleted("rewrite_text");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      reply({
        lessons: [
          {
            lesson_id: "summarize",
            completed: true,
            current_step: "DONE",
            attempt_count: 2,
            updated_at: "2026-08-01T00:00:00+09:00",
          },
        ],
        completed_count: 1,
        in_progress_count: 0,
        skills: [],
        signed_in: true,
      }),
    );

    const { result } = renderHook(() => useCompletedLessons());

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current).toContain("rewrite_text");
    expect(result.current).toContain("summarize");
  });

  it("サーバーが空でも、端末の分は消さない", async () => {
    markCompleted("rewrite_text");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => EMPTY);

    const { result } = renderHook(() => useCompletedLessons());

    await waitFor(() => expect(result.current).toEqual(["rewrite_text"]));
  });

  it("途中のレッスンは、終わった扱いにしない", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      reply({
        lessons: [
          {
            lesson_id: "summarize",
            completed: false,
            current_step: "OBSERVE",
            attempt_count: 1,
            updated_at: "2026-08-01T00:00:00+09:00",
          },
        ],
        completed_count: 0,
        in_progress_count: 1,
        skills: [],
        signed_in: true,
      }),
    );

    const { result } = renderHook(() => useCompletedLessons());

    await waitFor(() => expect(result.current).toEqual([]));
  });

  it("サーバーに届かなくても、画面は端末の分で動く", async () => {
    markCompleted("rewrite_text");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("届かない"));

    const { result } = renderHook(() => useCompletedLessons());

    await waitFor(() => expect(result.current).toEqual(["rewrite_text"]));
  });
});
