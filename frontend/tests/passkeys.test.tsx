/**
 * パスキーの画面側。
 *
 * ここで見るのは、判断ではなく**詰め替え**と**出し分け**。
 * 誰かを決めるのも署名を確かめるのもサーバーの仕事で、画面は
 * ブラウザとサーバーのあいだで形を直しているだけ。
 * その詰め替えを間違えると「なぜか登録できない」だけの症状になり、
 * 原因が非常に分かりにくい。だから形そのものを見張る。
 *
 * 見るのは4つ。
 *
 *   1. 使えない端末では出さないこと（押して失敗するボタンを作らない）
 *   2. サーバーへ送る形が正しいこと（base64url に直っている）
 *   3. 「やめる」を押しただけの人に、失敗と言わないこと
 *   4. 登録に必要なものが揃うまで押せないこと
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PasskeyPanel } from "../src/components/auth/PasskeyPanel";
import { isPasskeyAvailable, wasCancelled } from "../src/api/passkeys";

/** サーバーが返す「作ってください」。base64url で来る。 */
const CREATE_OPTIONS = {
  challenge: "Y2hhbGxlbmdl",
  rp: { id: "localhost", name: "AIPPO" },
  user: { id: "MQ", name: "learner@example.com", displayName: "learner@example.com" },
  pubKeyCredParams: [{ type: "public-key", alg: -7 }],
  excludeCredentials: [],
};

const GET_OPTIONS = {
  challenge: "Y2hhbGxlbmdl",
  rpId: "localhost",
  allowCredentials: [],
};

function reply(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}

/** ブラウザが返す資格情報のふり。中身は ArrayBuffer。 */
function fakeCredential(kind: "create" | "get") {
  const bytes = (values: number[]) => new Uint8Array(values).buffer;
  const shared = {
    id: "Y3JlZC1pZA",
    rawId: bytes([1, 2, 3]),
    type: "public-key",
    getClientExtensionResults: () => ({}),
  };

  if (kind === "create") {
    return {
      ...shared,
      response: {
        clientDataJSON: bytes([4, 5, 6]),
        attestationObject: bytes([7, 8, 9]),
        getTransports: () => ["internal"],
      },
    };
  }
  return {
    ...shared,
    response: {
      clientDataJSON: bytes([4, 5, 6]),
      authenticatorData: bytes([10, 11, 12]),
      signature: bytes([13, 14, 15]),
      userHandle: null,
    },
  };
}

/** window.PublicKeyCredential と navigator.credentials を用意する。 */
function withPasskeySupport(behaviour: {
  create?: () => Promise<unknown>;
  get?: () => Promise<unknown>;
} = {}) {
  (window as unknown as { PublicKeyCredential: unknown }).PublicKeyCredential = function () {};
  Object.defineProperty(navigator, "credentials", {
    configurable: true,
    value: {
      create: behaviour.create ?? (async () => fakeCredential("create")),
      get: behaviour.get ?? (async () => fakeCredential("get")),
    },
  });
}

function withoutPasskeySupport() {
  delete (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;
}

beforeEach(() => {
  vi.restoreAllMocks();
  withPasskeySupport();
});

afterEach(() => {
  withoutPasskeySupport();
});

describe("使えるかどうかの見分け", () => {
  it("ブラウザが対応していなければ、サーバーに聞きにもいかない", async () => {
    withoutPasskeySupport();
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(await isPasskeyAvailable()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("サーバーが「使えない」と言えば使えない", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      reply({ available: false }),
    );

    expect(await isPasskeyAvailable()).toBe(false);
  });

  it("サーバーに聞けなければ、出さない側に倒す", async () => {
    // 押して必ず失敗するボタンより、出ないほうがよい
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("offline");
    });

    expect(await isPasskeyAvailable()).toBe(false);
  });

  it("両方そろってはじめて使える", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      reply({ available: true }),
    );

    expect(await isPasskeyAvailable()).toBe(true);
  });
});

describe("やめたのか、失敗したのか", () => {
  it("ブラウザの中断は「やめた」として扱う", () => {
    const cancelled = new Error("cancelled");
    cancelled.name = "NotAllowedError";
    const aborted = new Error("aborted");
    aborted.name = "AbortError";

    expect(wasCancelled(cancelled)).toBe(true);
    expect(wasCancelled(aborted)).toBe(true);
  });

  it("それ以外は失敗として扱う", () => {
    expect(wasCancelled(new Error("boom"))).toBe(false);
    expect(wasCancelled("boom")).toBe(false);
  });
});

describe("ログインの入口", () => {
  it("使えない端末には、そもそも出さない", async () => {
    withoutPasskeySupport();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply({ available: true }));

    render(<PasskeyPanel mode="signin" onDone={() => {}} />);

    await waitFor(() =>
      expect(screen.queryByTestId("passkey-action")).not.toBeInTheDocument(),
    );
  });

  it("押すと、署名した中身を base64url でサーバーへ送る", async () => {
    const sent: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(typeof input === "string" ? input : (input as Request).url);
      if (url.includes("/support/")) return reply({ available: true });
      if (url.includes("/signin/options/")) return reply(GET_OPTIONS);
      if (url.includes("/signin/verify/")) {
        sent.push(JSON.parse(String(init?.body)));
        return reply({ user: { email: "learner@example.com" } });
      }
      return reply({});
    });

    const done = vi.fn();
    render(<PasskeyPanel mode="signin" onDone={done} />);

    const button = await screen.findByTestId("passkey-action");
    await userEvent.click(button);

    await waitFor(() => expect(done).toHaveBeenCalled());

    const credential = sent[0].credential as {
      response: Record<string, string>;
      rawId: string;
    };
    // ArrayBuffer のままでは JSON に載らない。base64url の文字列になっていること
    expect(typeof credential.rawId).toBe("string");
    expect(typeof credential.response.clientDataJSON).toBe("string");
    expect(typeof credential.response.signature).toBe("string");
    // base64url は + と / を使わない
    expect(credential.response.signature).not.toMatch(/[+/=]/);
  });

  it("やめたときは、失敗と言わない", async () => {
    const cancelled = new Error("cancelled");
    cancelled.name = "NotAllowedError";
    withPasskeySupport({
      get: async () => {
        throw cancelled;
      },
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/support/")) return reply({ available: true });
      return reply(GET_OPTIONS);
    });

    const done = vi.fn();
    render(<PasskeyPanel mode="signin" onDone={done} />);
    await userEvent.click(await screen.findByTestId("passkey-action"));

    await waitFor(() =>
      expect(screen.queryByTestId("passkey-error")).not.toBeInTheDocument(),
    );
    expect(done).not.toHaveBeenCalled();
  });
});

describe("登録の入口", () => {
  const serve = (sent?: Record<string, unknown>[]) =>
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(typeof input === "string" ? input : (input as Request).url);
      if (url.includes("/support/")) return reply({ available: true });
      if (url.includes("/signup/options/")) {
        sent?.push(JSON.parse(String(init?.body)));
        return reply(CREATE_OPTIONS);
      }
      if (url.includes("/signup/verify/")) {
        sent?.push(JSON.parse(String(init?.body)));
        return reply({ user: {}, migration: {} }, 201);
      }
      return reply({});
    });

  it("メールと同意がそろうまで押せない", async () => {
    serve();

    const { rerender } = render(
      <PasskeyPanel mode="signup" email="" consent={false} onDone={() => {}} />,
    );
    expect(await screen.findByTestId("passkey-action")).toBeDisabled();

    // メールだけでは足りない（同意が要る）
    rerender(
      <PasskeyPanel mode="signup" email="a@example.com" consent={false} onDone={() => {}} />,
    );
    expect(screen.getByTestId("passkey-action")).toBeDisabled();

    rerender(
      <PasskeyPanel mode="signup" email="a@example.com" consent onDone={() => {}} />,
    );
    expect(screen.getByTestId("passkey-action")).toBeEnabled();
  });

  it("合言葉を一度も送らない", async () => {
    const sent: Record<string, unknown>[] = [];
    serve(sent);

    const done = vi.fn();
    render(
      <PasskeyPanel mode="signup" email="learner@example.com" consent onDone={done} />,
    );
    await userEvent.click(await screen.findByTestId("passkey-action"));

    await waitFor(() => expect(done).toHaveBeenCalled());

    // 覚えるものを無くすのが目的なので、裏で作って送ったりしない
    for (const body of sent) {
      expect(JSON.stringify(body)).not.toContain("password");
    }
    expect(sent[0]).toMatchObject({
      email: "learner@example.com",
      accept_terms: true,
      accept_privacy: true,
    });
  });

  it("サーバーが断ったら、その理由を出す", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/support/")) return reply({ available: true });
      return reply(
        {
          code: "EMAIL_TAKEN",
          errors: { email: ["このメールアドレスはすでに使われています。"] },
        },
        400,
      );
    });

    render(
      <PasskeyPanel mode="signup" email="taken@example.com" consent onDone={() => {}} />,
    );
    await userEvent.click(await screen.findByTestId("passkey-action"));

    expect(await screen.findByTestId("passkey-error")).toHaveTextContent(
      "このメールアドレスはすでに使われています。",
    );
  });
});
