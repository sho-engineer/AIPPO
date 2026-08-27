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

/**
 * 登録の1枚目で、メールアドレスを入れて2枚目へ進む。
 *
 * 登録は2枚になっている。1枚目で道を選び（Google / パスキー / メール）、
 * 選んだ道に要るものだけを2枚目で聞く。
 */
async function toPasswordStep(
  user: ReturnType<typeof userEvent.setup>,
  email = "a@example.com",
) {
  await user.type(screen.getByLabelText("メールアドレス"), email);
  await user.click(screen.getByTestId("auth-submit"));
  await screen.findByLabelText("パスワード（確認）");
}

describe("登録・ログインの画面", () => {
  it("メールアドレスが空のうちは、次へ進めない", async () => {
    const user = userEvent.setup();
    const send = stubFetch({});

    renderDialog(<AuthDialog onClose={() => {}} />);

    expect(screen.getByTestId("auth-submit")).toBeDisabled();

    // 押しても、登録の通信は起きない
    await user.click(screen.getByTestId("auth-submit"));
    const calls = send.mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes("/signup/"))).toBe(false);
  });

  it("登録を送り、引き継いだ件数を伝える", async () => {
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

    await toPasswordStep(user);
    await user.type(screen.getByLabelText("パスワード"), "aippo-strong-pass-9");
    await user.type(
      screen.getByLabelText("パスワード（確認）"),
      "aippo-strong-pass-9",
    );
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

describe("パスワードの確認欄", () => {
  /**
   * 登録のときだけ2回入れてもらう。
   *
   * 打ち間違いは、登録した本人にしか直せない。次にログインしようと
   * した日まで気づけず、そこからは再設定のメールを待つことになる。
   * その場で気づけるようにする。
   *
   * 確認欄はサーバーへ送らない。確かめられるのはこの画面だけで、
   * 送っても増えるのは、送信の中身にパスワードがもう1つ載ることだけ。
   */
  async function open() {
    const user = userEvent.setup();
    const send = stubFetch({
      "/signup/": () =>
        reply(201, {
          user: {
            email: "a@example.com",
            display_name: "",
            email_verified: false,
            terms_version: "2026-08-03",
            joined_at: "2026-08-01T00:00:00+09:00",
          },
          migration: { linked: false, sessions: 0, already_linked: false },
        }),
    });
    renderDialog(<AuthDialog onClose={() => {}} />);
    await toPasswordStep(user);
    return { user, send };
  }

  it("2つの欄が、続けて出る", async () => {
    await open();

    expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
    expect(screen.getByLabelText("パスワード（確認）")).toBeInTheDocument();
  });

  it("どちらも new-password にする", async () => {
    // 使い回しを勧めない。保存済みのパスワードで埋めさせない
    await open();

    expect(screen.getByLabelText("パスワード")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("パスワード（確認）")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  it("空のままでは登録できない", async () => {
    // 片方だけ入れて送れると、確認欄を置いた意味が無い
    const { user } = await open();

    await user.type(screen.getByLabelText("パスワード"), "aippo-strong-pass-9");

    expect(screen.getByTestId("auth-submit")).toBeDisabled();
  });

  it("食い違っていたら、その欄の下で知らせる", async () => {
    const { user } = await open();

    await user.type(screen.getByLabelText("パスワード"), "aippo-strong-pass-9");
    await user.type(screen.getByLabelText("パスワード（確認）"), "aippo-strong-X");

    expect(screen.getByText("パスワードが一致していません。")).toBeInTheDocument();
  });

  it("食い違っている間は、登録できない", async () => {
    const { user, send } = await open();

    await user.type(screen.getByLabelText("パスワード"), "aippo-strong-pass-9");
    await user.type(screen.getByLabelText("パスワード（確認）"), "aippo-strong-X");
    await user.click(screen.getByTestId("auth-submit"));

    expect(screen.getByTestId("auth-submit")).toBeDisabled();
    const calls = send.mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes("/signup/"))).toBe(false);
  });

  it("打っている途中では、まだ言わない", async () => {
    // 2文字目で赤くなる欄は、急かされているようにしか見えない
    const { user } = await open();

    await user.type(screen.getByLabelText("パスワード"), "aippo-strong-pass-9");

    expect(
      screen.queryByText("パスワードが一致していません。"),
    ).not.toBeInTheDocument();
  });

  it("一致したら送る。確認の値は送らない", async () => {
    const { user, send } = await open();

    await user.type(screen.getByLabelText("パスワード"), "aippo-strong-pass-9");
    await user.type(
      screen.getByLabelText("パスワード（確認）"),
      "aippo-strong-pass-9",
    );
    await user.click(screen.getByTestId("auth-submit"));

    await waitFor(() => {
      const signup = send.mock.calls.find((call) =>
        String(call[0]).includes("/signup/"),
      );
      expect(signup).toBeTruthy();
      const body = String((signup?.[1] as RequestInit | undefined)?.body ?? "");
      expect(body).not.toContain("password_confirm");
    });
  });

  it("表示に切り替えると、2つとも見える", async () => {
    /*
      片方だけ見えても見比べられない。食い違ったときに、
      どちらが違うのかを探せるようにする。
    */
    const { user } = await open();

    await user.click(screen.getAllByRole("button", { name: "パスワードを表示" })[0]);

    expect(screen.getByLabelText("パスワード")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("パスワード（確認）")).toHaveAttribute(
      "type",
      "text",
    );
  });

  it("ログインの画面には出さない", async () => {
    // すでに決めたものを2回打たせる理由が無い
    renderDialog(<AuthDialog mode="signin" onClose={() => {}} />);

    expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
    expect(screen.queryByLabelText("パスワード（確認）")).not.toBeInTheDocument();
  });
});

describe("登録の入口", () => {
  /**
   * 先に道を選ばせ、そのあとで、その道に要るものだけを聞く。
   *
   * 前は1枚だった。メール・名前・同意・パスワード2つ・パスキー・Google が
   * 同時に見えていて、**Google で登録する人にもパスワード欄が見えていた**。
   * 自分に要らないものを数えてから始めることになる。
   */
  it("1枚目にパスワード欄を出さない", async () => {
    stubFetch({});
    renderDialog(<AuthDialog onClose={() => {}} />);

    expect(screen.queryByLabelText("パスワード")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("パスワード（確認）")).not.toBeInTheDocument();
    // 呼ばれたい名前も、道が決まってから聞く（Google なら聞かない）
    expect(screen.queryByLabelText(/呼ばれたい名前/)).not.toBeInTheDocument();
  });

  it("メールで続けると、パスワードだけを聞かれる", async () => {
    const user = userEvent.setup();
    stubFetch({});
    renderDialog(<AuthDialog onClose={() => {}} />);

    await toPasswordStep(user, "learner@example.com");

    expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
    // 打ったメールアドレスは、もう一度打たせない
    expect(screen.queryByLabelText("メールアドレス")).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-chosen-email")).toHaveTextContent(
      "learner@example.com",
    );
  });

  it("「変更する」で1枚目に戻れ、打った値が残っている", async () => {
    const user = userEvent.setup();
    stubFetch({});
    renderDialog(<AuthDialog onClose={() => {}} />);

    await toPasswordStep(user, "learner@example.com");
    await user.click(screen.getByTestId("auth-change-email"));

    expect(screen.getByLabelText("メールアドレス")).toHaveValue(
      "learner@example.com",
    );
  });

  it("使われているメールアドレスの指摘は、その欄が見える画面で出す", async () => {
    /*
      パスワードの画面のまま出すと、直せない指摘だけが画面に残る。
      戻して、指摘とその欄を同じ画面に置く。
    */
    const user = userEvent.setup();
    stubFetch({
      "/signup/": () =>
        reply(400, {
          code: "INVALID_INPUT",
          errors: { email: ["このメールアドレスはすでに使われています。"] },
        }),
    });
    renderDialog(<AuthDialog onClose={() => {}} />);

    await toPasswordStep(user, "taken@example.com");
    await user.type(screen.getByLabelText("パスワード"), "aippo-strong-pass-9");
    await user.type(
      screen.getByLabelText("パスワード（確認）"),
      "aippo-strong-pass-9",
    );
    await user.click(screen.getByTestId("auth-submit"));

    const field = await screen.findByLabelText("メールアドレス");
    expect(field).toHaveValue("taken@example.com");
    expect(
      screen.getByText("このメールアドレスはすでに使われています。"),
    ).toBeInTheDocument();
  });
});

describe("同意の取り方", () => {
  /**
   * **どの登録方式でも同じにする。**
   *
   * 前は Google だけ「押したら同意」で、パスキーとパスワードには
   * チェック欄があった。同じ登録なのに求められるものが違い、
   * しかもチェック欄は Google のボタンを素通りしていた——
   * 厳しく見えて、実際には守っていない形だった。
   */
  it("押す前に、同意の一文が見えている", async () => {
    stubFetch({});
    renderDialog(<AuthDialog onClose={() => {}} />);

    const dialog = screen.getByTestId("auth-dialog");
    const text = dialog.textContent ?? "";

    expect(screen.getByTestId("auth-consent")).toHaveTextContent(
      "利用規約とプライバシーポリシーに同意したことになります",
    );
    // 規約とポリシーは、この画面の中で読める
    expect(screen.getByTestId("auth-read-terms")).toBeInTheDocument();
    expect(screen.getByTestId("auth-read-privacy")).toBeInTheDocument();
    expect(text).not.toContain("同意がないと登録できません");
  });

  it("2枚目でも、同じ一文が見えている", async () => {
    const user = userEvent.setup();
    stubFetch({});
    renderDialog(<AuthDialog onClose={() => {}} />);

    await toPasswordStep(user);

    expect(screen.getByTestId("auth-consent")).toBeInTheDocument();
  });

  it("登録の送信には、同意が必ず入る", async () => {
    const user = userEvent.setup();
    const send = stubFetch({
      "/signup/": () =>
        reply(201, {
          user: {
            email: "a@example.com",
            display_name: "",
            email_verified: false,
            terms_version: "2026-08-03",
            joined_at: "2026-08-01T00:00:00+09:00",
          },
          migration: { linked: false, sessions: 0, already_linked: false },
        }),
    });
    renderDialog(<AuthDialog onClose={() => {}} />);

    await toPasswordStep(user);
    await user.type(screen.getByLabelText("パスワード"), "aippo-strong-pass-9");
    await user.type(
      screen.getByLabelText("パスワード（確認）"),
      "aippo-strong-pass-9",
    );
    await user.click(screen.getByTestId("auth-submit"));

    await waitFor(() => {
      const signup = send.mock.calls.find((call) =>
        String(call[0]).includes("/signup/"),
      );
      expect(signup).toBeTruthy();
      const body = JSON.parse(
        String((signup?.[1] as RequestInit | undefined)?.body ?? "{}"),
      );
      expect(body.accept_terms).toBe(true);
      expect(body.accept_privacy).toBe(true);
    });
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
