/**
 * Google と LINE のボタン、および戻ってきたときの知らせ。
 *
 * 見張るのは2つ。
 *
 * - 設定が入っていない先のボタンを出さないこと
 * - サーバーから受け取った文字を、そのまま画面に出さないこと
 *
 * 2つめは差し込みの入口になる。URL に載った文字を信じてはいけない。
 */

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SocialButtons } from "../src/components/auth/SocialButtons";
import { useSocialResult } from "../src/auth/useSocialResult";
import { SOCIAL_COPY } from "../src/content/ui";

function reply(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function stubProviders(names: string[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    reply({
      providers: names.map((name) => ({
        name,
        label: name === "google" ? "Google" : "LINE",
        start_url: `/api/v1/accounts/social/${name}/start/`,
      })),
    }),
  );
}

/** URL の検索文字列を差し替える。戻りの再現に使う。 */
function setQuery(query: string) {
  window.history.replaceState({}, "", `/${query}`);
}

beforeEach(() => {
  vi.restoreAllMocks();
  setQuery("");
});

describe("連携のボタン", () => {
  it("設定が入っている先だけ出る", async () => {
    stubProviders(["google"]);

    render(<SocialButtons />);

    expect(await screen.findByTestId("social-google")).toBeInTheDocument();
    // 押すと落ちるボタンは、無いより悪い
    expect(screen.queryByTestId("social-line")).not.toBeInTheDocument();
  });

  it("どちらも無ければ、区切り線ごと出ない", async () => {
    stubProviders([]);

    render(<SocialButtons />);

    await waitFor(() => {
      expect(screen.queryByTestId("social-buttons")).not.toBeInTheDocument();
    });
  });

  it("押す前に、同意になることが見えている", async () => {
    stubProviders(["google", "line"]);

    render(<SocialButtons />);

    expect(await screen.findByText(SOCIAL_COPY.consentNote)).toBeInTheDocument();
  });

  it("一覧が取れなくても、画面は壊れない", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("届かない"));

    render(<SocialButtons />);

    // メールでの登録は使えるので、行き止まりにはならない
    await waitFor(() => {
      expect(screen.queryByTestId("social-buttons")).not.toBeInTheDocument();
    });
  });
});

describe("戻ってきたときの知らせ", () => {
  function Probe() {
    const { result } = useSocialResult();
    return <p data-testid="notice">{result?.message ?? "（なし）"}</p>;
  }

  it("ログインできたと出る", async () => {
    setQuery("?social=google&social_result=signin");

    render(<Probe />);

    await waitFor(() =>
      expect(screen.getByTestId("notice")).toHaveTextContent("ログインしました"),
    );
  });

  it("断られた理由が、決まった文で出る", async () => {
    setQuery("?social_error=denied");

    render(<Probe />);

    await waitFor(() =>
      expect(screen.getByTestId("notice")).toHaveTextContent(SOCIAL_COPY.errors.denied),
    );
  });

  it("知らない理由でも、URL の中身を画面に出さない", async () => {
    /*
      ここが本題。サーバーが文を渡す形にすると、URL へ差し込んだ文字が
      そのまま画面に出る。名前を固定文へ引き当てるだけにしてある。
    */
    setQuery("?social_error=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E");

    render(<Probe />);

    await waitFor(() =>
      expect(screen.getByTestId("notice")).toHaveTextContent(SOCIAL_COPY.fallbackError),
    );
    expect(screen.getByTestId("notice").textContent).not.toContain("onerror");
  });

  it("読んだら URL から消える", async () => {
    setQuery("?social_error=denied");

    render(<Probe />);

    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("関係ない検索文字列は残す", async () => {
    setQuery("?social_error=denied&keep=1");

    render(<Probe />);

    await waitFor(() => expect(window.location.search).toBe("?keep=1"));
  });

  it("何も付いていなければ、何も出さない", async () => {
    setQuery("");

    render(<Probe />);

    expect(screen.getByTestId("notice")).toHaveTextContent("（なし）");
  });
});
