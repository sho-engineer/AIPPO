/**
 * 2段階認証の画面側。
 *
 * 判断はサーバーがする。ここで見張るのは、**締め出しを作らないこと**。
 *
 *   1. 予備の合言葉は1回しか出ないので、その場で必ず見せること
 *   2. コードを通すまで「入りました」と言わないこと
 *   3. 秘密も合言葉も端末に残さないこと
 *   4. ログインで聞かれたときは、まだ入っていないこと
 *
 * どれも、間違えると「自分のアカウントに入れない」で表に出る。
 * しかも入れなくなった人はこの画面へ来られないので、後から直せない。
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthDialog } from "../src/components/auth/AuthDialog";
import { MfaGroup } from "../src/components/settings/MfaGroup";
import { AuthProvider } from "../src/auth/AuthContext";

function reply(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const OFF = reply(200, { enabled: false, pending: false, recovery_codes_left: 0 });
const ON = reply(200, { enabled: true, pending: false, recovery_codes_left: 10 });

const SETUP = reply(200, {
  secret: "ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567",
  uri: "otpauth://totp/AIPPO:a@example.com?secret=ABCDEFGH&issuer=AIPPO",
});

const CODES = [
  "AAAA111111", "BBBB222222", "CCCC333333", "DDDD444444", "EEEE555555",
  "FFFF666666", "GGGG777777", "HHHH888888", "JJJJ999999", "KKKK234567",
];

/**
 * 行き先ごとに応答を返す。
 *
 * `/mfa/` は他の行き先の一部でもあるので、長いほうから見る
 * （`/mfa/setup/` を `/mfa/` で拾わない）。
 */
function stubFetch(routes: Record<string, () => Response>) {
  const ordered = Object.entries(routes).sort(([a], [b]) => b.length - a.length);
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    for (const [fragment, make] of ordered) {
      if (url.includes(fragment)) return make();
    }
    return reply(200, { authenticated: false });
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("設定から入れる", () => {
  it("入れていない人には、聞かれる場面まで書いて誘う", async () => {
    stubFetch({ "/mfa/": () => OFF });

    render(<MfaGroup onNotice={() => {}} />);

    await screen.findByTestId("mfa-off");
    // 「毎回聞かれる」と思われると、そこで止まる
    expect(screen.getByTestId("mfa-off")).toHaveTextContent("30日おぼえます");
  });

  it("秘密は、手で入れる形とアプリで開く形の両方を出す", async () => {
    const user = userEvent.setup();
    stubFetch({ "/mfa/setup/": () => SETUP, "/mfa/": () => OFF });

    render(<MfaGroup onNotice={() => {}} />);
    await user.click(await screen.findByTestId("mfa-start"));

    // 手で入れる人のために、4文字ずつ空けたもの
    expect(await screen.findByTestId("mfa-secret")).toHaveTextContent("ABCD EFGH");
    // 携帯の人のために、そのままアプリが開くリンク
    expect(screen.getByTestId("mfa-uri")).toHaveAttribute(
      "href",
      expect.stringContaining("otpauth://totp/"),
    );
  });

  it("コードを通すまでは「入れました」と言わない", async () => {
    const user = userEvent.setup();
    stubFetch({ "/mfa/setup/": () => SETUP, "/mfa/": () => OFF });

    render(<MfaGroup onNotice={() => {}} />);
    await user.click(await screen.findByTestId("mfa-start"));
    await screen.findByTestId("mfa-setup");

    /*
      秘密を出しただけの状態。ここで入った扱いにすると、
      アプリに入れ損ねた人が次のログインで締め出される。
    */
    expect(screen.queryByTestId("mfa-on")).toBeNull();
    expect(screen.queryByTestId("mfa-recovery")).toBeNull();
  });

  it("6桁そろうまで、確認は押せない", async () => {
    const user = userEvent.setup();
    stubFetch({ "/mfa/setup/": () => SETUP, "/mfa/": () => OFF });

    render(<MfaGroup onNotice={() => {}} />);
    await user.click(await screen.findByTestId("mfa-start"));

    const confirm = await screen.findByTestId("mfa-confirm");
    expect(confirm).toBeDisabled();

    await user.type(screen.getByTestId("mfa-code"), "12345");
    expect(confirm).toBeDisabled();

    await user.type(screen.getByTestId("mfa-code"), "6");
    expect(confirm).toBeEnabled();
  });

  it("予備の合言葉を10個、その場で全部見せる", async () => {
    const user = userEvent.setup();
    stubFetch({
      "/mfa/confirm/": () => reply(200, { enabled: true, recovery_codes: CODES }),
      "/mfa/setup/": () => SETUP,
      "/mfa/": () => OFF,
    });

    render(<MfaGroup onNotice={() => {}} />);
    await user.click(await screen.findByTestId("mfa-start"));
    await user.type(await screen.findByTestId("mfa-code"), "123456");
    await user.click(screen.getByTestId("mfa-confirm"));

    const list = await screen.findByTestId("mfa-recovery-codes");
    // サーバーは照合できる形でしか持っていない。ここで出し損ねたら二度と出ない
    expect(list.querySelectorAll("li")).toHaveLength(10);
    for (const code of CODES) expect(list).toHaveTextContent(code);
  });

  it("合言葉を出したあとも、押すまでは閉じない", async () => {
    const user = userEvent.setup();
    stubFetch({
      "/mfa/confirm/": () => reply(200, { enabled: true, recovery_codes: CODES }),
      "/mfa/setup/": () => SETUP,
      "/mfa/": () => OFF,
    });

    render(<MfaGroup onNotice={() => {}} />);
    await user.click(await screen.findByTestId("mfa-start"));
    await user.type(await screen.findByTestId("mfa-code"), "123456");
    await user.click(screen.getByTestId("mfa-confirm"));
    await screen.findByTestId("mfa-recovery");

    // 「入りました」の画面へ勝手に進まない。写す時間を取る
    expect(screen.queryByTestId("mfa-on")).toBeNull();
    expect(screen.getByTestId("mfa-recovery-done")).toBeInTheDocument();
  });

  it("コードが違えば、サーバーの言い方をそのまま出す", async () => {
    const user = userEvent.setup();
    stubFetch({
      "/mfa/confirm/": () =>
        reply(400, { errors: { code: ["コードが違います。時計のずれもご確認ください"] } }),
      "/mfa/setup/": () => SETUP,
      "/mfa/": () => OFF,
    });

    render(<MfaGroup onNotice={() => {}} />);
    await user.click(await screen.findByTestId("mfa-start"));
    await user.type(await screen.findByTestId("mfa-code"), "000000");
    await user.click(screen.getByTestId("mfa-confirm"));

    expect(await screen.findByTestId("mfa-error")).toHaveTextContent("時計のずれ");
    // 失敗したのに合言葉を出さない
    expect(screen.queryByTestId("mfa-recovery-codes")).toBeNull();
  });

  it("秘密も合言葉も、端末には残らない", async () => {
    const user = userEvent.setup();
    stubFetch({
      "/mfa/confirm/": () => reply(200, { enabled: true, recovery_codes: CODES }),
      "/mfa/setup/": () => SETUP,
      "/mfa/": () => OFF,
    });

    render(<MfaGroup onNotice={() => {}} />);
    await user.click(await screen.findByTestId("mfa-start"));
    await user.type(await screen.findByTestId("mfa-code"), "123456");
    await user.click(screen.getByTestId("mfa-confirm"));
    await screen.findByTestId("mfa-recovery-codes");

    const stored = JSON.stringify({
      local: { ...window.localStorage },
      session: { ...window.sessionStorage },
    });
    expect(stored).not.toContain("ABCDEFGH");
    expect(stored).not.toContain(CODES[0]);
  });
});

describe("入っている人の画面", () => {
  it("残りの合言葉の数を出す", async () => {
    stubFetch({ "/mfa/": () => ON });

    render(<MfaGroup onNotice={() => {}} />);

    expect(await screen.findByTestId("mfa-recovery-left")).toHaveTextContent("10個");
  });

  it("残りが少ない人には、戻し方まで書く", async () => {
    stubFetch({
      "/mfa/": () => reply(200, { enabled: true, pending: false, recovery_codes_left: 1 }),
    });

    render(<MfaGroup onNotice={() => {}} />);

    // 気づかないうちに使い切ると、次に本当に困る
    expect(await screen.findByTestId("mfa-recovery-left")).toHaveTextContent("入れ直す");
  });

  it("やめるにも確認を求める", async () => {
    const user = userEvent.setup();
    const send = stubFetch({ "/mfa/": () => ON });

    render(<MfaGroup onNotice={() => {}} />);
    await user.click(await screen.findByTestId("mfa-stop"));

    // 押しただけでは何も送らない。開けたままの端末を借りた人に外させない
    expect(send.mock.calls.filter(([url]) => String(url).includes("/disable/"))).toHaveLength(0);
    await screen.findByTestId("mfa-stop-code");
    expect(screen.getByTestId("mfa-stop-confirm")).toBeDisabled();
  });

  it("予備の合言葉でもやめられる", async () => {
    const user = userEvent.setup();
    const send = stubFetch({
      "/mfa/disable/": () => reply(200, { enabled: false }),
      "/mfa/": () => OFF,
    });
    // 最初の1回だけ「入っている」を返す
    send.mockImplementationOnce(async () => ON);

    render(<MfaGroup onNotice={() => {}} />);
    await user.click(await screen.findByTestId("mfa-stop"));
    await user.type(await screen.findByTestId("mfa-stop-code"), CODES[0]);
    await user.click(screen.getByTestId("mfa-stop-confirm"));

    // 認証アプリを無くした人が、ここで詰まらないこと
    await screen.findByTestId("mfa-off");
  });
});

describe("ログインで聞かれるとき", () => {
  it("コードを聞いているあいだは、まだ入っていない", async () => {
    const user = userEvent.setup();
    stubFetch({
      "/signin/": () => reply(200, { mfa_required: true }),
      "/me": () => reply(200, { authenticated: false }),
    });

    render(
      <AuthProvider>
        <AuthDialog mode="signin" onClose={() => {}} />
      </AuthProvider>,
    );

    await user.type(screen.getByLabelText("メールアドレス"), "a@example.com");
    await user.type(screen.getByLabelText("パスワード"), "aippo-strong-pass-9");
    await user.click(screen.getByTestId("auth-submit"));

    await screen.findByTestId("auth-mfa-code");
    /*
      合言葉は合っていたが、まだログインではない。
      先に入れてしまうと、聞いている最中に他の画面が使えてしまう。
    */
    expect(screen.queryByLabelText("パスワード")).toBeNull();
  });

  it("コードが通ってはじめて閉じる", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    stubFetch({
      "/mfa/verify/": () =>
        reply(200, { verified: true, recovery_used: false, recovery_codes_left: 10 }),
      "/signin/": () => reply(200, { mfa_required: true }),
      "/me": () => reply(200, { authenticated: false }),
    });

    render(
      <AuthProvider>
        <AuthDialog mode="signin" onClose={close} />
      </AuthProvider>,
    );

    await user.type(screen.getByLabelText("メールアドレス"), "a@example.com");
    await user.type(screen.getByLabelText("パスワード"), "aippo-strong-pass-9");
    await user.click(screen.getByTestId("auth-submit"));

    await user.type(await screen.findByTestId("auth-mfa-code"), "123456");
    await user.click(screen.getByTestId("auth-submit"));

    await waitFor(() => expect(close).toHaveBeenCalled());
  });

  it("予備の合言葉で入った人には、残りを伝える", async () => {
    const user = userEvent.setup();
    const done = vi.fn();
    stubFetch({
      "/mfa/verify/": () =>
        reply(200, { verified: true, recovery_used: true, recovery_codes_left: 3 }),
      "/signin/": () => reply(200, { mfa_required: true }),
      "/me": () => reply(200, { authenticated: false }),
    });

    render(
      <AuthProvider>
        <AuthDialog mode="signin" onClose={() => {}} onDone={done} />
      </AuthProvider>,
    );

    await user.type(screen.getByLabelText("メールアドレス"), "a@example.com");
    await user.type(screen.getByLabelText("パスワード"), "aippo-strong-pass-9");
    await user.click(screen.getByTestId("auth-submit"));

    await user.type(await screen.findByTestId("auth-mfa-code"), "AAAA111111");
    await user.click(screen.getByTestId("auth-submit"));

    // 使い切ったことに気づけないと、次に本当に困る
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(done.mock.calls[0][0]).toContain("残り3個");
  });

  it("コードが違えば、閉じずにもう一度聞く", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    stubFetch({
      "/mfa/verify/": () => reply(400, { errors: { code: ["コードが違います"] } }),
      "/signin/": () => reply(200, { mfa_required: true }),
      "/me": () => reply(200, { authenticated: false }),
    });

    render(
      <AuthProvider>
        <AuthDialog mode="signin" onClose={close} />
      </AuthProvider>,
    );

    await user.type(screen.getByLabelText("メールアドレス"), "a@example.com");
    await user.type(screen.getByLabelText("パスワード"), "aippo-strong-pass-9");
    await user.click(screen.getByTestId("auth-submit"));

    await user.type(await screen.findByTestId("auth-mfa-code"), "000000");
    await user.click(screen.getByTestId("auth-submit"));

    // 指摘は入れた欄のすぐ隣に出す。上の帯だけだと、どこを直すのか分からない
    expect(await screen.findByTestId("auth-mfa-error")).toHaveTextContent("コードが違います");
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByTestId("auth-mfa-code")).toBeInTheDocument();
  });
});
