/**
 * 設定の一覧に、何を出して何を出さないか。
 *
 * 決まりが変わった
 * ----------------
 * 前は「まだ無いものも、押せない形で置いておく」だった（来る予定が
 * あると伝えるため）。並べてみると、12行のうち6行が灰色で、押しても
 * 何も起きない画面になっていた。**設定を開く人は予定を知りに来ていない**。
 * 探しものの邪魔になるだけなので、いまは「使えるものだけを出す」。
 *
 * このテストが守るのは、その決まりと、決まりを守るときに壊しやすい2つ。
 *
 * 1. 画面から消したことで、**端末に残っている値まで消していない**こと。
 *    仕組みが用意できた日に、そのときの選択がそのまま効いてほしい。
 * 2. 消す側へ寄せすぎて、**動く設定まで消していない**こと。
 */

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "../src/pages/SettingsPage";
import { AuthProvider } from "../src/auth/AuthContext";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../src/lib/settings";

/**
 * 仕組みがまだ無いので、設定に出さないもの。
 *
 * 作ったらここから外し、`OPEN` へ移す。
 */
const NOT_SHIPPED = [
  "AI設定",
  "学習設定",
  "外部連携",
  "サブスクリプション",
  "言語設定",
  "ヘルプ・サポート",
];

/** 押して下位画面へ入れる項目。ここに挙げたものは全部動く。 */
const OPEN = [
  "学習記録",
  "あとで見る",
  "アカウント設定",
  "AI利用状況",
  "通知",
  "音",
  "学習データ・プライバシー",
  "規約とポリシー",
];

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  // ログイン状態などの問い合わせ。設定画面はここが空でも開く
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response,
  );
});

/*
  開いて、起動時の問い合わせ（ログイン状態）が落ち着くまで待つ。
  待たずに確かめると、テストが終わったあとに描き直しが走る。
*/
const open = async () => {
  render(
    <AuthProvider>
      <SettingsPage onBack={() => {}} onOpenRecord={() => {}} onOpenSaved={() => {}} />
    </AuthProvider>,
  );
  await act(async () => {});
};

const row = (name: string) => screen.getByRole("button", { name: new RegExp(name) });

describe("まだ無いものは載せない", () => {
  it.each(NOT_SHIPPED)("%s は、一覧のどこにも出てこない", async (name) => {
    await open();
    expect(screen.queryByRole("button", { name: new RegExp(name) })).toBeNull();
  });

  it("押せない行がひとつも無い", async () => {
    await open();
    /*
      1つずつ名前で見るのではなく、画面じゅうのボタンを見る。
      名前を書き忘れた行が増えても、これなら気づける。
    */
    const dead = screen
      .getAllByRole("button")
      .filter((button) => (button as HTMLButtonElement).disabled);
    expect(dead).toEqual([]);
  });

  it("「準備中」という断り書きが、どこにも残っていない", async () => {
    await open();
    // 行を消したのに文言だけ残る、が起きやすい
    expect(screen.queryByText(/準備中/)).toBeNull();
  });
});

describe("消したのは画面からだけ", () => {
  it("端末に残っている言語の選択を書き換えない", async () => {
    // 以前の版で English を選んだ人の端末を想定する。
    // 画面から消えただけで、保存してある値まで消しては困る
    // （辞書が用意できた日に、その選択がそのまま効く）
    saveSettings({ ...DEFAULT_SETTINGS, language: "en" });

    await open();

    expect(loadSettings().language).toBe("en");
  });

  it("端末に残っている通知の選択を書き換えない", async () => {
    // 配信の仕組みができた日に、選んだとおりに届いてほしい
    saveSettings({ ...DEFAULT_SETTINGS, notifyUpdates: true });

    const user = userEvent.setup();
    await open();
    await user.click(row("通知"));

    expect(loadSettings().notifyUpdates).toBe(true);
  });
});

describe("動く設定は残っている", () => {
  it.each(OPEN)("%s は押せる", async (name) => {
    await open();
    expect(row(name)).toBeEnabled();
  });

  it("一覧は3つに束ねてある", async () => {
    await open();
    /*
      束ねずに8行を流すと、どこに何があるかを毎回上から探すことになる。
      束の数を見るのは、名前の付け替えでは落ちず、束をやめたときだけ
      落ちるようにするため。
    */
    for (const label of ["学習", "アカウント", "アプリ"]) {
      expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
    }
  });

  it("学習の束には、学習記録とあとで見るが入っている", async () => {
    await open();
    const list = screen.getByTestId("settings-learning");

    expect(within(list).getByRole("button", { name: /学習記録/ })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: /あとで見る/ })).toBeInTheDocument();
  });
});

describe("通知", () => {
  it("つまみは、実際に届く1つだけ", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(row("通知"));

    /*
      前は4つ並べ、うち3つを「準備中」で止めていた。
      灰色のつまみが3つ並ぶ画面は、1つしか動かないことを伝えるのに
      いちばん回りくどい形だった。
    */
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.getByRole("switch", { name: /学習リマインダー/ })).toBeEnabled();
  });

  it("学習リマインダーは、いまも切り替えられる", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(row("通知"));
    await user.click(screen.getByRole("switch", { name: /学習リマインダー/ }));

    expect(loadSettings().remindStudy).toBe(!DEFAULT_SETTINGS.remindStudy);
  });
});

describe("使う人の言葉で書く", () => {
  it("「Credit」とは書かない", async () => {
    await open();
    // こちらの帳簿の言葉。見に来る人が知りたいのは「あと何回頼めるか」
    expect(screen.queryByText(/Credit/)).toBeNull();
  });

  it("行に説明文を添えない", async () => {
    await open();
    /*
      8行に8本の説明が付くと、探しているだけの人に16行を読ませる。
      行の名前で分からないなら、直すべきは名前のほう。
    */
    expect(screen.queryByText("登録・ログイン・パスワード・退会")).toBeNull();
    expect(screen.queryByText("どの教材を、どこまで進めたか")).toBeNull();
  });
});
