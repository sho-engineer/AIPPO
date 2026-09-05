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
      <LessonRunner lesson={lessonFromRealTask} onExit={() => {}} onOpenCourse={() => {}} />,
    );

    await user.type(
      await screen.findByRole("textbox"),
      "来週の打ち合わせの件、資料の確認をお願いします。お手すきのときで結構です。",
    );
    await user.click(screen.getByTestId("primary-action"));

    /*
      次のステップ（送る内容の確認）へ移っていること。

      前はここが「誰が読みますか」だった。相手や言い方を聞く回は
      自分の文章より**前**へ移したので、書き終えたあとは
      「書く → 確かめる → 送る」が続く。
    */
    // 見出しは画面の上と本文の中に2つ出る。ここでは移ったことだけ見る
    expect(
      await screen.findAllByRole("heading", { name: "AIにはこう伝えます" }),
    ).not.toHaveLength(0);

    // ここでは AI を呼ばない。送るのは prompt_preview のあと
    const aiCalls = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).includes("/api/v1/ai/generate/"),
    );
    expect(aiCalls).toHaveLength(0);
  });

  it("空のままでは進めない（理由も出す）", async () => {
    render(
      <LessonRunner lesson={lessonFromRealTask} onExit={() => {}} onOpenCourse={() => {}} />,
    );

    /*
      押せる形のまま「まだ進めない」を表す（aria-disabled）。
      本物の disabled にすると押下を受け取れず、理由をその場で言えない。
    */
    expect(await screen.findByTestId("primary-action")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    /*
      押せない理由を黙って隠さない。

      文に見出しは混ぜない。見出しはそれ自体が文になっていることがあり、
      「条件を一つ足してみましょうをえらんでみましょう。」になった。
      いま見るのは「何をすれば進めるか」が書いてあること。
    */
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/入力してください/),
    );
  });

  it("書きたくない人は飛ばせる", async () => {
    const user = userEvent.setup();
    render(
      <LessonRunner lesson={lessonFromRealTask} onExit={() => {}} onOpenCourse={() => {}} />,
    );

    await user.click(await screen.findByRole("button", { name: "今回はスキップする" }));

    expect(screen.queryByRole("heading", { name: "自分の文章" })).not.toBeInTheDocument();
  });
});

/**
 * 戻ったのに、また送られてしまう不具合の番人。
 *
 * 何が起きていたか
 * ----------------
 * 自動送りの条件が `isAnswered(step, values)` ——**保存してある答えが
 * 入っているか**だった。これは操作ではなく状態なので、
 *
 *     札を押した     → 答えが入る → 500ms 後に送られる（意図どおり）
 *     ←で戻ってきた  → 答えが**まだ入っている** → また送られる
 *
 * の2つが区別できない。戻るたびに前へ送り返されるので、
 * **一度答えた回には二度と戻れなかった。**
 *
 * いまは「この回に入ってきたときの答え」を覚えておき、
 * **その回にいる間に答えが変わったとき**だけ送る（`changedHere`）。
 * 戻ってきた直後は変わっていないので、送られない。
 *
 * 診断は別途、丸ごと自動送りを止めてある（`course/autoAdvance.ts`）。
 * ここで見るのは**診断以外のレッスン**——止め方が2段になっている
 * ので、片方だけで通ってしまわないように分けて見張る。
 */
describe("答えた回へ戻ったとき", () => {
  /** 自動で送ってよい形の回を2つ並べただけの、最小の教材。 */
  const twoChoices: Lesson = {
    id: "back_nav_probe",
    number: 1,
    title: "テスト",
    goal: "",
    outcomes: [],
    tags: [],
    usesAi: false,
    steps: [
      {
        id: "q1",
        type: "single_choice",
        title: "だれが読みますか",
        poMessage: "",
        poEmotion: "question",
        key: "audience",
        required: true,
        options: [
          { value: "boss", label: "上司" },
          { value: "client", label: "お客様" },
        ],
      },
      {
        id: "q2",
        type: "single_choice",
        title: "どんな口調にしますか",
        poMessage: "",
        poEmotion: "question",
        key: "tone",
        required: true,
        options: [
          { value: "soft", label: "やさしく" },
          { value: "firm", label: "きっぱりと" },
        ],
      },
      {
        id: "end",
        type: "completion",
        title: "おつかれさまでした",
        poMessage: "",
        poEmotion: "celebrate",
      },
    ],
  };

  const heading = (name: string) => screen.findAllByRole("heading", { name });

  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("選んだら、そのまま次へ送る", async () => {
    // 直したせいで自動送りごと止まっていないこと
    const user = userEvent.setup();
    render(<LessonRunner lesson={twoChoices} onExit={() => {}} onOpenCourse={() => {}} />);

    await user.click(await screen.findByRole("button", { name: "上司" }));

    expect(await heading("どんな口調にしますか")).not.toHaveLength(0);
  });

  it("←で戻ったら、そこに留まる", async () => {
    const user = userEvent.setup();
    render(<LessonRunner lesson={twoChoices} onExit={() => {}} onOpenCourse={() => {}} />);

    await user.click(await screen.findByRole("button", { name: "上司" }));
    await heading("どんな口調にしますか");

    await user.click(screen.getByTestId("lesson-back"));
    expect(await heading("だれが読みますか")).not.toHaveLength(0);

    // 前の答えは選ばれたまま。ただし、それだけでは送らない
    expect(screen.getByRole("button", { name: "上司" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // 自動送りは 500ms。それより十分に長く置いても動かない
    await new Promise((done) => setTimeout(done, 1200));
    expect(await heading("だれが読みますか")).not.toHaveLength(0);
  });

  it("戻った先で選び直せば、そこからは進む", async () => {
    // 戻れることと引き換えに、選び直したあと詰まるのでは意味がない
    const user = userEvent.setup();
    render(<LessonRunner lesson={twoChoices} onExit={() => {}} onOpenCourse={() => {}} />);

    await user.click(await screen.findByRole("button", { name: "上司" }));
    await heading("どんな口調にしますか");
    await user.click(screen.getByTestId("lesson-back"));
    await heading("だれが読みますか");

    await user.click(screen.getByRole("button", { name: "お客様" }));

    expect(await heading("どんな口調にしますか")).not.toHaveLength(0);
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
    render(<LessonRunner lesson={fromRealTask} onExit={() => {}} onOpenCourse={() => {}} />);

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
    render(<LessonRunner lesson={fromRealTask} onExit={() => {}} onOpenCourse={() => {}} />);

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
    render(<LessonRunner lesson={fromRealTask} onExit={() => {}} onOpenCourse={() => {}} />);

    await user.type(screen.getByRole("textbox"), "来週の打ち合わせの資料をお願いします。");
    await user.click(screen.getByTestId("primary-action"));

    await waitFor(() => {
      expect(screen.queryByTestId("privacy-dialog")).not.toBeInTheDocument();
    });
  });
});
