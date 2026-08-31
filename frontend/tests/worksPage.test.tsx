/**
 * マイ成果物。作ったものを取り出せること。
 *
 * このアプリの約束は「実際の仕事でAIを使えるようになる」こと。
 * 作ったものが取り出せなければ、その約束は果たせない。
 *
 * ここで守るのは4つ。
 *
 *   1. 作ったものが並び、**コピーして持っていける**こと
 *   2. 何を指定してその結果になったかが分かること
 *   3. まだ何も無い人にも、次にすることが分かること
 *   4. 読み込めなかったときに、その場でやり直せること
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorksPage } from "../src/pages/WorksPage";

const ARTIFACT = {
  id: "a1",
  lesson_id: "rewrite_text",
  session_id: "s1",
  action: "rewrite",
  step: "generate_first",
  output: "明日の打ち合わせ資料について、ご確認をお願いいたします。",
  truncated: false,
  conditions: { audience: "上司", tone: "ていねいに" },
  created_at: "2026-08-18T15:03:00+09:00",
};

const SESSION = {
  id: "s1",
  lesson_id: "rewrite_text",
  completed: true,
  current_step: "completion",
  attempt_count: 3,
  started_at: "2026-08-18T15:00:00+09:00",
  updated_at: "2026-08-18T15:03:00+09:00",
};

const FULL = {
  artifacts: [ARTIFACT],
  sessions: [SESSION],
  ai_quota: { limit: 10, used: 3, remaining: 7 },
};

/**
 * 取っておいた一覧と、作ったものの一覧を、別々に返す。
 *
 * 同じ画面で2本の問い合わせが走るので、片方の応答をもう片方に
 * 使い回すと、出ないはずのものが出て検査が通ってしまう。
 */
function serve(history: unknown, { ok = true, kept = [] as unknown[] } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/saved/")) {
      return { ok: true, status: 200, json: async () => ({ items: kept }) } as Response;
    }
    if (!ok) throw new Error("offline");
    return { ok: true, status: 200, json: async () => history } as Response;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("作ったもの", () => {
  it("並び、本文が読める", async () => {
    serve(FULL);
    render(<WorksPage onSelectLesson={() => {}} onOpenCourse={() => {}} />);

    expect(await screen.findByTestId("artifact-a1")).toHaveTextContent(
      "ご確認をお願いいたします。",
    );
  });

  it("何を指定したかが一緒に出る", async () => {
    // 条件が無いと、なぜその結果になったのかが分からず学びに繋がらない
    serve(FULL);
    render(<WorksPage onSelectLesson={() => {}} onOpenCourse={() => {}} />);

    const card = await screen.findByTestId("artifact-a1");

    expect(card).toHaveTextContent("上司");
    expect(card).toHaveTextContent("ていねいに");
  });

  it("コピーして持っていける", async () => {
    // 見えるだけでは仕事に持っていけない
    serve(FULL);
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: write },
    });

    render(<WorksPage onSelectLesson={() => {}} onOpenCourse={() => {}} />);
    await userEvent.click(await screen.findByTestId("artifact-copy-a1"));

    expect(write).toHaveBeenCalledWith(ARTIFACT.output);
    expect(await screen.findByText("コピーしました")).toBeInTheDocument();
  });

  it("コピーできない環境でも、画面が壊れない", async () => {
    // 古い端末や、許可されていない場合がある。本文は選んで手でコピーできる
    serve(FULL);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("not allowed")),
      },
    });

    render(<WorksPage onSelectLesson={() => {}} onOpenCourse={() => {}} />);
    await userEvent.click(await screen.findByTestId("artifact-copy-a1"));

    expect(screen.getByTestId("artifact-a1")).toBeInTheDocument();
  });

  it("押すと、その教材をもう一度開ける", async () => {
    // 見返して「もう一度」と思ったときに、探し直させない
    serve(FULL);
    const open = vi.fn();
    render(<WorksPage onSelectLesson={open} onOpenCourse={() => {}} />);

    await userEvent.click(
      (await screen.findByTestId("artifact-a1")).querySelector("button")!,
    );

    expect(open).toHaveBeenCalledWith("rewrite_text");
  });

  it("切られたものは、切られたと分かる", async () => {
    // 黙って切ると、続きがあるのに終わったと思われる
    serve({ ...FULL, artifacts: [{ ...ARTIFACT, truncated: true }] });
    render(<WorksPage onSelectLesson={() => {}} onOpenCourse={() => {}} />);

    expect(await screen.findByTestId("artifact-a1")).toHaveTextContent(
      "長いため、ここまでを保存しています",
    );
  });
});

describe("まだ何も無いとき", () => {
  const empty = { artifacts: [], sessions: [], ai_quota: { limit: 10, used: 0, remaining: 10 } };

  it("次に何をすればよいか伝える", async () => {
    serve(empty);
    render(<WorksPage onSelectLesson={() => {}} onOpenCourse={() => {}} />);

    expect(
      await screen.findByText(/レッスンでAIに何か作ってもらうと/),
    ).toBeInTheDocument();
  });

  it("行き止まりにしない。そこから行ける", async () => {
    /*
      前はここが文だけだった。「レッスンでAIに何か作ってもらうと、
      ここに残ります」と書いてあるのに、そのレッスンへ行く道が
      この画面に無かった。やり方を書いて道を置かないのは、
      書いていないのとあまり変わらない（憲章 原則 I）。

      この画面は初日にいちばん空になり、しかも1本目を終える**前**に
      開かれる。空のまま見る人のほうが多い。
    */
    const user = userEvent.setup();
    const openCourse = vi.fn();
    serve(empty);
    render(<WorksPage onSelectLesson={() => {}} onOpenCourse={openCourse} />);

    await user.click(await screen.findByTestId("record-empty-start"));

    expect(openCourse).toHaveBeenCalledTimes(1);
  });
});

describe("読み込めなかったとき", () => {
  it("黙って空にせず、そう伝える", async () => {
    // 空と区別が付かないと、「作ったものが消えた」と思われる
    serve(null, { ok: false });
    render(<WorksPage onSelectLesson={() => {}} onOpenCourse={() => {}} />);

    await waitFor(() =>
      expect(screen.getByTestId("record-error")).toBeInTheDocument(),
    );
  });

  it("「もう一度」を、その文の隣で押せる", async () => {
    /*
      「もう一度お試しください」と書くなら、もう一度を押せる場所を
      同じ場所に置く。下タブで往復させると、同じことを別の手順で
      覚えることになる。
    */
    const user = userEvent.setup();
    let online = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/saved/")) {
        return { ok: true, status: 200, json: async () => ({ items: [] }) } as Response;
      }
      if (!online) throw new Error("offline");
      return { ok: true, status: 200, json: async () => FULL } as Response;
    });

    render(<WorksPage onSelectLesson={() => {}} onOpenCourse={() => {}} />);
    await screen.findByTestId("record-error");

    online = true;
    await user.click(screen.getByTestId("record-retry"));

    expect(await screen.findByTestId("artifact-a1")).toBeInTheDocument();
    expect(screen.queryByTestId("record-error")).not.toBeInTheDocument();
  });
});

describe("形が違う応答が返ったとき", () => {
  /**
   * 前段のプロキシや設定違いのエンドポイントが、200 のまま
   * 別の形を返すことがある。そのまま `artifacts.length` を読むと
   * **画面ごと真っ白**になり、押せる場所が1つも無くなる。
   *
   * 200 が返っている以上「読み込めませんでした」でもない。
   * 足りない配列は空として扱い、画面は出す。
   */
  it("画面が真っ白にならない", async () => {
    serve({ session: null });

    render(<WorksPage onSelectLesson={() => {}} onOpenCourse={() => {}} />);

    // 「作ったものはまだありません」まで出る（落ちない）
    expect(await screen.findByTestId("record-empty")).toBeInTheDocument();
  });
});
