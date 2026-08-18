/**
 * ログインが切れたら、画面もログアウトになること。
 *
 * ログインには期限がある（サーバー側の SESSION_COOKIE_AGE と
 * SESSION_ABSOLUTE_MAX_AGE）。開いたままの画面ではその瞬間が来ても
 * 誰も気づかないので、**サーバーから見ればログアウトしているのに
 * 画面だけログイン中のまま**という状態が起きる。
 *
 * その画面は、ただ間違った表示をしているだけではない。
 * 「登録できている」と思って進めた記録が、どこにも残らない。
 * 気づくのは、別の端末で開いて何も無いと分かったときになる。
 *
 * ここで見張るのは3つ。
 *
 *   1. 表に戻ったときに聞き直すこと
 *   2. 聞いた結果が「ログインしていない」なら、画面もそうなること
 *   3. ゲストには聞きに行かないこと（無駄な通信をさせない）
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { AuthProvider, useAuth } from "../src/auth/AuthContext";

const SIGNED_IN = {
  authenticated: true,
  user: {
    email: "learner@example.com",
    display_name: "",
    email_verified: false,
    terms_version: "2026-08-03",
    joined_at: "2026-08-18T00:00:00+00:00",
  },
  progress: { completed: 0, in_progress: 0, devices: 1 },
};

const SIGNED_OUT = { authenticated: false };

function reply(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

/** 画面が表に戻ったことにする。 */
function comeBackToTheTab() {
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  // jsdom の既定は "visible" だが、明示しておく
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});

afterEach(() => {
  cleanup();
});

describe("ログインが切れたとき", () => {
  it("表に戻ったときに聞き直し、切れていればログアウトになる", async () => {
    /*
      1回目はログイン中、2回目からは切れている、という答えを返す。
      本物のサーバーで期限が来たときと同じ形。
    */
    let answered = 0;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => reply(answered++ === 0 ? SIGNED_IN : SIGNED_OUT));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.email).toBe("learner@example.com"));

    const before = fetchMock.mock.calls.length;
    comeBackToTheTab();

    await waitFor(() => expect(result.current.user).toBeNull());
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    // 進み具合も一緒に消えること。持ち主がいない数字を出さない
    expect(result.current.progress).toBeNull();
  });

  it("聞けなかったときも、ログイン中のままにしない", async () => {
    /*
      通信が切れているのか、ログインが切れているのかは区別できない。
      区別できないときは「ログインしていない」側に倒す。
      逆に倒すと、できないことをできるように見せてしまう。
    */
    let answered = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (answered++ === 0) return reply(SIGNED_IN);
      throw new Error("offline");
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).not.toBeNull());

    comeBackToTheTab();

    await waitFor(() => expect(result.current.user).toBeNull());
  });

  it("ログインが続いていれば、そのまま", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply(SIGNED_IN));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).not.toBeNull());

    comeBackToTheTab();

    await waitFor(() => expect(result.current.user?.email).toBe("learner@example.com"));
  });
});

describe("聞き直す回数", () => {
  it("タブを行き来しただけで、何度も聞きにいかない", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply(SIGNED_IN));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).not.toBeNull());

    const before = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    for (let i = 0; i < 5; i += 1) comeBackToTheTab();

    // 最短の間隔（30秒）を空けるので、5回行き来しても1回だけ
    await waitFor(() =>
      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBeLessThanOrEqual(before + 1),
    );
  });

  it("ゲストには聞きにいかない", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => reply(SIGNED_OUT));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const before = fetchMock.mock.calls.length;
    for (let i = 0; i < 3; i += 1) comeBackToTheTab();

    // 登録せずに学べるのが前提なので、ここで鳴らすと全員に無駄が出る
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});
