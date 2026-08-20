/**
 * 見返しどきの教材を出すところ。
 *
 * 学習サービスとして、ここが無いと「一度やって終わり」になる。
 * ただし出しすぎると、できていない感じだけが増える。
 *
 * ここで守るのは4つ。
 *
 *   1. 見返しどきのものが出ること
 *   2. **まだ時期でないものは出さないこと**
 *   3. 出すものが無ければ、何も描かないこと（余白も残さない）
 *   4. 取れなくても画面を壊さないこと
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewPrompt } from "../src/components/ReviewPrompt";
import { COURSE } from "../src/course/catalog";

const READY = COURSE.lessons[1].id;
const ALSO_READY = COURSE.lessons[2].id;

function item(lessonId: string, over: Record<string, unknown> = {}) {
  return {
    lesson_id: lessonId,
    times_done: 1,
    last_done_at: "2026-08-10T10:00:00+09:00",
    due_at: "2026-08-11T10:00:00+09:00",
    due: true,
    days_until_due: 0,
    ...over,
  };
}

function serve(body: unknown, ok = true) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if (!ok) throw new Error("offline");
    return { ok: true, status: 200, json: async () => body } as Response;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("見返しどき", () => {
  it("時期が来たものが並ぶ", async () => {
    serve({ items: [item(READY)], due_count: 1 });

    render(<ReviewPrompt onSelectLesson={() => {}} />);

    expect(await screen.findByTestId(`review-${READY}`)).toBeInTheDocument();
  });

  it("押すと、その教材をもう一度開ける", async () => {
    serve({ items: [item(READY)], due_count: 1 });
    const open = vi.fn();

    render(<ReviewPrompt onSelectLesson={open} />);
    await userEvent.click(await screen.findByTestId(`review-${READY}`));

    expect(open).toHaveBeenCalledWith(READY);
  });

  it("何回やったかを添える", async () => {
    serve({ items: [item(READY, { times_done: 3 })], due_count: 1 });

    render(<ReviewPrompt onSelectLesson={() => {}} />);

    expect(await screen.findByTestId(`review-${READY}`)).toHaveTextContent(
      "3回やりました",
    );
  });

  it("複数あれば件数を出す", async () => {
    serve({ items: [item(READY), item(ALSO_READY)], due_count: 2 });

    render(<ReviewPrompt onSelectLesson={() => {}} />);

    expect(await screen.findByTestId("review-prompt")).toHaveTextContent("2本");
  });
});

describe("出さないとき", () => {
  it("まだ時期でないものは出さない", async () => {
    /*
      「まだやらなくていいもの」を毎日見せても、
      できていない感じが増えるだけになる。
    */
    serve({ items: [item(READY, { due: false, days_until_due: 3 })], due_count: 0 });

    render(<ReviewPrompt onSelectLesson={() => {}} />);

    await waitFor(() =>
      expect(screen.queryByTestId("review-prompt")).not.toBeInTheDocument(),
    );
  });

  it("見返しどきが無ければ、何も描かない", async () => {
    // 常に置いておくと、見返す必要が無い日にも「やり残しがある」ように見える
    serve({ items: [], due_count: 0 });

    const { container } = render(<ReviewPrompt onSelectLesson={() => {}} />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("始められない教材は勧めない", async () => {
    // 近日公開へ戻された教材など。押しても開けないものを出さない
    serve({ items: [item("no_such_lesson")], due_count: 1 });

    render(<ReviewPrompt onSelectLesson={() => {}} />);

    await waitFor(() =>
      expect(screen.queryByTestId("review-prompt")).not.toBeInTheDocument(),
    );
  });

  it("取れなくても画面を壊さない", async () => {
    // 復習は「あると良いもの」。落ちてホーム全体を巻き添えにしない
    serve(null, false);

    const { container } = render(<ReviewPrompt onSelectLesson={() => {}} />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe("測らないこと", () => {
  it("点数や正答率を出さない", async () => {
    /*
      相手はAIに不安がある初心者。点数を出すと、
      低い点を取った人からいなくなる。
    */
    serve({ items: [item(READY)], due_count: 1 });

    render(<ReviewPrompt onSelectLesson={() => {}} />);
    const panel = await screen.findByTestId("review-prompt");

    for (const banned of ["点", "％", "%", "正答", "スコア"]) {
      expect(panel.textContent).not.toContain(banned);
    }
  });
});
