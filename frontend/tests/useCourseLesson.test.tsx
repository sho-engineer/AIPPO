import { act, render, screen, waitFor } from "@testing-library/react";
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
    <LessonRunner lesson={lesson} onFinish={vi.fn()} onExit={vi.fn()} />,
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

beforeEach(() => {
  window.localStorage.clear();
  generate = vi.fn().mockResolvedValue(okResponse());
});

afterEach(() => vi.clearAllMocks());

describe("成果物ファースト", () => {
  it("最初に完成イメージを見せる", () => {
    renderLesson();
    expect(screen.getByTestId("outcome-preview")).toBeInTheDocument();
    // Before / After を1組見せる。抽象的な目標だけにしない
    expect(screen.getByTestId("outcome-before")).toBeInTheDocument();
    expect(screen.getByTestId("outcome-after")).toBeInTheDocument();
    // 先に長い説明を読ませない
    expect(screen.queryByTestId("concept-card")).toBeNull();
  });

  it("最初に選ばせるのは1つだけ", async () => {
    const user = userEvent.setup();
    renderLesson();
    await user.click(screen.getByTestId("primary-action"));

    expect(
      await screen.findByRole("heading", { name: "この文章は誰に送りますか？" }),
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
      await screen.findByRole("heading", { name: "どこが変わったと思いますか" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("concept-card")).toBeNull();
  });

  it("「よく分からない」でも進める", async () => {
    const user = userEvent.setup();
    renderLesson();
    await toFirstResult(user);

    await user.click(await screen.findByRole("button", { name: "よく分からない" }));
    await user.click(screen.getByTestId("primary-action"));

    expect(await screen.findByTestId("concept-card")).toBeInTheDocument();
  });

  it("解説カードは飛ばせる", async () => {
    const user = userEvent.setup();
    const { sendLearningEvent } = await import("../src/api/lesson");
    renderLesson();
    await toFirstResult(user);
    await user.click(await screen.findByRole("button", { name: "短くなった" }));
    await user.click(screen.getByTestId("primary-action"));

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
    await user.click(await screen.findByRole("button", { name: "短くなった" }));
    await user.click(screen.getByTestId("primary-action"));

    // 解説を3枚ぶん進める
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByTestId("primary-action"));
    }

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
    await user.click(screen.getByRole("button", { name: "もどる" }));
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

    expect(await screen.findByRole("alert")).toHaveTextContent("うまく届かなかった");
    expect(screen.getByTestId("po-avatar")).toHaveAttribute(
      "data-emotion",
      "warning",
    );

    await user.click(screen.getByTestId("primary-action"));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
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
        onFinish={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "今回はスキップする" }));

    expect(sendLearningEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "real_task_skipped" }),
    );
  });
});

describe("ポーの状態", () => {
  it("ステップに合わせて変わる", async () => {
    const user = userEvent.setup();
    renderLesson();

    const po = screen.getByTestId("po-avatar");
    expect(po).toHaveAttribute("data-emotion", REWRITE.steps[0].poEmotion);

    await user.click(screen.getByTestId("primary-action"));
    await waitFor(() =>
      expect(screen.getByTestId("po-avatar")).toHaveAttribute(
        "data-emotion",
        "question",
      ),
    );
  });
});
