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
import { resetCatalog } from "../src/course/live";

const READY = COURSE.lessons[1].id;

/*
  準備中の1本は、**こちらで用意する。**

  長く `COURSE.lessons[2]` と書いて、そこが準備中であることに
  もたれていた。Day2・Day3・Day4 を開いた日、同梱データから
  準備中が1本も無くなって、この検査は**試す相手を失った**
  （開いている教材を「出ないはず」として試していた）。

  公開範囲は動く。動くものを土台にすると、止める仕組みが
  壊れたときではなく、**公開したときに**落ちる。
*/
const WAITING = "waiting_lesson";

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

  it("準備中の教材は、見返しどきでも出さない", async () => {
    /*
      サーバーは「間があいた教材」をそのまま返す。準備中の1本が
      混ざったまま並べると、**押せない行が出る**。見返すには開く
      必要があるので、ここは開けるものだけに絞る
      （`course/availability.ts`）。

      終えたことを無かったことにするのとは違う——記録は残っていて、
      もう一度やる道が、公開まで開かないだけ。
    */
    resetCatalog();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(typeof input === "string" ? input : (input as Request).url);
      if (url.includes("/catalog/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            courses: [
              {
                ...COURSE,
                lessons: [
                  ...COURSE.lessons,
                  {
                    ...COURSE.lessons[1],
                    id: WAITING,
                    number: 99,
                    availability: "coming_soon",
                  },
                ],
              },
            ],
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [item(READY), item(WAITING)],
          due_count: 2,
        }),
      } as Response;
    });

    render(<ReviewPrompt onSelectLesson={() => {}} />);

    await screen.findByTestId(`review-${READY}`);
    expect(screen.queryByTestId(`review-${WAITING}`)).not.toBeInTheDocument();
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
