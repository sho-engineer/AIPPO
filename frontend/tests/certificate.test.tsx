/**
 * 修了証。
 *
 * 見張るのは2つ。
 *
 * - 1枚も無い人の画面に、空の枠を出さないこと
 * - 受け取ったものを、そのまま読める形で出すこと
 *
 * 終えたかどうかの判定はサーバーにしか無い（views_certificate.py）。
 * ここで「終えた本数を数えて出す」ような作りを足すと、端末の記録を
 * 書き換えるだけで修了証が作れてしまう。だからこのテストも、
 * 画面が判定していないことを前提に、渡されたものの扱いだけを見る。
 */

import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CoursePage } from "../src/pages/CoursePage";
import { formatCompletedOn } from "../src/course/certificate";
import { resetCatalog } from "../src/course/live";

const CERTIFICATE = {
  course_slug: "first_step_7days",
  course_title: "7日でわかるAI活用入門",
  completed_on: "2026-08-19",
  lesson_count: 9,
  skills: ["相手を決めて頼める", "長い文をまとめられる"],
  serial: "AIPPO-3F2A-91C4-0D7E",
};

/**
 * 修了証だけを返す。
 *
 * ほかの問い合わせは失敗させる。教材は同梱の分で描かれ、
 * 進み具合は端末の分だけになる——どちらも「繋がらない場所」と同じで、
 * 画面はもともとそれで動くように作ってある。
 */
function serve(certificates: unknown[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(typeof input === "string" ? input : (input as Request).url);
    if (!url.includes("/certificate/")) throw new Error("offline");
    return {
      ok: true,
      status: 200,
      json: async () => ({ certificates }),
    } as Response;
  });
}

beforeEach(() => {
  window.localStorage.clear();
  resetCatalog();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  act(() => resetCatalog());
});

describe("修了証の入り口", () => {
  it("1枚も無ければ、空の枠を出さない", async () => {
    serve([]);
    render(<CoursePage onSelectLesson={() => {}} />);

    // 教材一覧そのものは出ていること（何も描かれないのとは違う）
    expect(await screen.findByTestId("lesson-rewrite_text")).toBeInTheDocument();
    expect(screen.queryByTestId("open-certificate")).not.toBeInTheDocument();
    expect(screen.queryByText("修了証を見る")).not.toBeInTheDocument();
  });

  it("サーバーに届かなくても、教材一覧は開く", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("届かない"));
    render(<CoursePage onSelectLesson={() => {}} />);

    expect(await screen.findByTestId("lesson-rewrite_text")).toBeInTheDocument();
    expect(screen.queryByTestId("open-certificate")).not.toBeInTheDocument();
  });

  it("受け取ったら、件数を添えた行が出る", async () => {
    serve([CERTIFICATE]);
    render(<CoursePage onSelectLesson={() => {}} />);

    const entry = await screen.findByTestId("open-certificate");
    expect(entry).toHaveTextContent("修了証を見る");
    expect(entry).toHaveTextContent("1件");
  });
});

describe("修了証の中身", () => {
  const open = async () => {
    serve([CERTIFICATE]);
    const user = userEvent.setup();
    render(<CoursePage onSelectLesson={() => {}} />);
    await user.click(await screen.findByTestId("open-certificate"));
    return user;
  };

  it("コース名・修了日・本数・番号が読める", async () => {
    await open();

    const sheet = await screen.findByTestId("certificate-first_step_7days");
    expect(sheet).toHaveTextContent("7日でわかるAI活用入門");
    expect(sheet).toHaveTextContent("2026年8月19日");
    expect(sheet).toHaveTextContent("全9回");
    expect(sheet).toHaveTextContent("AIPPO-3F2A-91C4-0D7E");
  });

  it("身についたことを、受けた順のまま並べる", async () => {
    await open();

    const sheet = await screen.findByTestId("certificate-first_step_7days");
    const items = within(sheet)
      .getAllByRole("listitem")
      .map((item) => item.textContent);

    // 並べ直さない。積み上がった順であることに意味がある
    expect(items).toEqual(["・相手を決めて頼める", "・長い文をまとめられる"]);
  });

  it("身についたことが空なら、見出しごと出さない", async () => {
    serve([{ ...CERTIFICATE, skills: [] }]);
    const user = userEvent.setup();
    render(<CoursePage onSelectLesson={() => {}} />);
    await user.click(await screen.findByTestId("open-certificate"));

    expect(await screen.findByTestId("certificate-page")).toBeInTheDocument();
    expect(screen.queryByText("身についたこと")).not.toBeInTheDocument();
  });

  it("資格ではないことを、こちらから先に書く", async () => {
    await open();

    expect(await screen.findByTestId("certificate-page")).toHaveTextContent(
      "公的な資格ではありません",
    );
  });

  it("教材一覧へ戻れる（行き止まりにしない）", async () => {
    const user = await open();

    await user.click(screen.getByRole("button", { name: "前の画面へ戻る" }));

    expect(await screen.findByTestId("lesson-rewrite_text")).toBeInTheDocument();
    expect(screen.queryByTestId("certificate-page")).not.toBeInTheDocument();
  });
});

describe("修了日の書き方", () => {
  it("端末の時間帯によらず、サーバーの日付をそのまま出す", () => {
    // new Date("2026-08-19") は UTC の0時として読まれる。
    // 日本時間へ直すと前日になる端末があるので、文字列のまま切り出す
    expect(formatCompletedOn("2026-08-19")).toBe("2026年8月19日");
    expect(formatCompletedOn("2026-01-01")).toBe("2026年1月1日");
  });

  it("形が違うときは、そのまま出す（画面を落とさない）", () => {
    expect(formatCompletedOn("")).toBe("");
  });
});
