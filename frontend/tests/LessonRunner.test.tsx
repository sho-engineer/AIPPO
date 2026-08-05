import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LessonRunner } from "../src/pages/LessonRunner";
import { getLesson } from "../src/course/catalog";
import type { Lesson } from "../src/course/types";

/**
 * 自分の課題のステップで、押しても何も起きなかった不具合の番人。
 *
 * `real_task` には aiAction が無い。にもかかわらず主ボタンで AI を
 * 送ろうとしていたため、run() が即座に "busy" を返し、画面が動かず、
 * レッスンを最後まで進められなかった。**押した結果が無いのが最悪**で、
 * 失敗の表示すら出ないので、利用者には壊れているのか自分が
 * 間違えているのかも分からない。
 */
describe("自分の課題のステップ", () => {
  const lesson = getLesson("rewrite_text") as Lesson;
  const realTaskIndex = lesson.steps.findIndex((step) => step.id === "real_task");

  /** real_task の画面までは、教材データを削って一足飛びに開く。 */
  const lessonFromRealTask: Lesson = {
    ...lesson,
    steps: lesson.steps.slice(realTaskIndex),
  };

  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("文章を入れて押すと、次のステップへ進む", async () => {
    const user = userEvent.setup();
    // 通信は起こらないはず。起きたら気づけるように見張る
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(
      <LessonRunner lesson={lessonFromRealTask} onFinish={() => {}} onExit={() => {}} />,
    );

    await user.type(
      await screen.findByRole("textbox"),
      "来週の打ち合わせの件、資料の確認をお願いします。お手すきのときで結構です。",
    );
    await user.click(screen.getByTestId("primary-action"));

    // 次のステップ（誰が読むか）へ移っていること
    expect(
      await screen.findByRole("heading", { name: "誰が読みますか" }),
    ).toBeInTheDocument();

    // ここでは AI を呼ばない。送るのは prompt_preview のあと
    const aiCalls = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).includes("/api/v1/ai/generate/"),
    );
    expect(aiCalls).toHaveLength(0);
  });

  it("空のままでは進めない（理由も出す）", async () => {
    render(
      <LessonRunner lesson={lessonFromRealTask} onFinish={() => {}} onExit={() => {}} />,
    );

    expect(await screen.findByTestId("primary-action")).toBeDisabled();
    // 押せない理由を黙って隠さない
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/自分の文章/),
    );
  });

  it("書きたくない人は飛ばせる", async () => {
    const user = userEvent.setup();
    render(
      <LessonRunner lesson={lessonFromRealTask} onFinish={() => {}} onExit={() => {}} />,
    );

    await user.click(await screen.findByRole("button", { name: "今回はスキップする" }));

    expect(screen.queryByRole("heading", { name: "自分の文章" })).not.toBeInTheDocument();
  });
});

/**
 * 自分の文章を書くステップで、秘密が混ざっていたら**その場で**知らせる。
 *
 * 送るのはこの先の generate_real で、そこでも必ず見ている。
 * ここで見るのは「言うのが遅すぎるのを防ぐ」ため。ここが無いと、
 * パスワードを書いた人は「誰が読むか」「どう変えたいか」と
 * 3つ4つ答えたあとで初めて「消してください」と言われる。
 * そこまでの操作が丸ごと無駄になる。
 */
describe("自分の文章に秘密が混ざったとき", () => {
  const lesson = getLesson("rewrite_text") as Lesson;
  const realTaskIndex = lesson.steps.findIndex((step) => step.id === "real_task");
  const fromRealTask: Lesson = { ...lesson, steps: lesson.steps.slice(realTaskIndex) };

  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("パスワードを書いたら、そのステップで止まる", async () => {
    const user = userEvent.setup();
    render(<LessonRunner lesson={fromRealTask} onFinish={() => {}} onExit={() => {}} />);

    await user.type(
      screen.getByRole("textbox"),
      "パスワードは hunter2secret です",
    );
    await user.click(screen.getByTestId("primary-action"));

    expect(await screen.findByTestId("privacy-dialog")).toBeInTheDocument();
    // 取り消せない実害が出るものは、そのままでは進ませない
    expect(screen.getByTestId("privacy-send-anyway")).toBeDisabled();
  });

  it("メールアドレスなら、読んだうえで進める", async () => {
    const user = userEvent.setup();
    render(<LessonRunner lesson={fromRealTask} onFinish={() => {}} onExit={() => {}} />);

    await user.type(
      screen.getByRole("textbox"),
      "連絡先は tanaka@example.com です。確認をお願いします。",
    );
    await user.click(screen.getByTestId("primary-action"));

    const dialog = await screen.findByTestId("privacy-dialog");
    expect(dialog).toBeInTheDocument();

    await user.click(screen.getByTestId("privacy-send-anyway"));

    // ダイアログから出られること。ここが無いと詰む
    await waitFor(() => {
      expect(screen.queryByTestId("privacy-dialog")).not.toBeInTheDocument();
    });
  });

  it("何も混ざっていなければ、そのまま進む", async () => {
    const user = userEvent.setup();
    render(<LessonRunner lesson={fromRealTask} onFinish={() => {}} onExit={() => {}} />);

    await user.type(screen.getByRole("textbox"), "来週の打ち合わせの資料をお願いします。");
    await user.click(screen.getByTestId("primary-action"));

    await waitFor(() => {
      expect(screen.queryByTestId("privacy-dialog")).not.toBeInTheDocument();
    });
  });
});
