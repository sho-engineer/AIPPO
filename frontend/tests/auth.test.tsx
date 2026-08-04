/**
 * 登録・ログインの画面。
 *
 * 見張るのは主に2つ。
 *
 * - 合言葉やパスワードが端末に残らないこと
 * - 同意の無い登録を送らないこと
 *
 * 通信は必ず差し替える。実物の API を叩かない。
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthDialog } from "../src/components/auth/AuthDialog";
import { SaveProgressCard } from "../src/components/auth/SaveProgressCard";
import { AccountPanel } from "../src/components/settings/AccountPanel";
import { AuthProvider } from "../src/auth/AuthContext";

/** サーバーの応答を1つ作る。 */
function reply(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const GUEST = reply(200, { authenticated: false });

const SIGNED_IN = reply(200, {
  authenticated: true,
  user: {
    email: "learner@example.com",
    display_name: "たろう",
    email_verified: false,
    terms_version: "2026-08-03",
    joined_at: "2026-08-01T00:00:00+09:00",
  },
  progress: { completed: 2, in_progress: 1, devices: 1 },
});

/** URL ごとに応答を返す差し替え。指定の無い行き先は「ゲスト」。 */
function stubFetch(routes: Record<string, () => Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    for (const [fragment, make] of Object.entries(routes)) {
      if (url.includes(fragment)) return make();
    }
    return GUEST;
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

/**
 * ダイアログは AuthProvider の中で使う。
 *
 * 外で使うと `useAuth()` はゲスト用の既定値を返し、登録・ログインが
 * 「Provider がありません」で落ちる。それは画面の作りの間違いなので、
 * ここでは本番と同じ形にして中身を見る。
 */
function renderDialog(ui: React.ReactElement) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe("登録・ログインの画面", () => {
  it("同意していないうちは登録を送らない", async () => {
    const user = userEvent.setup();
    const send = stubFetch({});

    renderDialog(<AuthDialog onClose={() => {}} />);

    await user.type(screen.getByLabelText("メールアドレス"), "a@example.com");
    await user.type(screen.getByLabelText("パスワード"), "aippo-strong-pass-9");

    expect(screen.getByTestId("auth-submit")).toBeDisabled();

    // 押しても、登録の通信は起きない
    await user.click(screen.getByTestId("auth-submit"));
    const calls = send.mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes("/signup/"))).toBe(false);
  });

  it("同意したら登録を送り、引き継いだ件数を伝える", async () => {
    const user = userEvent.setup();
    stubFetch({
      "/signup/": () =>
        reply(201, {
          user: {
            email: "a@example.com",
            display_name: "",
            email_verified: false,
            terms_version: "2026-08-03",
            joined_at: "2026-08-01T00:00:00+09:00",
          },
          migration: { linked: true, sessions: 3, already_linked: false },
        }),
    });
    const done = vi.fn();

    renderDialog(<AuthDialog onClose={() => {}} onDone={done} />);

    await user.type(screen.getByLabelText("メールアドレス"), "a@example.com");
    await user.type(screen.getByLabelText("パスワード"), "aippo-strong-pass-9");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByTestId("auth-submit"));

    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(done.mock.calls[0][0]).toContain("3件");
  });

  it("パスワードも合言葉も、端末には残らない", async () => {
    const user = userEvent.setup();
    stubFetch({
      "/signin/": () =>
        reply(200, {
          user: {
            email: "a@example.com",
            display_name: "",
            email_verified: true,
            terms_version: "2026-08-03",
            joined_at: "2026-08-01T00:00:00+09:00",
          },
        }),
    });

    renderDialog(<AuthDialog mode="signin" onClose={() => {}} />);

    await user.type(screen.getByLabelText("メールアドレス"), "a@example.com");
    await user.type(screen.getByLabelText("パスワード"), "aippo-strong-pass-9");
    await user.click(screen.getByTestId("auth-submit"));

    await waitFor(() => expect(window.localStorage.length).toBe(0));

    const stored = JSON.stringify({
      local: { ...window.localStorage },
      session: { ...window.sessionStorage },
    });
    expect(stored).not.toContain("aippo-strong-pass-9");
    expect(stored.toLowerCase()).not.toContain("token");
  });

  it("ログインに失敗したら、サーバーの言い方をそのまま出す", async () => {
    const user = userEvent.setup();
    stubFetch({
      "/signin/": () =>
        reply(401, {
          code: "INVALID_CREDENTIALS",
          errors: { detail: ["メールアドレスかパスワードが違います。"] },
        }),
    });

    renderDialog(<AuthDialog mode="signin" onClose={() => {}} />);

    await user.type(screen.getByLabelText("メールアドレス"), "a@example.com");
    await user.type(screen.getByLabelText("パスワード"), "wrong-password-1");
    await user.click(screen.getByTestId("auth-submit"));

    const alert = await screen.findByTestId("auth-error");
    // どちらが違うかは言わない
    expect(alert).toHaveTextContent("メールアドレスかパスワードが違います");
    expect(alert.textContent).not.toContain("登録されていません");
  });

  it("パスワード再設定は、登録の有無を問わず同じ文を出す", async () => {
    const user = userEvent.setup();
    stubFetch({
      "/password/reset/": () =>
        reply(200, { sent: true, detail: "登録があれば、再設定の案内をお送りしました。" }),
    });

    renderDialog(<AuthDialog mode="reset" onClose={() => {}} />);

    await user.type(screen.getByLabelText("メールアドレス"), "unknown@example.com");
    await user.click(screen.getByTestId("auth-submit"));

    const sent = await screen.findByTestId("auth-reset-sent");
    expect(sent).toHaveTextContent("登録があれば");
  });
});

describe("完了画面からの誘い", () => {
  it("登録していない人には出る", async () => {
    stubFetch({});

    render(
      <AuthProvider>
        <SaveProgressCard />
      </AuthProvider>,
    );

    expect(await screen.findByTestId("save-progress")).toBeInTheDocument();
  });

  it("ログイン済みの人には出ない", async () => {
    stubFetch({ "/me/": () => SIGNED_IN });

    render(
      <AuthProvider>
        <SaveProgressCard />
      </AuthProvider>,
    );

    // 出ないことは待って確かめる。読み込み中も出ないのが正しい
    await waitFor(() => {
      expect(screen.queryByTestId("save-progress")).not.toBeInTheDocument();
    });
  });

  it("あとにする、を押したら消える", async () => {
    const user = userEvent.setup();
    stubFetch({});

    render(
      <AuthProvider>
        <SaveProgressCard />
      </AuthProvider>,
    );

    await screen.findByTestId("save-progress");
    await user.click(screen.getByRole("button", { name: "あとにする" }));

    expect(screen.queryByTestId("save-progress")).not.toBeInTheDocument();
  });
});

describe("設定のアカウント", () => {
  it("登録していない人には、登録の入口を出す", async () => {
    stubFetch({});

    render(
      <AuthProvider>
        <AccountPanel onOpenAuth={() => {}} onNotice={() => {}} />
      </AuthProvider>,
    );

    expect(await screen.findByTestId("account-open-auth")).toBeInTheDocument();
  });

  it("ログイン済みなら、メールアドレスと進み具合を出す", async () => {
    stubFetch({ "/me/": () => SIGNED_IN });

    render(
      <AuthProvider>
        <AccountPanel onOpenAuth={() => {}} onNotice={() => {}} />
      </AuthProvider>,
    );

    expect(await screen.findByTestId("account-email")).toHaveTextContent(
      "learner@example.com",
    );
    expect(screen.getByText(/終わったレッスン 2件/)).toBeInTheDocument();
  });

  it("退会は、打ち直すまで押せない", async () => {
    const user = userEvent.setup();
    stubFetch({ "/me/": () => SIGNED_IN });

    render(
      <AuthProvider>
        <AccountPanel onOpenAuth={() => {}} onNotice={() => {}} />
      </AuthProvider>,
    );

    await screen.findByTestId("account-email");
    await user.click(screen.getByRole("button", { name: "退会の手続きへ" }));

    expect(screen.getByTestId("account-delete-confirm")).toBeDisabled();

    await user.type(screen.getByLabelText(/確認のため/), "退会します");
    expect(screen.getByTestId("account-delete-confirm")).toBeEnabled();
  });
});
