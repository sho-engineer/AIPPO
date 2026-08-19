/**
 * 設定の中の「まだ無いもの」の見せ方。
 *
 * 守りたいのは2つ。
 *
 * 1. 操作できるのに何も起きない項目を作らない。
 *    選べるのに効かない設定は、無い設定より印象が悪い。
 * 2. 「まだ無い」の止め方を、1画面の中で1通りに揃える。
 *    ある行は開けて中で断り、ある行は開けない、と分けると、
 *    開けた人は「こっちは動くのかもしれない」と読んでしまう。
 *
 * 言語設定は 1 に当たっていた（English を選べるのに訳文が1語も無い）ので、
 * 外部連携・サブスクリプション・ヘルプと同じ形へ寄せた。
 * このテストは、その形が崩れたら落ちる。
 */

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "../src/pages/SettingsPage";
import { AuthProvider } from "../src/auth/AuthContext";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../src/lib/settings";

/** 準備中として止めてある項目。増えたらここへ足す。 */
const COMING_SOON = ["外部連携", "サブスクリプション", "言語設定", "ヘルプ・サポート"];

/** 押して下位画面へ入れる項目。 */
const OPEN = [
  "アカウント設定",
  "AI設定",
  "学習設定",
  "通知設定",
  "学習データ・プライバシー",
  "規約とポリシー",
];

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  // モデル一覧などの問い合わせ。設定画面はここが空でも開く
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response,
  );
});

/*
  開いて、起動時の問い合わせ（モデル一覧・ログイン状態）が落ち着くまで待つ。
  待たずに確かめると、テストが終わったあとに描き直しが走る。
*/
const open = async () => {
  render(
    <AuthProvider>
      <SettingsPage onBack={() => {}} />
    </AuthProvider>,
  );
  await act(async () => {});
};

const row = (name: string) => screen.getByRole("button", { name: new RegExp(name) });

describe("準備中の項目", () => {
  it.each(COMING_SOON)("%s は押せない", async (name) => {
    await open();
    expect(row(name)).toBeDisabled();
  });

  it.each(COMING_SOON)("%s には、押せない理由が書いてある", async (name) => {
    await open();
    // 黙って無反応にしない。何が起きないのかをその行に書く
    expect(row(name)).toHaveTextContent("準備中です");
  });

  it("言語設定は、いま日本語だけであることまで書く", async () => {
    await open();
    // 「準備中です」だけだと、いま何語で動いているのかが分からない
    expect(row("言語設定")).toHaveTextContent("いまは日本語のみです");
  });
});

describe("言語の選択", () => {
  it("English を選ぶ口がどこにも無い", async () => {
    const user = userEvent.setup();
    await open();

    // 押しても下位画面へ入らない（押せないボタンなので弾かれてよい）
    await user.click(row("言語設定")).catch(() => {});

    expect(screen.queryByText("表示する言語")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "English" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "日本語" })).not.toBeInTheDocument();
  });

  it("止めたことで、端末に残っている設定を書き換えない", async () => {
    // 以前の版で English を選んだ人の端末を想定する。
    // 画面から触れなくなっただけで、保存してある値まで消しては困る
    // （辞書が用意できた日に、その選択がそのまま効く）
    saveSettings({ ...DEFAULT_SETTINGS, language: "en" });

    const user = userEvent.setup();
    await open();
    await user.click(row("言語設定")).catch(() => {});

    expect(loadSettings().language).toBe("en");
  });
});

describe("開ける項目は、開いたままにする", () => {
  it.each(OPEN)("%s は押せる", async (name) => {
    await open();
    // 止める側へ寄せすぎて、動く設定まで塞いでいないこと
    expect(row(name)).toBeEnabled();
  });

  it("通知設定は、いまも切り替えられる", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(row("通知設定"));
    const toggle = screen.getByRole("switch", { name: /学習リマインダー/ });
    await user.click(toggle);

    // 送る仕組みがまだ無くても、選んだこと自体は覚える。
    // 言語と違い、こちらは「届いたときにどうするか」の意思表示になる
    expect(loadSettings().remindStudy).toBe(!DEFAULT_SETTINGS.remindStudy);
  });
});

describe("設定の一覧", () => {
  it("止めた項目も一覧からは消さない", async () => {
    await open();
    const list = screen.getAllByRole("list")[0];

    // 消すと「その機能は考えていない」に見える。
    // 来る予定があるものは、押せない形で置いておく
    for (const name of COMING_SOON) {
      expect(
        within(list).getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
  });
});
