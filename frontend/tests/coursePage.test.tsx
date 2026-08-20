/**
 * 教材一覧の「探す」と「あとで見る」。
 *
 * 一覧は縦一列の目次で、いまは9件しかない。それでも、
 * やりたいことの言葉（「メール」）で来る人は、題（「文章を書き直す」）と
 * 自分の言葉が一致せず、合う1本にたどり着けなかった。
 * 気になった教材を取っておく場所も無く、次に開いたときには忘れられていた。
 *
 * ここで守るのは5つ。
 *
 *   1. 探した結果が絞られること
 *   2. 見つからなかったときに、黙って空にしないこと
 *   3. 目印がサーバーへ伝わること（端末にだけ持たせない）
 *   4. 保存できなかったら、見た目を戻すこと
 *   5. 始められない教材は取っておけないこと
 */

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../src/auth/AuthContext";
import { CoursePage } from "../src/pages/CoursePage";
import { resetCatalog } from "../src/course/live";

/** サーバーから届く形。近日公開を1本混ぜる。 */
const CATALOG = {
  courses: [
    {
      id: "first_step_7days",
      title: "7日でAIの最初の一歩",
      description: "毎日10分。",
      lessons: [
        {
          id: "rewrite_text",
          number: 1,
          title: "文章を書き直す",
          goal: "そのまま送れる文にする",
          outcomes: [],
          tags: ["メール"],
          usesAi: true,
          availability: "available",
          steps: [{ id: "intro", type: "intro", title: "はじめに" }],
        },
        {
          id: "summarize_text",
          number: 2,
          title: "長い文をまとめる",
          goal: "要点だけ取り出す",
          outcomes: [],
          tags: ["議事録"],
          usesAi: true,
          availability: "available",
          steps: [{ id: "intro", type: "intro", title: "はじめに" }],
        },
        {
          id: "later_one",
          number: 3,
          title: "あとで出るもの",
          goal: "まだです",
          outcomes: [],
          tags: [],
          usesAi: true,
          availability: "coming_soon",
          steps: [],
        },
      ],
    },
  ],
};

function reply(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}

/** 通信を差し替える。ブックマークの送信内容を記録して返す。 */
function serve({ bookmarks = [] as string[], writeOk = true } = {}) {
  const sent: { method: string; lesson_id: string }[] = [];

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(typeof input === "string" ? input : (input as Request).url);
    const method = init?.method ?? "GET";

    if (url.includes("/bookmarks/")) {
      if (method === "GET") {
        return reply({
          items: bookmarks.map((id) => ({
            lesson_id: id,
            created_at: "2026-08-01T00:00:00+00:00",
            completed: false,
          })),
        });
      }
      sent.push({ method, ...JSON.parse(String(init?.body)) });
      if (!writeOk) return reply({ errors: { detail: ["だめでした"] } }, 500);
      return reply({ bookmarked: method === "POST" });
    }
    if (url.includes("/accounts/me")) {
      // 目印を付けられるのは登録した人だけ（src/course/keeping.ts）
      return reply({
        authenticated: true,
        user: {
          email: "learner@example.com",
          display_name: "",
          email_verified: true,
          terms_version: "1",
          joined_at: "2026-08-01T00:00:00Z",
          remind_study: false,
        },
      });
    }
    if (url.includes("/catalog/")) return reply(CATALOG);
    if (url.includes("/progress/")) {
      return reply({
        lessons: [],
        completed_count: 0,
        in_progress_count: 0,
        skills: [],
        signed_in: true,
      });
    }
    if (url.includes("/csrf/")) return reply({ ok: true });
    return reply({});
  });

  return sent;
}

/** 開いて、教材が届くまで待つ。 */
async function open() {
  render(
    <AuthProvider>
      <CoursePage onSelectLesson={() => {}} />
    </AuthProvider>,
  );
  await screen.findByTestId("lesson-summarize_text");
}

beforeEach(() => {
  resetCatalog();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  act(() => resetCatalog());
});

describe("探す", () => {
  it("やりたいことの言葉で絞れる", async () => {
    /*
      打つのは「メール」。題は「文章を書き直す」。
      タグを見ないと、この人はたどり着けない。
    */
    serve();
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByTestId("lesson-search"), "メール");

    expect(screen.getByTestId("lesson-rewrite_text")).toBeInTheDocument();
    expect(screen.queryByTestId("lesson-summarize_text")).not.toBeInTheDocument();
  });

  it("見つからなかったら、そう書く", async () => {
    // 黙って空にすると、打ち間違いなのか無いのかが分からない
    serve();
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByTestId("lesson-search"), "そんな教材はない");

    expect(screen.getByRole("status")).toHaveTextContent("当てはまる教材はありませんでした");
  });

  it("消したら全部に戻る", async () => {
    serve();
    const user = userEvent.setup();
    await open();

    const box = screen.getByTestId("lesson-search");
    await user.type(box, "メール");
    await user.clear(box);

    expect(screen.getByTestId("lesson-summarize_text")).toBeInTheDocument();
  });
});

describe("あとで見る", () => {
  it("押すと、サーバーへ伝わる", async () => {
    /*
      端末にだけ持たせると、別の端末で付けた目印が見えない。
    */
    const sent = serve();
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByTestId("bookmark-rewrite_text"));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ method: "POST", lesson_id: "rewrite_text" });
  });

  it("もう一度押すと、外れる", async () => {
    const sent = serve({ bookmarks: ["rewrite_text"] });
    const user = userEvent.setup();
    await open();

    // 下の一覧のほうの行を押す（「あとで見る」にも同じ教材が出ている）
    const toggle = await screen.findByTestId("bookmark-rewrite_text");
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "true"));

    await user.click(toggle);

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].method).toBe("DELETE");
  });

  it("保存できなかったら、見た目を戻す", async () => {
    /*
      付いたように見えたまま付いていないのが一番よくない。
      あとで一覧を開いたときに消えていて、何が起きたか分からなくなる。
    */
    serve({ writeOk: false });
    const user = userEvent.setup();
    await open();

    const toggle = screen.getByTestId("bookmark-rewrite_text");
    await user.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "false"));
  });

  it("まとめて見る場所がある", async () => {
    // 付けられるだけで見る場所が無いと、一覧を上から探し直すことになる
    serve({ bookmarks: ["summarize_text"] });
    await open();

    const saved = await screen.findByRole("region", { name: "あとで見る" });

    expect(within(saved).getByTestId("saved-lesson-summarize_text")).toBeInTheDocument();
    expect(within(saved).queryByTestId("saved-lesson-rewrite_text")).not.toBeInTheDocument();
  });

  it("1件も無いときは、空の枠を出さない", async () => {
    // 空の枠は、機能が壊れているように見える
    serve({ bookmarks: [] });
    await open();

    expect(screen.queryByRole("region", { name: "あとで見る" })).not.toBeInTheDocument();
  });

  it("色だけで「付いている」を表さない", async () => {
    // 印の色が見えない人にも分かるようにする
    serve({ bookmarks: ["rewrite_text"] });
    await open();

    const rows = await screen.findAllByTestId("lesson-rewrite_text");

    expect(rows.some((row) => row.textContent?.includes("あとで見る"))).toBe(true);
  });

  it("近日公開の教材は取っておけない", async () => {
    /*
      取っておけても、開ける日まで何も起きない。
    */
    serve();
    await open();

    expect(screen.queryByTestId("bookmark-later_one")).not.toBeInTheDocument();
    expect(screen.getByTestId("bookmark-rewrite_text")).toBeInTheDocument();
  });
});

describe("応答が壊れていても、画面は開く", () => {
  it("修了証の応答に鍵が無くても、教材一覧は出る", async () => {
    /*
      経路の設定違い、間に挟まる proxy のエラーページ、配置の途中——
      どれも 200 で別物を返す。`{}` をそのまま入れると undefined が
      読む側へ渡り、`.length` で教材一覧ごと真っ白になった。

      修了証はあれば嬉しいもので、これが無いと教材一覧が開けない、
      という作りにはしない。
    */
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(typeof input === "string" ? input : (input as Request).url);
      if (url.includes("/certificate/")) return reply({});
      if (url.includes("/accounts/me")) {
      // 目印を付けられるのは登録した人だけ（src/course/keeping.ts）
      return reply({
        authenticated: true,
        user: {
          email: "learner@example.com",
          display_name: "",
          email_verified: true,
          terms_version: "1",
          joined_at: "2026-08-01T00:00:00Z",
          remind_study: false,
        },
      });
    }
    if (url.includes("/catalog/")) return reply(CATALOG);
      if (url.includes("/bookmarks/")) return reply({ items: [] });
      if (url.includes("/progress/")) {
        return reply({
          lessons: [],
          completed_count: 0,
          in_progress_count: 0,
          skills: [],
          signed_in: true,
        });
      }
      return reply({});
    });

    render(
    <AuthProvider>
      <CoursePage onSelectLesson={() => {}} />
    </AuthProvider>,
  );

    expect(await screen.findByTestId("lesson-rewrite_text")).toBeInTheDocument();
  });
});

describe("見つからなかったとき", () => {
  it("できないことを指示しない", async () => {
    /*
      0件のときは絞り込みで一覧が消えている。以前ここに
      「下の一覧から選んでください」と書いていたが、下には何も無い。
      行き止まりで指示だけ残るのが、いちばんよくない。
    */
    serve();
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByTestId("lesson-search"), "そんな教材はない");

    expect(screen.getByRole("status")).not.toHaveTextContent("下の一覧");
  });

  it("その場で全部に戻せる", async () => {
    serve();
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByTestId("lesson-search"), "そんな教材はない");
    await user.click(screen.getByTestId("lesson-search-clear"));

    expect(screen.getByTestId("lesson-rewrite_text")).toBeInTheDocument();
    expect(screen.getByTestId("lesson-summarize_text")).toBeInTheDocument();
  });
});
