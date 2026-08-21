/**
 * Credit の残高画面。
 *
 * ここで守るのは4つ。
 *
 *   1. ゲストには残高そのものを出さない
 *      （0 と出すと「使い切った」と読めるが、まだ持っていないだけ）
 *   2. スタンプが埋まっているゲストには、失われていないことを伝える
 *   3. 受け取りボタンは、届いているときだけ出す
 *   4. 受け取るとき、画面から金額を送らない（サーバーが数える）
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreditPanel } from "../src/components/rewards/CreditPanel";

const GUEST_CREDITS = {
  requires_account: true,
  balance: null,
  lifetime_earned: null,
  lifetime_spent: null,
  transactions: [],
};

const MEMBER_CREDITS = {
  requires_account: false,
  balance: 4,
  lifetime_earned: 6,
  lifetime_spent: 2,
  transactions: [
    {
      type: "reward",
      amount: 2,
      reason: "3個達成",
      balance_after: 4,
      created_at: "2026-08-21T00:00:00Z",
    },
  ],
};

function stampState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    paths: [
      {
        path_id: "p1",
        title: "はじめの一歩",
        done: 3,
        total: 9,
        stamps: [],
        milestones: [],
      },
    ],
    signed_in: false,
    unclaimed_waiting: false,
    ...overrides,
  };
}

/** fetch を、呼ばれた先ごとに返す中身へ振り分ける。 */
function stubFetch(credits: unknown, stamps: unknown, claim?: unknown) {
  const calls: { url: string; body: string | null }[] = [];

  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    calls.push({ url, body: (init?.body as string) ?? null });

    const reply = (value: unknown) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => value,
      } as Response);

    if (url.includes("/rewards/credits/")) return reply(credits);
    if (url.includes("/rewards/stamps/")) return reply(stamps);
    if (url.includes("/rewards/claim/")) return reply(claim ?? {});
    // 合言葉の取得など、その他は素通しにする
    return reply({});
  });

  return calls;
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("ゲストのとき", () => {
  it("残高そのものを出さない", async () => {
    stubFetch(GUEST_CREDITS, stampState());

    render(<CreditPanel onOpenAuth={() => {}} onNotice={() => {}} />);

    await screen.findByTestId("credit-panel");
    /*
      「0」と出すと、使い切ったようにも読める。
      実際にはまだ持っていないだけなので、数字そのものを見せない。
    */
    expect(screen.queryByTestId("credit-balance")).not.toBeInTheDocument();
  });

  it("スタンプが埋まっていれば、失われていないことを伝える", async () => {
    stubFetch(GUEST_CREDITS, stampState({ unclaimed_waiting: true }));

    render(<CreditPanel onOpenAuth={() => {}} onNotice={() => {}} />);

    const waiting = await screen.findByTestId("credit-waiting");
    expect(waiting).toHaveTextContent("スタンプは獲得しています");
  });

  it("保存への導線がある（行き止まりにしない）", async () => {
    const onOpenAuth = vi.fn();
    stubFetch(GUEST_CREDITS, stampState({ unclaimed_waiting: true }));
    const user = userEvent.setup();

    render(<CreditPanel onOpenAuth={onOpenAuth} onNotice={() => {}} />);

    await user.click(await screen.findByTestId("credit-signup"));
    expect(onOpenAuth).toHaveBeenCalledTimes(1);
  });
});

describe("登録している人のとき", () => {
  it("残高と、これまでの獲得・使用が出る", async () => {
    stubFetch(MEMBER_CREDITS, stampState({ signed_in: true }));

    render(<CreditPanel onOpenAuth={() => {}} onNotice={() => {}} />);

    expect(await screen.findByTestId("credit-balance")).toHaveTextContent("4");
    expect(screen.getByTestId("credit-earned")).toHaveTextContent("6");
    expect(screen.getByTestId("credit-spent")).toHaveTextContent("2");
  });

  it("届いていないときは、受け取るボタンを出さない", async () => {
    stubFetch(MEMBER_CREDITS, stampState({ signed_in: true }));

    render(<CreditPanel onOpenAuth={() => {}} onNotice={() => {}} />);

    await screen.findByTestId("credit-balance");
    expect(screen.queryByTestId("credit-claim")).not.toBeInTheDocument();
  });

  it("届いているときだけ、受け取るボタンが出る", async () => {
    stubFetch(
      MEMBER_CREDITS,
      stampState({ signed_in: true, unclaimed_waiting: true }),
    );

    render(<CreditPanel onOpenAuth={() => {}} onNotice={() => {}} />);

    expect(await screen.findByTestId("credit-claim")).toBeInTheDocument();
  });

  it("受け取るとき、画面から金額を送らない", async () => {
    /*
      いくら渡すかはサーバーが数える。画面が金額を言えると、
      そのまま書き換えて送れてしまう（設計方針 §36）。
    */
    const calls = stubFetch(
      MEMBER_CREDITS,
      stampState({ signed_in: true, unclaimed_waiting: true }),
      { granted: 2, balance: 6 },
    );
    const user = userEvent.setup();

    render(<CreditPanel onOpenAuth={() => {}} onNotice={() => {}} />);
    await user.click(await screen.findByTestId("credit-claim"));

    await waitFor(() => {
      const claim = calls.find((call) => call.url.includes("/rewards/claim/"));
      expect(claim, "受け取りが送られていない").toBeTruthy();
      const body = claim?.body ?? "";
      expect(body).not.toMatch(/amount/);
      expect(body).not.toMatch(/credit/i);
    });
  });

  it("受け取った結果を、そのまま知らせる", async () => {
    const onNotice = vi.fn();
    stubFetch(
      MEMBER_CREDITS,
      stampState({ signed_in: true, unclaimed_waiting: true }),
      { granted: 2, balance: 6 },
    );
    const user = userEvent.setup();

    render(<CreditPanel onOpenAuth={() => {}} onNotice={onNotice} />);
    await user.click(await screen.findByTestId("credit-claim"));

    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith("2 Credit を受け取りました。"),
    );
  });
});

describe("読み込めなかったとき", () => {
  it("行き止まりにせず、やり直せる", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));

    render(<CreditPanel onOpenAuth={() => {}} onNotice={() => {}} />);

    expect(await screen.findByTestId("credit-retry")).toBeInTheDocument();
  });
});
