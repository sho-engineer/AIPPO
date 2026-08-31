/**
 * 取っておいた成果物。
 *
 * 「作ったもの」（自動でたまる）との違いを、画面の上でも保つ。
 *
 * 見張るのは4つ。
 *
 * - 二度押しても失敗にしない（同じものは増えない）
 * - 取っておけない人（ゲスト）に、理由をその場で返す
 * - 名前を変えられる
 * - ゲストの画面に、消し方の分からない行を残さない
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KeepArtifactButton } from "../src/components/course/KeepArtifactButton";
import { KeptArtifacts } from "../src/components/records/KeptArtifacts";

const ARTIFACT = {
  id: "a1",
  lesson_id: "rewrite_text",
  title: "文章を分かりやすくするで作ったもの",
  output: "書き直した文章です。",
  conditions: { tone: "ていねいに" },
  skills: ["tone"],
  created_at: "2026-08-20T10:00:00+09:00",
};

function reply(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  } as unknown as Response;
}

/** URL と動詞で応答を選ぶ差し替え。 */
function stub(routes: { match: RegExp; method?: string; make: () => Response }[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    for (const route of routes) {
      if (route.match.test(url) && (!route.method || route.method === method)) {
        return route.make();
      }
    }
    return reply(200, {});
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("取っておくボタン", () => {
  it("押すと取っておける", async () => {
    const user = userEvent.setup();
    const kept = vi.fn();
    stub([
      {
        match: /\/saved\/$/,
        method: "POST",
        make: () => reply(201, { artifact: ARTIFACT, already_saved: false }),
      },
    ]);

    render(
      <KeepArtifactButton lessonId="rewrite_text" output="書き直した文章です。" onKept={kept} />,
    );
    await user.click(screen.getByTestId("keep-artifact"));

    await waitFor(() =>
      expect(screen.getByTestId("keep-artifact")).toHaveTextContent("取っておきました"),
    );
    expect(kept).toHaveBeenCalled();
  });

  it("二度目は失敗にせず、取ってあると伝える", async () => {
    /*
      押し直しただけの人に赤い字を出さない。押した結果は同じ
      （取ってある）ので、赤くする理由が無い。
    */
    const user = userEvent.setup();
    stub([
      {
        match: /\/saved\/$/,
        method: "POST",
        make: () => reply(200, { artifact: ARTIFACT, already_saved: true }),
      },
    ]);

    render(<KeepArtifactButton lessonId="rewrite_text" output="書き直した文章です。" />);
    await user.click(screen.getByTestId("keep-artifact"));

    await waitFor(() =>
      expect(screen.getByTestId("keep-artifact")).toHaveTextContent("取ってあります"),
    );
    expect(screen.queryByTestId("keep-artifact-note")).not.toBeInTheDocument();
  });

  it("ゲストには、押したその場で理由を返す", async () => {
    /*
      ボタン自体は出しておく。先に消すと、そういう場所があること
      自体が伝わらない。
    */
    const user = userEvent.setup();
    stub([
      {
        match: /\/saved\/$/,
        method: "POST",
        make: () =>
          reply(403, {
            code: "REQUEST_FAILED",
            errors: { requires_account: ["取っておくには、登録が必要です"] },
          }),
      },
    ]);

    render(<KeepArtifactButton lessonId="rewrite_text" output="書き直した文章です。" />);
    await user.click(screen.getByTestId("keep-artifact"));

    const note = await screen.findByTestId("keep-artifact-note");
    expect(note).toHaveTextContent("登録すると、ここに取っておけます");
    // 断りではあるが、間違いではない。赤くしない
    expect(note.className).not.toContain("text-caution");
  });

  it("それ以外の失敗は、もう一度押せる形で伝える", async () => {
    const user = userEvent.setup();
    stub([
      {
        match: /\/saved\/$/,
        method: "POST",
        make: () =>
          reply(409, {
            code: "REQUEST_FAILED",
            errors: { detail: ["取っておけるのは100件までです"] },
          }),
      },
    ]);

    render(<KeepArtifactButton lessonId="rewrite_text" output="書き直した文章です。" />);
    await user.click(screen.getByTestId("keep-artifact"));

    expect(await screen.findByTestId("keep-artifact-note")).toHaveTextContent("100件");
    expect(screen.getByTestId("keep-artifact")).toBeEnabled();
  });
});

describe("取っておいたものの一覧", () => {
  const title = (id: string) => (id === "rewrite_text" ? "文章を分かりやすくする" : id);

  it("取っておいたものを並べる", async () => {
    stub([{ match: /\/saved\/$/, make: () => reply(200, { items: [ARTIFACT] }) }]);

    render(<KeptArtifacts onSelectLesson={() => {}} lessonTitle={title} />);

    expect(await screen.findByTestId("kept-list")).toHaveTextContent(
      "文章を分かりやすくするで作ったもの",
    );
    // なぜその結果になったかも一緒に出す
    expect(screen.getByTestId("kept-a1")).toHaveTextContent("ていねいに");
  });

  it("名前を変えられる", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "PATCH") {
        sent.push(JSON.parse(String(init?.body)));
        return reply(200, { artifact: { ...ARTIFACT, title: "部長あての依頼メール" } });
      }
      return reply(200, { items: [ARTIFACT] });
    });

    render(<KeptArtifacts onSelectLesson={() => {}} lessonTitle={title} />);
    await user.click(await screen.findByTestId("kept-rename-a1"));
    await user.clear(screen.getByTestId("kept-title-input-a1"));
    await user.type(screen.getByTestId("kept-title-input-a1"), "部長あての依頼メール");
    await user.click(screen.getByTestId("kept-title-save-a1"));

    await waitFor(() => expect(sent).toEqual([{ title: "部長あての依頼メール" }]));
  });

  it("空の名前では変えない", async () => {
    // 名前が空になると、一覧で見分けが付かなくなる
    const user = userEvent.setup();
    const send = stub([{ match: /\/saved\/$/, make: () => reply(200, { items: [ARTIFACT] }) }]);

    render(<KeptArtifacts onSelectLesson={() => {}} lessonTitle={title} />);
    await user.click(await screen.findByTestId("kept-rename-a1"));
    await user.clear(screen.getByTestId("kept-title-input-a1"));
    await user.click(screen.getByTestId("kept-title-save-a1"));

    const patched = send.mock.calls.filter(
      (call) => (call[1] as RequestInit | undefined)?.method === "PATCH",
    );
    expect(patched).toHaveLength(0);
  });

  it("捨てられる", async () => {
    const user = userEvent.setup();
    let items = [ARTIFACT];
    const send = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "DELETE") {
        items = [];
        return { ok: true, status: 204, json: async () => null } as Response;
      }
      return reply(200, { items });
    });

    render(<KeptArtifacts onSelectLesson={() => {}} lessonTitle={title} />);
    await user.click(await screen.findByTestId("kept-discard-a1"));

    await waitFor(() => expect(screen.queryByTestId("kept-list")).not.toBeInTheDocument());
    expect(
      send.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === "DELETE"),
    ).toBe(true);
  });

  it("ゲストには、消し方の分からない行を残さない", async () => {
    /*
      取っておけないのに前の分だけ並ぶと、消し方の分からない行が残る。
      節ごと出さない（登録のお誘いは、同じ画面の下で1回だけ出す）。
    */
    stub([
      {
        match: /\/saved\/$/,
        make: () => reply(200, { items: [], requires_account: true }),
      },
    ]);

    render(<KeptArtifacts onSelectLesson={() => {}} lessonTitle={title} />);

    await waitFor(() =>
      expect(screen.queryByTestId("kept-list")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("取っておいたもの")).not.toBeInTheDocument();
  });

  it("読めなくても、画面ごと落とさない", async () => {
    stub([{ match: /\/saved\/$/, make: () => reply(500, {}) }]);

    render(<KeptArtifacts onSelectLesson={() => {}} lessonTitle={title} />);

    await waitFor(() =>
      expect(screen.queryByTestId("kept-list")).not.toBeInTheDocument(),
    );
  });
});
