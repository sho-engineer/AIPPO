/**
 * 完了時のアンケート。
 *
 * 見張るのは4つ。
 *
 * - 「有料テストの申込率」を測る質問が消えていないこと
 *   （フェーズ2→3 の判定に要る唯一の数字。ここが落ちると判定できない）
 * - 質問文をそのまま鍵にして送ること（集計画面が見出しに使う）
 * - 二度聞かないこと
 * - 送れなかったときに、答えを捨てないこと
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SurveyCard } from "../src/components/course/SurveyCard";
import { SURVEY_COPY } from "../src/content/ui";
import { alreadyAsked } from "../src/course/survey";

const LESSON = "rewrite_text";

function ok(): Response {
  return { ok: true, status: 204, json: async () => ({}) } as Response;
}

/** 3問すべてに答える。選ぶのは各問の先頭。 */
async function answerAll(user: ReturnType<typeof userEvent.setup>) {
  for (const question of SURVEY_COPY.questions) {
    await user.click(screen.getByRole("radio", { name: question.options[0] }));
  }
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("聞く内容", () => {
  it("有料の意向をたずねる質問がある", () => {
    /*
      これが無いと「有料テストの申込率」が測れず、
      フェーズ2→3 の判定が片方しかできない（docs/roadmap.md）。
      質問を減らすときに、ここが落ちることに気づけるようにしておく。
    */
    const keys = SURVEY_COPY.questions.map((q) => q.key);
    expect(keys).toContain("paidInterest");
  });

  it("自由に書ける欄は無い", () => {
    render(<SurveyCard lessonId={LESSON} />);

    // 集計できないうえ、個人情報の入り込む口になる
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("どれか1つを選ぶことが、読み上げに伝わる", () => {
    render(<SurveyCard lessonId={LESSON} />);

    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(
      SURVEY_COPY.questions.reduce((n, q) => n + q.options.length, 0),
    );
  });
});

describe("送る", () => {
  it("全部答えるまで送れない", async () => {
    const user = userEvent.setup();
    render(<SurveyCard lessonId={LESSON} />);

    expect(screen.getByTestId("survey-submit")).toBeDisabled();

    await answerAll(user);

    expect(screen.getByTestId("survey-submit")).toBeEnabled();
  });

  it("質問文をそのまま鍵にして送る", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => ok());

    render(<SurveyCard lessonId={LESSON} />);
    await answerAll(user);
    await user.click(screen.getByTestId("survey-submit"));

    await waitFor(() => expect(screen.getByTestId("survey-done")).toBeInTheDocument());

    // 送り先とお願いの中身を確かめる
    const call = fetchSpy.mock.calls.find(([url]) =>
      String(url).includes(`/api/lessons/${LESSON}/survey/`),
    );
    expect(call, "アンケートの送信が行われていない").toBeTruthy();

    const body = JSON.parse(String((call![1] as RequestInit).body));
    /*
      集計画面は答えの鍵をそのまま見出しにする
      （admin.py の survey_tally）。短い符丁にすると、
      読む人に意味が伝わらない。
    */
    for (const question of SURVEY_COPY.questions) {
      expect(body.answers[question.question]).toBe(question.options[0]);
    }
  });

  it("送れたら、もう聞かない", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => ok());

    render(<SurveyCard lessonId={LESSON} />);
    await answerAll(user);
    await user.click(screen.getByTestId("survey-submit"));

    await waitFor(() => expect(alreadyAsked(LESSON)).toBe(true));
  });

  it("送れなかったら、答えを捨てない", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("届かない"));

    render(<SurveyCard lessonId={LESSON} />);
    await answerAll(user);
    await user.click(screen.getByTestId("survey-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("survey-failed")).toHaveTextContent(SURVEY_COPY.failed),
    );

    /*
      覚えてしまうと、答えはどこにも残らないまま二度と聞けなくなる。
      同じレッスンをやり直したときに、もう一度たずねられる。
    */
    expect(alreadyAsked(LESSON)).toBe(false);
  });
});

describe("引き止めない", () => {
  it("答えないを選べる", async () => {
    const user = userEvent.setup();
    render(<SurveyCard lessonId={LESSON} />);

    await user.click(screen.getByTestId("survey-skip"));

    expect(screen.queryByTestId("survey")).not.toBeInTheDocument();
    expect(alreadyAsked(LESSON)).toBe(true);
  });

  it("一度断ったレッスンでは、開き直しても出さない", async () => {
    const user = userEvent.setup();
    const first = render(<SurveyCard lessonId={LESSON} />);

    await user.click(screen.getByTestId("survey-skip"));
    // 画面を離れて、同じレッスンをもう一度終えたところ
    first.unmount();

    render(<SurveyCard lessonId={LESSON} />);

    expect(screen.queryByTestId("survey")).not.toBeInTheDocument();
  });

  it("別のレッスンでは、あらためて聞く", () => {
    window.localStorage.setItem("aippo:survey", JSON.stringify({ [LESSON]: true }));

    render(<SurveyCard lessonId="summarize_text" />);

    expect(screen.getByTestId("survey")).toBeInTheDocument();
  });

  it("端末に何も置けなくても、画面は壊れない", () => {
    // 保存できない設定の端末でも、終わった直後の画面を白くしない
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("使えません");
    });

    expect(() => render(<SurveyCard lessonId={LESSON} />)).not.toThrow();
  });
});
