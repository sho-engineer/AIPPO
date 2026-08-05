/**
 * 教材の差し替え。
 *
 * 教材の本体は DB にあり、管理画面から直せる。画面は起動時に1回聞き、
 * 届いたらそれに差し替える。
 *
 * ここで見張るのは1つ。**届かなくても教材が消えないこと。**
 * 空の応答や形の違うものを受け取って上書きすると、同梱の9本まで
 * 失われ、「壊れている」のと見分けがつかない画面になる。
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COURSE as BUNDLED } from "../src/course/catalog";
import { lookupLesson, resetCatalog, useCourse } from "../src/course/live";

function reply(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

/** サーバーから届く形の、最小の1コース。 */
const FROM_SERVER = {
  id: "first_step_7days",
  title: "管理画面で直した題",
  description: "説明も直した",
  lessons: [
    {
      id: "rewrite_text",
      number: 1,
      title: "文章を分かりやすくする",
      goal: "伝わる文章にする",
      outcomes: [],
      tags: [],
      usesAi: true,
      steps: [{ id: "intro", type: "intro", title: "はじめに" }],
    },
  ],
};

beforeEach(() => {
  resetCatalog();
  vi.restoreAllMocks();
});

afterEach(() => {
  // 先に画面を片付ける。付けたまま差し替えると、
  // 消えたはずの部品へ知らせが飛んで警告になる
  cleanup();
  act(() => resetCatalog());
});

describe("教材の取り込み", () => {
  it("届くまでは同梱の教材で動く", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise(() => {}) as Promise<Response>,
    );

    const { result } = renderHook(() => useCourse());

    expect(result.current.lessons).toHaveLength(BUNDLED.lessons.length);
  });

  it("届いたら差し替わる", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      reply({ courses: [FROM_SERVER] }),
    );

    const { result } = renderHook(() => useCourse());

    await waitFor(() => expect(result.current.title).toBe("管理画面で直した題"));
    expect(lookupLesson("rewrite_text")?.goal).toBe("伝わる文章にする");
  });

  it("届かなくても教材は消えない", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("届かない"));

    const { result } = renderHook(() => useCourse());

    await waitFor(() =>
      expect(result.current.lessons).toHaveLength(BUNDLED.lessons.length),
    );
  });

  it("空の応答では上書きしない", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      reply({ courses: [] }),
    );

    const { result } = renderHook(() => useCourse());

    await waitFor(() =>
      expect(result.current.lessons).toHaveLength(BUNDLED.lessons.length),
    );
  });

  it("ステップが1つも無いコースでは上書きしない", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      reply({
        courses: [{ ...FROM_SERVER, lessons: [{ id: "rewrite_text", steps: [] }] }],
      }),
    );

    const { result } = renderHook(() => useCourse());

    await waitFor(() =>
      expect(result.current.lessons).toHaveLength(BUNDLED.lessons.length),
    );
  });

  it("何度描いても、取りに行くのは1回だけ", async () => {
    const send = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => reply({ courses: [FROM_SERVER] }));

    const first = renderHook(() => useCourse());
    await waitFor(() => expect(first.result.current.title).toBe("管理画面で直した題"));

    await act(async () => {
      renderHook(() => useCourse());
      renderHook(() => useCourse());
    });

    const catalogCalls = send.mock.calls.filter((call) =>
      String(call[0]).includes("/api/v1/catalog/"),
    );
    expect(catalogCalls).toHaveLength(1);
  });
});
