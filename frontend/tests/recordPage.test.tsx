/**
 * 学習履歴。作ったものを見返せること。
 *
 * このアプリの約束は「実際の仕事でAIを使えるようになる」こと。
 * 作ったものが取り出せなければ、その約束は果たせない。
 *
 * ここで守るのは4つ。
 *
 *   1. 作ったものが並び、**コピーして持っていける**こと
 *   2. 何を指定してその結果になったかが分かること
 *   3. 今日あと何回使えるかが、上限に当たる前に見えること
 *   4. まだ何も無い人にも、次にすることが分かること
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecordPage } from "../src/pages/RecordPage";

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

function serve(body: unknown, ok = true) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if (!ok) throw new Error("offline");
    return { ok: true, status: 200, json: async () => body } as Response;
  });
}

const FULL = {
  artifacts: [ARTIFACT],
  sessions: [SESSION],
  ai_quota: { limit: 10, used: 3, remaining: 7 },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("作ったもの", () => {
  it("並び、本文が読める", async () => {
    serve(FULL);
    render(<RecordPage onSelectLesson={() => {}} />);

    expect(await screen.findByTestId("artifact-a1")).toHaveTextContent(
      "ご確認をお願いいたします。",
    );
  });

  it("何を指定したかが一緒に出る", async () => {
    // 条件が無いと、なぜその結果になったのかが分からず学びに繋がらない
    serve(FULL);
    render(<RecordPage onSelectLesson={() => {}} />);

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

    render(<RecordPage onSelectLesson={() => {}} />);
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

    render(<RecordPage onSelectLesson={() => {}} />);
    await userEvent.click(await screen.findByTestId("artifact-copy-a1"));

    expect(screen.getByTestId("artifact-a1")).toBeInTheDocument();
  });

  it("押すと、その教材をもう一度開ける", async () => {
    // 見返して「もう一度」と思ったときに、探し直させない
    serve(FULL);
    const open = vi.fn();
    render(<RecordPage onSelectLesson={open} />);

    await userEvent.click(await screen.findByTestId("record-session-rewrite_text"));

    expect(open).toHaveBeenCalledWith("rewrite_text");
  });

  it("切られたものは、切られたと分かる", async () => {
    // 黙って切ると、続きがあるのに終わったと思われる
    serve({ ...FULL, artifacts: [{ ...ARTIFACT, truncated: true }] });
    render(<RecordPage onSelectLesson={() => {}} />);

    expect(await screen.findByTestId("artifact-a1")).toHaveTextContent(
      "長いため、ここまでを保存しています",
    );
  });
});

describe("今日つかえる回数", () => {
  it("上限に当たる前に、残りが見える", async () => {
    serve(FULL);
    render(<RecordPage onSelectLesson={() => {}} />);

    const quota = await screen.findByTestId("ai-quota");

    expect(quota).toHaveTextContent("あと7回");
    expect(quota).toHaveTextContent("10回のうち3回");
  });

  it("上限を外しているときは、数を出さない", async () => {
    // 0 を出すと「残り0回」と読めてしまい、逆の意味になる
    serve({ ...FULL, ai_quota: { limit: null, used: 0, remaining: null } });
    render(<RecordPage onSelectLesson={() => {}} />);

    await screen.findByTestId("artifact-a1");

    expect(screen.queryByTestId("ai-quota")).not.toBeInTheDocument();
  });
});

describe("まだ何も無いとき", () => {
  it("次に何をすればよいか伝える", async () => {
    serve({ artifacts: [], sessions: [], ai_quota: { limit: 10, used: 0, remaining: 10 } });
    render(<RecordPage onSelectLesson={() => {}} />);

    expect(
      await screen.findByText(/レッスンでAIに何か作ってもらうと/),
    ).toBeInTheDocument();
  });
});

describe("読み込めなかったとき", () => {
  it("黙って空にせず、そう伝える", async () => {
    // 空と区別が付かないと、「作ったものが消えた」と思われる
    serve(null, false);
    render(<RecordPage onSelectLesson={() => {}} />);

    await waitFor(() =>
      expect(screen.getByTestId("record-error")).toBeInTheDocument(),
    );
  });
});
