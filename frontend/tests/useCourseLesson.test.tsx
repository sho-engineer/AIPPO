import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LessonRunner } from "../src/pages/LessonRunner";
import { PrivacyDialog } from "../src/components/course/PrivacyDialog";
import { getLesson } from "../src/course/catalog";
import { loadDraft } from "../src/lib/draft";

/**
 * レッスンを進めるところ。
 *
 * 通信はすべて差し替える。ここで確かめたいのは
 * 「入力が消えないこと」「二重に送らないこと」「失敗しても続けられること」で、
 * サーバーの都合ではない。
 */

const REWRITE = getLesson("rewrite_text")!;

let generate: ReturnType<typeof vi.fn>;

vi.mock("../src/api/lesson", () => ({
  sendLearningEvent: vi.fn().mockResolvedValue(true),
}));

vi.mock("../src/api/ai", async () => {
  const actual = await vi.importActual<typeof import("../src/api/ai")>(
    "../src/api/ai",
  );
  return {
    ...actual,
    generate: (...args: unknown[]) => generate(...args),
  };
});

function okResponse(result = "書き直した文章です。") {
  return {
    result,
    tutor: { message: "見てみましょう。", emotion: "neutral", action: "review" },
    usage: {
      provider: "mock",
      model: "mock-1",
      input_tokens: 1,
      output_tokens: 1,
      latency_ms: 1,
    },
    extras: {},
  };
}

function renderLesson(lessonId = "rewrite_text") {
  const lesson = getLesson(lessonId)!;
  return render(
    <LessonRunner lesson={lesson} onExit={vi.fn()} onOpenCourse={vi.fn()} />,
  );
}

/** 完成イメージ → 相手を選ぶ、まで進める。 */
async function toQuickTry(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("primary-action")); // 完成イメージ
  await user.click(await screen.findByRole("button", { name: /^✓? ?上司$/ }));
}

/** 最初の結果が出るところまで進める。 */
async function toFirstResult(user: ReturnType<typeof userEvent.setup>) {
  await toQuickTry(user);
  await user.click(screen.getByTestId("primary-action")); // 送信へ（自動送信）
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
}

/**
 * 解説（AI技の名前）が出るところまで進める。
 *
 * 解説は**比べたあと**に出る。観察 → 条件を足す → 再実行 → 比べる、
 * を通らないと辿り着かない。歩数を数えるより、通る画面を名前で
 * 書いたほうが、また並びが変わったときに直しやすい。
 */
async function toConceptCard(
  user: ReturnType<typeof userEvent.setup>,
  observation = "うん",
) {
  await toFirstResult(user);
  await user.click(await screen.findByRole("button", { name: observation }));
  await user.click(screen.getByTestId("primary-action")); // 観察 → 条件を足す

  await user.click(await screen.findByRole("button", { name: "もっと短く" }));
  await user.click(screen.getByTestId("primary-action")); // 再実行（自動送信）
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));

  await user.click(screen.getByTestId("primary-action")); // 比べる → 解説
}

beforeEach(() => {
  window.localStorage.clear();
  generate = vi.fn().mockResolvedValue(okResponse());
});

afterEach(() => vi.clearAllMocks());

describe("成果物ファースト", () => {
  it("最初の画面は、絵と「はじめる」だけ", async () => {
    /*
      絵の上下に長い説明を積まない。積むと、絵を見る前に読み下す
      ことになり、1枚で伝える意味が消える。

      詳しい話（ねらい・完成イメージ・流れ・覚えるAI技）はこの画面が
      持っているが、**畳んである**。持ち主がここなのと、最初から
      広げておくのは別のこと。
    */
    const user = userEvent.setup();
    renderLesson();

    expect(screen.getByTestId("outcome-preview")).toBeInTheDocument();
    expect(screen.getByTestId("outcome-before")).not.toBeVisible();
    // 先に長い説明を読ませない
    expect(screen.queryByTestId("concept-card")).toBeNull();

    await user.click(screen.getByTestId("outcome-detail-toggle"));

    /*
      開くのを待つ。<details> の開閉は、押した直後ではなく
      次の順番で効く（jsdom も同じ）。待たずに見ると、
      押したのに閉じたまま、という形で落ちる。
    */
    // Before / After を1組見せる。抽象的な目標だけにしない
    await waitFor(() => expect(screen.getByTestId("outcome-before")).toBeVisible());
    expect(screen.getByTestId("outcome-after")).toBeVisible();
  });

  it("コースの一覧から移した詳しい話が、ここに揃っている", async () => {
    // 消したのではなく、持ち主のところへ戻した
    const user = userEvent.setup();
    renderLesson();
    await user.click(screen.getByTestId("outcome-detail-toggle"));

    await waitFor(() => expect(screen.getByTestId("outcome-goal")).toBeVisible());
    expect(screen.getByTestId("outcome-flow")).toBeVisible();
    expect(screen.getByTestId("outcome-after-lesson")).toBeVisible();
  });

  it("最初に選ばせるのは1つだけ", async () => {
    const user = userEvent.setup();
    renderLesson();
    await user.click(screen.getByTestId("primary-action"));

    expect(
      await screen.findByRole("heading", { name: "誰に送る文章？" }),
    ).toBeInTheDocument();
    // 表現や長さはまだ聞かない
    expect(screen.queryByRole("button", { name: "ていねいに" })).toBeNull();
    // 何を送るのかは見えている（例文が入っている）
    expect(screen.getByText(/AIにはこう伝えます/)).toBeInTheDocument();
  });

  it("相手を選ぶだけで最初の結果まで届く", async () => {
    const user = userEvent.setup();
    renderLesson();
    await toFirstResult(user);

    const input = generate.mock.calls[0][0].input;
    expect(input.audience).toBe("上司");
    // 選ばせなかった条件は既定値で埋める
    expect(input.tone).toBe("ていねいに");
    expect(input.original_text.length).toBeGreaterThan(0);
  });
});

describe("観察してから解説する", () => {
  it("結果のあとは、解説ではなく観察が出る", async () => {
    const user = userEvent.setup();
    renderLesson();
    await toFirstResult(user);

    expect(
      await screen.findByRole("heading", { name: "読みやすくなった？" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("concept-card")).toBeNull();
  });

  it("「まだ微妙」でも進める", async () => {
    const user = userEvent.setup();
    renderLesson();
    await toFirstResult(user);

    /*
      うまくいかなかった人を止めない。**理由は任意**で、選ばなくても
      次へ進める。ここで止めると、答えられない人が行き止まりになる。
    */
    await user.click(await screen.findByRole("button", { name: "まだ微妙" }));
    await user.click(screen.getByTestId("primary-action"));

    // 気づけなくても止めない。次（条件を足す）へ進めること
    expect(
      await screen.findByRole("button", { name: "もっと短く" }),
    ).toBeInTheDocument();
  });

  it("うまくいかなかった人にだけ、理由を聞く", async () => {
    /*
      問いを2択に減らすと画面は軽くなるが、**何に気づいたかが
      測れなくなる**。全員に聞き直すと元の重さに戻るので、
      困っている人にだけ出す。
    */
    const user = userEvent.setup();
    renderLesson();
    await toFirstResult(user);

    // うまくいった人には出さない
    await user.click(await screen.findByRole("button", { name: "うん" }));
    expect(screen.queryByTestId("observation-reason")).toBeNull();

    await user.click(screen.getByRole("button", { name: "まだ微妙" }));

    expect(await screen.findByTestId("observation-reason")).toBeInTheDocument();
  });

  it("理由を選ばなくても進める", async () => {
    // 答えられない人を行き止まりにしない
    const user = userEvent.setup();
    renderLesson();
    await toFirstResult(user);

    await user.click(await screen.findByRole("button", { name: "まだ微妙" }));
    await screen.findByTestId("observation-reason");

    expect(screen.getByTestId("primary-action")).toBeEnabled();
  });

  it("解説カードは飛ばせる", async () => {
    const user = userEvent.setup();
    const { sendLearningEvent } = await import("../src/api/lesson");
    renderLesson();
    await toConceptCard(user);

    await user.click(await screen.findByRole("button", { name: "解説を飛ばす" }));

    expect(sendLearningEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "concept_card_skipped" }),
    );
  });
});

describe("条件を一つ足す", () => {
  it("足すと再実行され、3段階で比べられる", async () => {
    const user = userEvent.setup();
    generate = vi
      .fn()
      .mockResolvedValueOnce(okResponse("1回目の結果です。"))
      .mockResolvedValue(okResponse("短くした結果です。"));

    renderLesson();
    await toFirstResult(user);
    await user.click(await screen.findByRole("button", { name: "うん" }));
    await user.click(screen.getByTestId("primary-action"));

    // 解説はこの後（比べたあと）に出るので、ここでは通らない
    await user.click(await screen.findByRole("button", { name: "もっと短く" }));
    await user.click(screen.getByTestId("primary-action"));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));

    // 直前の結果を対象にしている（元へ戻していない）
    expect(generate.mock.calls[1][0].input.original_text).toBe("1回目の結果です。");
    expect(generate.mock.calls[1][0].input.improvement).toBe("もっと短く");

    // 元・1回目・改善後の3つが並ぶ
    expect(await screen.findByTestId("compare-original")).toBeInTheDocument();
    expect(screen.getByTestId("compare-first")).toHaveTextContent("1回目の結果です。");
    expect(screen.getByTestId("compare-improved")).toHaveTextContent(
      "短くした結果です。",
    );
  });
});

describe("入力を失わない", () => {
  it("戻っても消えない", async () => {
    const user = userEvent.setup();
    renderLesson();

    await toQuickTry(user);
    // 戻るはヘッダーの「←」。画面下から移した（戻る道を1本にするため）
    await user.click(screen.getByTestId("lesson-back"));
    await user.click(screen.getByTestId("primary-action"));

    expect(
      await screen.findByRole("button", { name: /上司/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("自動保存され、読み込み直しても続きから始まる", async () => {
    const user = userEvent.setup();
    const view = renderLesson();

    await toQuickTry(user);

    await waitFor(() => {
      expect(loadDraft("rewrite_text")?.values.audience).toBe("上司");
    });

    view.unmount();
    renderLesson();

    // 途中のステップから再開する
    expect(
      await screen.findByRole("button", { name: /上司/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("送信のしかた", () => {
  it("確認の前には送らない", async () => {
    const user = userEvent.setup();
    renderLesson();
    await user.click(screen.getByTestId("primary-action")); // 完成イメージ

    expect(generate).not.toHaveBeenCalled();
  });

  it("二重に押しても1回しか送らない", async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    generate = vi.fn(() => new Promise((resolve) => (release = resolve)));

    renderLesson();
    await toQuickTry(user);
    await user.click(screen.getByTestId("primary-action")); // 送信へ

    const button = await screen.findByTestId("primary-action");
    await waitFor(() => expect(button).toBeDisabled());
    await user.click(button).catch(() => undefined);

    expect(generate).toHaveBeenCalledTimes(1);
    await act(async () => release(okResponse()));
  });
});

describe("失敗しても続けられる", () => {
  it("入力を消さず、もう一度送れる", async () => {
    const user = userEvent.setup();
    const { AiRequestError } = await import("../src/api/ai");
    generate = vi
      .fn()
      .mockRejectedValueOnce(new AiRequestError("うまく届かなかったようです。", "failed"))
      .mockResolvedValue(okResponse());

    renderLesson();
    await toQuickTry(user);
    await user.click(screen.getByTestId("primary-action"));

    /*
      詰まったので、次にできることが並ぶ（`course/rescue.ts`）。
      届かなかっただけなら、押し直しがその筆頭。
    */
    await screen.findByTestId("failure-rescue");
    expect(screen.getByTestId("po-avatar")).toHaveAttribute(
      "data-emotion",
      "warning",
    );

    await user.click(screen.getByTestId("rescue-retry"));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
  });

  it("行き止まりにしない（押せる道が必ずある）", async () => {
    /*
      前は「もう一度」1本だけだった。同じ頼み方ではまた同じになる
      種類の失敗では、押し直しは道ではない——3回押して同じ画面を
      見た人はそこでやめる。
    */
    const user = userEvent.setup();
    const { AiRequestError } = await import("../src/api/ai");
    generate = vi
      .fn()
      .mockRejectedValue(
        new AiRequestError("うまく変わりませんでした。", "unusable"),
      );

    renderLesson();
    await toQuickTry(user);
    await user.click(screen.getByTestId("primary-action"));

    const rescue = await screen.findByTestId("failure-rescue");
    const buttons = within(rescue).getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button).toBeEnabled();

    // 押しても同じところへ戻るだけの道は出さない
    expect(screen.queryByTestId("rescue-retry")).not.toBeInTheDocument();
  });

  it("学習者を評価する言葉を出さない", async () => {
    /*
      起きたのは AI の出力のばらつきで、書いた人のせいではない。
      評価されたと感じた人は、次から自由入力を避けて例文だけを押す
      ようになる——目的からいちばん遠いところへ行く。
    */
    const user = userEvent.setup();
    const { AiRequestError } = await import("../src/api/ai");
    generate = vi
      .fn()
      .mockRejectedValue(
        new AiRequestError("うまく変わりませんでした。", "unusable"),
      );

    renderLesson();
    await toQuickTry(user);
    await user.click(screen.getByTestId("primary-action"));

    const rescue = await screen.findByTestId("failure-rescue");
    for (const word of ["不正解", "失敗", "間違", "正しくありません"]) {
      expect(rescue.textContent ?? "").not.toContain(word);
    }
  });
});

describe("今日の上限に達したとき", () => {
  /*
    前は違った。上限に達しても「AI送信中」の画面
    （`止まっています` + 押し直せる「AIに送る」）がそのまま出続け、
    ポーの吹き出しにだけ上限の知らせが乗っていた——
    3つの矛盾するメッセージが同時に画面へ出ていた。

    上限は押し直しても直らない。押せる送信ボタンを残さず、
    専用の画面（`components/course/LessonPaused.tsx`）へ切り替わる
    ことを確かめる。
  */
  it("送信中の画面ではなく、専用の『今日はここまで』画面が出る", async () => {
    const user = userEvent.setup();
    const { AiRequestError } = await import("../src/api/ai");
    generate = vi
      .fn()
      .mockRejectedValue(
        new AiRequestError(
          "今日はたくさん練習しましたね。続きは、また明日ここから試してみてください。",
          "limit",
        ),
      );

    renderLesson();
    await toQuickTry(user);
    await user.click(screen.getByTestId("primary-action")); // 送信へ（自動送信・失敗）

    expect(await screen.findByTestId("lesson-paused")).toHaveTextContent(
      "今日はたくさん練習しましたね",
    );

    // 押しても必ずまた上限に当たるだけのボタンを残さない
    expect(screen.queryByTestId("primary-action")).not.toBeInTheDocument();
    expect(screen.queryByTestId("step-error")).not.toBeInTheDocument();

    // 同じ文言が2か所（吹き出しと画面本文）に重複して出ない
    expect(
      screen.getAllByText(/今日はたくさん練習しましたね/).length,
    ).toBe(1);
  });

  it("『ホームへ戻る』で、渡された行き先が呼ばれる", async () => {
    const user = userEvent.setup();
    const { AiRequestError } = await import("../src/api/ai");
    generate = vi
      .fn()
      .mockRejectedValue(new AiRequestError("今日はここまでです。", "limit"));
    const onExit = vi.fn();
    const lesson = getLesson("rewrite_text")!;

    render(<LessonRunner lesson={lesson} onExit={onExit} onOpenCourse={vi.fn()} />);
    await toQuickTry(user);
    await user.click(screen.getByTestId("primary-action"));
    await screen.findByTestId("lesson-paused");

    await user.click(screen.getByTestId("lesson-paused-exit"));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("押し直せば直る失敗を、『今日はここまで』と取り違えない", async () => {
    /*
      「上限だけを特別扱いする」の裏取り。他の失敗まで巻き込んで
      いないこと。

      届かなかっただけの人に「今日はここまで」と言うと、まだ1回も
      使えていないのに今日が終わったことにされる。行き先は
      詰まったときの画面のほうで、そこには押し直しが出る。
    */
    const user = userEvent.setup();
    const { AiRequestError } = await import("../src/api/ai");
    generate = vi
      .fn()
      .mockRejectedValue(new AiRequestError("うまく届かなかったようです。", "failed"));

    renderLesson();
    await toQuickTry(user);
    await user.click(screen.getByTestId("primary-action"));

    await screen.findByTestId("failure-rescue");
    expect(screen.queryByTestId("lesson-paused")).not.toBeInTheDocument();
    expect(screen.getByTestId("rescue-retry")).toBeEnabled();
  });
});

describe("送信前の確認（機密チェック）", () => {
  /*
    ここでは確認ダイアログそのものを確かめる。
    レッスンを通しで動かす経路は e2e/lesson.spec.ts が受け持つ。
    画面の段数に依存させると、教材を1ステップ足すたびに落ちる。
  */
  it("強い警告のときは、送信を選べない", () => {
    render(
      <PrivacyDialog
        findings={[
          { id: "api_key", level: "block", label: "APIキーのような文字列" },
        ]}
        onEdit={vi.fn()}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByTestId("privacy-send-anyway")).toBeDisabled();
    // 危ないほうを既定にしない
    expect(screen.getByRole("button", { name: "内容を修正する" })).toHaveFocus();
  });

  it("確認だけのときは、そのまま送れる", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(
      <PrivacyDialog
        findings={[{ id: "email", level: "warn", label: "メールアドレス" }]}
        onEdit={vi.fn()}
        onSend={onSend}
      />,
    );

    await user.click(screen.getByTestId("privacy-send-anyway"));
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("見つけた中身そのものは画面に出さない", () => {
    render(
      <PrivacyDialog
        findings={[{ id: "email", level: "warn", label: "メールアドレス" }]}
        onEdit={vi.fn()}
        onSend={vi.fn()}
      />,
    );
    expect(screen.queryByText(/@/)).toBeNull();
  });
});

describe("自分の課題", () => {
  it("スキップしたことを記録する", async () => {
    const user = userEvent.setup();
    const { sendLearningEvent } = await import("../src/api/lesson");

    render(
      <LessonRunner
        lesson={{
          ...REWRITE,
          // 自分の課題のステップから始める
          steps: REWRITE.steps.slice(REWRITE.steps.findIndex((s) => s.id === "real_task")),
        }}
        onExit={vi.fn()} onOpenCourse={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "今回はスキップする" }));

    expect(sendLearningEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "real_task_skipped" }),
    );
  });
});

describe("ポーの状態", () => {
  it("はじまりでは案内し、入力の画面では引っこむ", async () => {
    /*
      前はここで「1画面目 → 2画面目でも表情が変わる」ことを見ていた。
      つまり**どちらの画面にもポーが居る**ことが前提だった。

      いまは居る場面を決めてある（course/poPresence.ts）。
      毎画面に居ると、居ること自体が何も言わなくなるため。
      見張るのは「変わること」ではなく「**居るべき場面に居ること**」。
    */
    const user = userEvent.setup();
    renderLesson();

    expect(screen.getByTestId("po-avatar")).toHaveAttribute(
      "data-emotion",
      REWRITE.steps[0].poEmotion,
    );
    expect(screen.getByTestId("po-hero")).toHaveAttribute(
      "data-po-scene",
      "start",
    );

    // 次は「どんな相手に送りますか」。聞いているのは画面の中身なので、下がる
    await user.click(screen.getByTestId("primary-action"));
    await waitFor(() =>
      expect(screen.queryByTestId("po-avatar")).not.toBeInTheDocument(),
    );
  });

  it("AIへ送っている間だけ、考えている顔で戻ってくる", async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    generate = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    renderLesson();
    await toQuickTry(user);
    await user.click(screen.getByTestId("primary-action"));

    await waitFor(() =>
      expect(screen.getByTestId("po-avatar")).toHaveAttribute(
        "data-emotion",
        "thinking",
      ),
    );
    expect(screen.getByTestId("po-hero")).toHaveAttribute(
      "data-po-scene",
      "thinking",
    );

    release(okResponse());
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  });

  it("失敗したときは顔だけ出して、同じ文を二度言わない", async () => {
    /*
      失敗の文は、ポーの吹き出しと下のエラー欄に**同じ文字**が入る。
      同じ文が2か所にあると、2つ別のことが起きたのかと読んでしまう。
    */
    const user = userEvent.setup();
    const { AiRequestError } = await import("../src/api/ai");
    generate = vi
      .fn()
      .mockRejectedValue(new AiRequestError("うまく届かなかったようです。", "failed"));

    renderLesson();
    await toQuickTry(user);
    await user.click(screen.getByTestId("primary-action"));

    const rescue = await screen.findByTestId("failure-rescue");
    expect(screen.getByTestId("po-avatar")).toHaveAttribute(
      "data-emotion",
      "warning",
    );
    expect(screen.queryByTestId("po-hero-message")).not.toBeInTheDocument();

    // 失敗の文は1か所だけ。2か所にあると、2つ別のことが起きたと読める
    expect(within(rescue).getAllByText(/うまく届かなかった/)).toHaveLength(1);
  });
});
