/**
 * 登録・ログインの入口。
 *
 * 見張るのは4つ。
 *
 *   1. パスキーが一番上にあること（主導線）
 *   2. **他の道を消していないこと**——端末を失った人が戻れる口を残す
 *   3. パスキーで入れなかったときに、行き止まりにしないこと
 *   4. 外部へ出るボタンを二度押せないこと
 *
 * 3つ目は見た目の話ではない。パスキーのボタンは「この端末が対応して
 * いるか」だけを見て出しており、その人が登録しているかは見ていない。
 * 登録していない人が押すと OS の画面が何も見つけられずに閉じ、
 * それを「本人がやめた」と同じ扱いにして黙っていた——**押しても
 * 何も起きないボタンが、ログイン画面のいちばん上にあった。**
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PasskeyPanel } from "../src/components/auth/PasskeyPanel";
import { SocialButtons } from "../src/components/auth/SocialButtons";

vi.mock("../src/api/passkeys", async () => {
  const actual = await vi.importActual<typeof import("../src/api/passkeys")>(
    "../src/api/passkeys",
  );
  return {
    ...actual,
    isPasskeyAvailable: vi.fn().mockResolvedValue(true),
    signInWithPasskey: vi.fn(),
    signUpWithPasskey: vi.fn(),
  };
});

vi.mock("../src/api/accounts", async () => {
  const actual = await vi.importActual<typeof import("../src/api/accounts")>(
    "../src/api/accounts",
  );
  return {
    ...actual,
    fetchSocialProviders: vi.fn().mockResolvedValue({
      providers: [
        {
          name: "google",
          label: "Google",
          start_url: "/api/v1/accounts/social/google/start/",
        },
      ],
    }),
  };
});

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("パスキーで入れなかったとき", () => {
  it("行き止まりにせず、別の入口を指す", async () => {
    /*
      「この端末にパスキーが無い」と「途中でやめた」は、ブラウザからは
      見分けられない（どちらも NotAllowedError）。どちらでも困らない
      一文にして、Google とメールを指す。
    */
    const { signInWithPasskey } = await import("../src/api/passkeys");
    const cancelled = new Error("cancelled");
    cancelled.name = "NotAllowedError";
    vi.mocked(signInWithPasskey).mockRejectedValue(cancelled);

    const user = userEvent.setup();
    render(<PasskeyPanel mode="signin" onDone={() => {}} />);

    await user.click(await screen.findByTestId("passkey-action"));

    const note = await screen.findByTestId("passkey-not-found");
    expect(note).toHaveTextContent("見つかりませんでした");
    expect(note).toHaveTextContent("Google");
    // 「失敗」ではないので、赤い注意にはしない
    expect(screen.queryByTestId("passkey-error")).not.toBeInTheDocument();
  });

  it("登録のときは、やめた人に何も言わない", async () => {
    // あちらの OS 画面は「作りますか」なので、閉じたのは気が変わったとき
    const { signUpWithPasskey } = await import("../src/api/passkeys");
    const cancelled = new Error("cancelled");
    cancelled.name = "NotAllowedError";
    vi.mocked(signUpWithPasskey).mockRejectedValue(cancelled);

    const user = userEvent.setup();
    render(
      <PasskeyPanel
        mode="signup"
        email="a@example.com"
        consent
        onDone={() => {}}
      />,
    );

    await user.click(await screen.findByTestId("passkey-action"));

    await waitFor(() =>
      expect(screen.queryByTestId("passkey-error")).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId("passkey-not-found")).not.toBeInTheDocument();
  });
});

describe("外部サービスへ出るボタン", () => {
  it("押したら閉じて、何が起きているかを返す", async () => {
    /*
      `window.location.href` を入れてから画面が変わるまでには間があり、
      そのあいだ押せたままだった。二度押すと往復が2本走る。
    */
    const user = userEvent.setup();
    render(<SocialButtons />);

    const button = await screen.findByTestId("social-google");
    await user.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveTextContent("接続しています");
  });

  it("出る前に、いた場所を控える", async () => {
    // 戻ってくるのはアプリの入口。控えないと、別のタブが
    // 「最後に見ていた画面」を書き換えていたときに違う場所へ着く
    window.localStorage.setItem(
      "aippo:place",
      JSON.stringify({ screen: "LESSON", lessonId: "rewrite_text" }),
    );

    const user = userEvent.setup();
    render(<SocialButtons />);

    await user.click(await screen.findByTestId("social-google"));

    const saved = window.localStorage.getItem("aippo:auth-return") ?? "";
    expect(saved).toContain("rewrite_text");
  });
});
