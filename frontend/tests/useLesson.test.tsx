import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLesson } from "../src/lesson/useLesson";

/**
 * 探索テストで見つかった行き止まりの回帰テスト。
 *
 * ポーの返事はあくまで助言なので、待っている間も次の実行を受け付ける
 * （憲章 原則 III: 進行はアプリが持つ）。
 */

type Deferred = { resolve: (value: unknown) => void; promise: Promise<unknown> };

function deferred(): Deferred {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { resolve, promise };
}

const jsonResponse = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => body,
  }) as unknown as Response;

/**
 * 流し込みが使えない環境の応答。
 *
 * ここでは通常の生成へ倒れたあとの挙動を見たいので、
 * 流し込みは使えない前提にしておく（倒れること自体は E2E で確かめている）。
 */
const streamUnavailable = () =>
  ({
    ok: false,
    status: 501,
    headers: new Headers({ "Content-Type": "text/plain" }),
    body: null,
    json: async () => ({}),
  }) as unknown as Response;

const INPUT = {
  audience: "社外のお客様",
  tone: "ていねいに",
  length: "3行くらい",
  label: "1回目",
};

describe("useLesson の実行制御", () => {
  let pendingTutor: Deferred;
  let rewriteCount: number;

  beforeEach(() => {
    pendingTutor = deferred();
    rewriteCount = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/lessons/rewrite-text/stream/")) {
          return streamUnavailable();
        }
        if (url.includes("/api/lessons/rewrite-text/generate/")) {
          rewriteCount += 1;
          return jsonResponse({ rewritten_text: `結果${rewriteCount}` });
        }
        if (url.includes("/api/tutor/feedback/")) {
          // 呼び出し側が解放するまで返さない
          await pendingTutor.promise;
          return jsonResponse({
            message: "読む相手を伝えると、結果が変わります。",
            emotion: "hint",
            action: "retry",
            hint_level: 1,
            completed: false,
          });
        }
        if (url.includes("/api/lessons/") && url.includes("/session/")) {
          return jsonResponse({ session: null });
        }
        return {
          ok: true,
          status: 204,
          headers: new Headers(),
          json: async () => ({}),
        } as unknown as Response;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ポーの返事を待っている間でも、次の実行を受け付ける", async () => {
    const { result } = renderHook(() => useLesson("rewrite_text_001"));

    act(() => {
      // 送信できる状態（FIRST_INPUT）まで進める
      result.current.dispatch({ type: "START" });
      result.current.dispatch({
        type: "SELECT_CASE",
        useCaseId: "work_email",
        sampleText: "たたき台の文章です。",
      });
    });

    // 1回目。ポーの返事は保留のまま止まっている
    act(() => {
      void result.current.submit(INPUT);
    });
    await waitFor(() => expect(result.current.state.runs).toHaveLength(1));
    expect(rewriteCount).toBe(1);

    // ポーの返事を待っている間に、改善を選んで送る
    act(() => {
      result.current.dispatch({ type: "NEXT" });
      result.current.dispatch({
        type: "SELECT_IMPROVEMENT",
        improvementId: "shorter",
      });
    });

    // 2回目が黙って捨てられないこと
    act(() => {
      void result.current.submit({
        ...INPUT,
        instruction: "もっと短く",
        label: "2回目",
      });
    });
    await waitFor(() =>
      expect(rewriteCount, "2回目の実行が黙って捨てられている").toBe(2),
    );
    await waitFor(() => expect(result.current.state.runs).toHaveLength(2));

    // 保留していたポーの返事が届いても壊れない
    pendingTutor.resolve(null);
    await waitFor(() =>
      expect(result.current.state.tutor.message).toContain("読む相手"),
    );
  });

  it("再開の問い合わせが遅れて届いても、進んだ画面を後ろへ戻さない", async () => {
    const pendingSession = deferred();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/rewrite-text/stream/")) {
          return streamUnavailable();
        }
        if (url.includes("/session/")) {
          await pendingSession.promise;
          return jsonResponse({
            session: {
              session_id: "s1",
              lesson_id: "rewrite_text_001",
              current_step: "SELECT_USE_CASE",
              use_case_id: "work_email",
              fill_in_values: {},
              attempt_count: 0,
              completed: false,
            },
          });
        }
        return {
          ok: true,
          status: 204,
          headers: new Headers(),
          json: async () => ({}),
        } as unknown as Response;
      }),
    );

    const { result } = renderHook(() => useLesson("rewrite_text_001"));

    // 問い合わせの返事より先に、学習者が先へ進む
    act(() => {
      result.current.dispatch({ type: "START" });
      result.current.dispatch({
        type: "SELECT_CASE",
        useCaseId: "work_email",
        sampleText: "たたき台の文章です。",
      });
    });
    expect(result.current.state.step).toBe("FIRST_INPUT");

    pendingSession.resolve(null);
    await act(async () => {
      await pendingSession.promise;
    });

    expect(result.current.state.step, "後ろの画面へ引き戻された").toBe("FIRST_INPUT");
  });

  it("実行中の二重送信は受け付けない", async () => {
    pendingTutor.resolve(null); // ポーは即座に返す
    const { result } = renderHook(() => useLesson("rewrite_text_001"));

    act(() => {
      // 送信できる状態（FIRST_INPUT）まで進める
      result.current.dispatch({ type: "START" });
      result.current.dispatch({
        type: "SELECT_CASE",
        useCaseId: "work_email",
        sampleText: "たたき台の文章です。",
      });
    });

    await act(async () => {
      // 解決を待たずに2発つづけて送る
      await Promise.all([
        result.current.submit(INPUT),
        result.current.submit(INPUT),
      ]);
    });

    expect(rewriteCount).toBe(1);
  });
});
