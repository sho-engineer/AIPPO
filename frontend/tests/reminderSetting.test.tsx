/**
 * 学習リマインダーのつまみ。
 *
 * ここは「設定はあるのに機能が無い」箇所だった。トグルが4つ並んでいたが、
 * 通知を送る処理はどこにも無く、入れても何も起きなかった。
 * 操作できるのに何も起きないのは、無いより印象が悪い。
 *
 * 学習リマインダーだけは実際にメールが届くようにしたので、ここで守るのは
 * **切ったつもりが切れていない状態を作らないこと**。
 *
 *   1. 切り替えたら、サーバーへ伝わること（端末にだけ持たせない）
 *   2. 保存できなかったら、見た目を戻すこと
 *   3. ログインしていない人に、届くように見せないこと
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "../src/pages/SettingsPage";
import { AuthProvider } from "../src/auth/AuthContext";

const SIGNED_IN = {
  authenticated: true,
  user: {
    email: "learner@example.com",
    display_name: "",
    email_verified: true,
    terms_version: "2026-08-03",
    joined_at: "2026-08-01T00:00:00+00:00",
    remind_study: true,
  },
  progress: { completed: 0, in_progress: 0, devices: 1 },
};

/** ログインしていない状態。`user` も `progress` も来ない。 */
const SIGNED_OUT: { authenticated: boolean; user?: unknown; progress?: unknown } = {
  authenticated: false,
};

function reply(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}

/** 通信を差し替える。PATCH の中身を記録して返す。 */
function serve({ me = SIGNED_IN as unknown, patchOk = true } = {}) {
  const patched: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(typeof input === "string" ? input : (input as Request).url);

    if (init?.method === "PATCH") {
      patched.push(JSON.parse(String(init.body)));
      if (!patchOk) return reply({ errors: { detail: ["だめでした"] } }, 500);
      return reply({ user: { ...SIGNED_IN.user, remind_study: false } });
    }
    if (url.includes("/accounts/me/")) return reply(me);
    if (url.includes("/ai/models/")) return reply({ models: [], default: "" });
    return reply({});
  });
  return patched;
}

const shell = () => render(
  <AuthProvider>
    <SettingsPage onBack={() => {}} />
  </AuthProvider>,
);

/** 通知設定の画面まで開く。 */
async function openNotifications(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /通知設定/ }));
  return screen.findByRole("switch", { name: /学習リマインダー/ });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("ログインしているとき", () => {
  it("切り替えると、サーバーへ伝わる", async () => {
    /*
      送るのはサーバー。端末にだけ持たせると「切ったのに届く」ことになる。
    */
    const patched = serve();
    const user = userEvent.setup();
    shell();

    const toggle = await openNotifications(user);
    await user.click(toggle);

    await waitFor(() => expect(patched).toHaveLength(1));
    expect(patched[0]).toEqual({ remind_study: false });
  });

  it("保存できなかったら、見た目を戻す", async () => {
    /*
      切ったつもりのまま届くのが一番よくない。
      失敗したなら「切れていない」と見た目でも分かるようにする。
    */
    serve({ patchOk: false });
    const user = userEvent.setup();
    shell();

    const toggle = await openNotifications(user);
    expect(toggle).toBeChecked();

    await user.click(toggle);

    await waitFor(() => expect(toggle).toBeChecked());
  });

  it("サーバーが持っている値から始まる", async () => {
    /*
      端末の値だけを見ていると、別の端末で切ったのに入ったままに見える。
    */
    serve({
      me: { ...SIGNED_IN, user: { ...SIGNED_IN.user, remind_study: false } },
    });
    const user = userEvent.setup();
    shell();

    expect(await openNotifications(user)).not.toBeChecked();
  });

  it("何が届くのかを正直に書く", async () => {
    // 4つ並んでいるが、実際に届くのは1つだけ。全部届くように見せない
    serve();
    const user = userEvent.setup();
    shell();
    await openNotifications(user);

    expect(
      screen.getByText(/実際に届くのは「学習リマインダー」だけ/),
    ).toBeInTheDocument();
  });
});

describe("ログインしていないとき", () => {
  it("届くように見せない", async () => {
    // 宛先が無いので送りようがない。登録が要ることを伝える
    serve({ me: SIGNED_OUT });
    const user = userEvent.setup();
    shell();
    await openNotifications(user);

    expect(screen.getByText(/登録が必要です/)).toBeInTheDocument();
  });

  it("サーバーへは送らない", async () => {
    const patched = serve({ me: SIGNED_OUT });
    const user = userEvent.setup();
    shell();

    const toggle = await openNotifications(user);
    await user.click(toggle);

    // 端末に残すだけ。誰の設定か決められないので送れない
    await waitFor(() => expect(patched).toHaveLength(0));
  });
});
