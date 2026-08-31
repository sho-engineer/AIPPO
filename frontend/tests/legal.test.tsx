/**
 * 規約・ポリシー・AI利用上の注意。
 *
 * 書いてあることが実装と食い違っていたら、それは嘘になる。
 * ここでは「読める形で出ているか」と「公開前に埋める箇所が
 * 残っていないか」を見る。中身の正しさは人が読んで確かめる。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "../src/pages/SettingsPage";
import { AuthProvider } from "../src/auth/AuthContext";
import {
  AI_NOTES,
  LEGAL_DOCUMENTS,
  OPERATOR,
  PRIVACY,
  TERMS,
  isOperatorFilled,
} from "../src/content/legal";

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response,
  );
});

describe("文面そのもの", () => {
  it("3つとも用意されている", () => {
    expect(LEGAL_DOCUMENTS.map((document) => document.id)).toEqual([
      "terms",
      "privacy",
      "ai-notes",
    ]);
  });

  it("どれも中身が空でない", () => {
    for (const document of LEGAL_DOCUMENTS) {
      expect(document.sections.length).toBeGreaterThan(0);
      for (const section of document.sections) {
        expect(section.body.length).toBeGreaterThan(0);
      }
    }
  });

  it("入力してはいけないものが、規約とAIの注意の両方に書いてある", () => {
    for (const document of [TERMS, AI_NOTES]) {
      const text = document.sections.flatMap((section) => section.body).join("");
      expect(text).toContain("パスワード");
      expect(text).toContain("APIキー");
      expect(text).toContain("クレジットカード番号");
    }
  });

  it("入力した文章を初期設定では保存しないことが、ポリシーに書いてある", () => {
    const text = PRIVACY.sections.flatMap((section) => section.body).join("");
    expect(text).toContain("初期設定では保存しません");
  });

  it("運営者の欄は、埋めるまで「公開前に記入」のまま残る", () => {
    /*
      勝手に社名や住所を決めない。事実でないことを書くと、
      それ自体が問題になる。埋め忘れは画面にそのまま出るので気づける。

      ここは「まだ埋まっていない」ことではなく、**埋まっていない項目が
      画面に出る形で残る**ことを見ている。空文字にして黙って消す作りに
      変わったら落ちる。空欄は「書く欄が無い」と見分けが付かない。
    */
    for (const value of Object.values(OPERATOR)) {
      expect(value.trim()).not.toBe("");
    }
    if (!isOperatorFilled()) {
      expect(OPERATOR.name).toBe("（公開前に記入）");
    }
  });

  it("埋めたかどうかを、機械が見分けられる", () => {
    /*
      規約は普段だれも開かない。人の目に頼ると「（公開前に記入）」の
      まま何ヶ月も出ていることが起こる。

      値そのものは配置ごとに変わる（VITE_OPERATOR_* で外から入れる）ので、
      ここで見るのは判定が働くことだけ。実際に埋まっているかは、
      公開前の確認で isOperatorFilled() を使って止める。
    */
    expect(isOperatorFilled()).toBe(
      Object.values(OPERATOR).every((value) => value !== "（公開前に記入）"),
    );
  });
});

describe("設定から読む", () => {
  it("一覧から本文へ入り、戻れる", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <SettingsPage onBack={() => {}} onOpenRecord={() => {}} onOpenSaved={() => {}} />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: /規約とポリシー/ }));
    await user.click(screen.getByTestId("legal-open-privacy"));

    expect(screen.getByTestId("legal-privacy")).toBeInTheDocument();

    // 1段ずつ戻る。いきなり設定の一覧まで飛ばさない
    await user.click(screen.getByRole("button", { name: "前の画面へ戻る" }));
    expect(screen.getByTestId("legal-open-privacy")).toBeInTheDocument();
  });

  /*
    以前は設定のいちばん下に「AIPPOについて」を置き、3本の規約への
    近道を並べていた。外した——**同じ行き先が1画面に2か所ある**と、
    押した人は「別のものかもしれない」と考える。3本とも
    「規約とポリシー」の中にあり、そこは上のテストが守っている。
  */
  it("規約への入口は、一覧の1行だけ", async () => {
    render(
      <AuthProvider>
        <SettingsPage onBack={() => {}} onOpenRecord={() => {}} onOpenSaved={() => {}} />
      </AuthProvider>,
    );

    for (const document of LEGAL_DOCUMENTS) {
      expect(
        screen.queryByRole("button", { name: document.title }),
      ).toBeNull();
    }
    expect(screen.getByRole("button", { name: /規約とポリシー/ })).toBeInTheDocument();
  });
});
