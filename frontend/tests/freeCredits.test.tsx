/**
 * 無料で使える分の、画面側。
 *
 * 見張るのは3つ。
 *
 *   1. 同じ操作は同じ合言葉で送ること（1回ぶんしか減らない）
 *   2. 自分でもう一度押したときは、新しい合言葉になること
 *   3. 使い切ったとき、行き止まりにしないこと
 *
 * 3つ目がいちばん大事。断られたまま「もう一度」ボタンだけを出すと、
 * 押しても必ずまた断られる画面になる。次にできることは2つ——
 * いま登録して続ける、明日また続ける——ので、その2つを出す。
 */

import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LessonPaused } from "../src/components/course/LessonPaused";
import { PAUSED_COPY } from "../src/content/ui";
import { generate, AiRequestError } from "../src/api/ai";
import { getLesson } from "../src/course/catalog";
import { useCourseLesson } from "../src/course/useCourseLesson";
import { newRequestId } from "../src/lib/requestId";
import type { Lesson } from "../src/course/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/*
  記録は送らない。ここで見たいのは画面の作りで、記録の道は
  `analytics.test.tsx` が見ている。繋がらないサーバーへ投げると、
  失敗の山で本当の失敗が読めなくなる。
*/
vi.mock("../src/api/lesson", async () => {
  const actual = await vi.importActual<typeof import("../src/api/lesson")>(
    "../src/api/lesson",
  );
  return { ...actual, sendLearningEvent: vi.fn(async () => {}) };
});

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("操作の合言葉", () => {
  it("UUID の形をしている", () => {
    /*
      サーバーは `UUIDField` で受ける。形が違うと 400 で捨てられ、
      **合言葉が付いていないのと同じ**になる——二重送信が素通りする。
    */
    expect(newRequestId()).toMatch(UUID);
  });

  it("呼ぶたびに違う", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newRequestId()));

    expect(ids.size).toBe(200);
  });

  it("randomUUID が無い環境でも作れる", () => {
    /*
      `crypto.randomUUID` は安全な文脈（https や localhost）でしか
      生えないことがある。ここで落ちると AI が呼べなくなるので、
      無くても組めること。
    */
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => {
      throw new Error("使えない");
    });
    // 生えていない環境のふりをする
    const original = globalThis.crypto.randomUUID;
    Reflect.deleteProperty(globalThis.crypto, "randomUUID");
    try {
      expect(newRequestId()).toMatch(UUID);
    } finally {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        value: original,
        configurable: true,
        writable: true,
      });
    }
  });
});

describe("送る中身", () => {
  function okResponse() {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        result: "できました",
        tutor: { message: "いいですね", emotion: "celebrate", action: "next" },
        usage: {},
        extras: {},
      }),
    } as unknown as Response;
  }

  it("合言葉をそのまま載せる", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse());

    await generate({
      lessonId: "rewrite_text",
      stepId: "generate",
      action: "rewrite",
      input: { original_text: "テスト" },
      requestId: "11111111-1111-4111-8111-111111111111",
    });

    // 前置きの通信（CSRF の取得など）が先に入ることがあるので、宛先で選ぶ
    const call = fetchSpy.mock.calls.find((entry) =>
      String(entry[0]).includes("/api/v1/ai/generate/"),
    );
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body.request_id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("持ち分を使い切ったのと、混み合っているのを見分ける", async () => {
    /*
      見分けは `code` でする。文言で分岐させると、文言を直した日に
      画面の出し分けが黙って壊れる。
    */
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        code: "FREE_CREDITS_EXHAUSTED",
        errors: { detail: ["今日はここまで！"] },
      }),
    } as unknown as Response);

    await expect(
      generate({
        lessonId: "rewrite_text",
        stepId: "generate",
        action: "rewrite",
        input: {},
      }),
    ).rejects.toMatchObject({ kind: "out_of_credits" });
  });

  it("code が無い 429 は、これまでどおり「上限」", async () => {
    // サービス全体が今日の上限に達した側。登録しても増えない
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ errors: { detail: ["混み合っています"] } }),
    } as unknown as Response);

    await expect(
      generate({
        lessonId: "rewrite_text",
        stepId: "generate",
        action: "rewrite",
        input: {},
      }),
    ).rejects.toMatchObject({ kind: "limit" });
  });

  it("AI が止まっているのは、上限ではない", async () => {
    /*
      鍵が入っていない日や AI が落ちた日に「今日の練習はここまで！」を
      出していた。その人はまだ1回も使えていないのに、今日はもう
      終わったことにされる。直ればまた使えるので「もう一度」の側。
    */
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        code: "AI_SERVICE_NOT_CONFIGURED",
        errors: { detail: ["現在AI機能を利用できません。"] },
      }),
    } as unknown as Response);

    await expect(
      generate({
        lessonId: "rewrite_text",
        stepId: "generate",
        action: "rewrite",
        input: {},
      }),
    ).rejects.toMatchObject({ kind: "failed" });
  });

  it("印の無い 503 は、これまでどおり「上限」", async () => {
    // 全体が混み合っている側。時間をおけば直る
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ errors: { detail: ["混み合っています"] } }),
    } as unknown as Response);

    await expect(
      generate({
        lessonId: "rewrite_text",
        stepId: "generate",
        action: "rewrite",
        input: {},
      }),
    ).rejects.toMatchObject({ kind: "limit" });
  });

  it("kind は4種類のどれか", () => {
    // 増やしたときに画面側の分岐を直し忘れないための杭
    const kinds: AiRequestError["kind"][] = [
      "limit",
      "duplicate",
      "failed",
      "out_of_credits",
    ];

    expect(new Set(kinds).size).toBe(4);
  });
});

describe("同じ操作は、1回ぶんしか減らない", () => {
  /** AI を呼ぶ回から始まる教材にして、そこだけを見る。 */
  const full = getLesson("rewrite_text") as Lesson;
  const start = full.steps.findIndex((step) => step.type === "ai_generate");
  const lesson: Lesson = { ...full, steps: full.steps.slice(start) };

  /** 送った合言葉を、送られた順に取り出す。 */
  function sentIds(spy: { mock: { calls: unknown[][] } }): string[] {
    return spy.mock.calls
      .filter((call) => String(call[0]).includes("/api/v1/ai/generate/"))
      .map((call) => JSON.parse(String((call[1] as RequestInit)?.body)).request_id);
  }

  function ok() {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        result: "できました",
        tutor: { message: "いいですね", emotion: "celebrate", action: "next" },
        usage: {},
        extras: {},
      }),
    } as unknown as Response;
  }

  function down() {
    return {
      ok: false,
      status: 502,
      json: async () => ({ errors: { detail: ["うまく届きませんでした"] } }),
    } as unknown as Response;
  }

  it("届かずに送り直したときは、同じ合言葉", async () => {
    /*
      これがいちばん危ない道。**サーバーには届いていて、返事だけが
      落ちた**ことがある。新しい合言葉で送り直すと、作り直されて
      1回ぶん余計に減る——押した人から見れば「1回しか押していない
      のに2回減った」。
    */
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(down());
    const { result } = renderHook(() => useCourseLesson(lesson));

    await act(async () => {
      await result.current.run();
    });
    await act(async () => {
      await result.current.run();
    });

    const ids = sentIds(fetchSpy);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it("うまくいったあとの送りは、新しい合言葉", async () => {
    /*
      こちらは本当に「もう1回作ってほしい」。同じ合言葉のままだと
      サーバーが前の結果を返すので、**押しても何も変わらない**。
    */
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());
    const { result } = renderHook(() => useCourseLesson(lesson));

    await act(async () => {
      await result.current.run();
    });
    await act(async () => {
      await result.current.run();
    });

    const ids = sentIds(fetchSpy);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("連打しても、送るのは1回", async () => {
    /*
      画面側でも止める（`inFlight`）。サーバー側の合言葉と二重に
      守るのは、画面だけに任せると**タブを2つ開く道**が残るため。
    */
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());
    const { result } = renderHook(() => useCourseLesson(lesson));

    await act(async () => {
      await Promise.all([
        result.current.run(),
        result.current.run(),
        result.current.run(),
      ]);
    });

    expect(sentIds(fetchSpy)).toHaveLength(1);
  });

  it("送るのは UUID の形（400 で捨てられない）", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());
    const { result } = renderHook(() => useCourseLesson(lesson));

    await act(async () => {
      await result.current.run();
    });

    expect(sentIds(fetchSpy)[0]).toMatch(UUID);
  });
});

describe("使い切ったときの画面", () => {
  const po = { message: "今日はここまで！", emotion: "celebrate", action: "wait" } as const;

  it("その人の分を使い切ったときは、進む道を2つ出す", async () => {
    render(
      <LessonPaused
        po={po}
        canRegisterForMore
        done={["試す", "変える"]}
        onExit={() => {}}
      />,
    );

    expect(screen.getByTestId("lesson-paused-register")).toHaveTextContent(
      PAUSED_COPY.registerNow,
    );
    expect(screen.getByTestId("lesson-paused-tomorrow")).toHaveTextContent(
      PAUSED_COPY.waitTomorrow,
    );
  });

  it("「明日また続ける」も本当に進む（押すと出られる）", async () => {
    /*
      片方だけを本物にすると、登録しない人にとっては行き止まりのまま。
      押して何も起きないボタンを置かない。
    */
    const user = userEvent.setup();
    const onExit = vi.fn();

    render(<LessonPaused po={po} canRegisterForMore onExit={onExit} />);
    await user.click(screen.getByTestId("lesson-paused-tomorrow"));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("登録を押すと、その場で登録の画面が開く（別の画面へ飛ばさない）", async () => {
    // 飛ばすと、いま止まっている回から離れる＝続きから戻れない
    const user = userEvent.setup();

    render(<LessonPaused po={po} canRegisterForMore onExit={() => {}} />);
    await user.click(screen.getByTestId("lesson-paused-register"));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  });

  it("サービス全体の上限のときは、登録を勧めない", () => {
    /*
      ここで登録を勧めると嘘になる。登録しても増えないので、
      押した人は登録したうえで同じ画面に戻る。
    */
    render(<LessonPaused po={po} onExit={() => {}} />);

    expect(screen.queryByTestId("lesson-paused-register")).toBeNull();
    expect(screen.getByTestId("lesson-paused-exit")).toBeInTheDocument();
  });

  it("今日できるようになったことは、通り終えた分だけ出す", () => {
    render(<LessonPaused po={po} done={["試す"]} onExit={() => {}} />);

    expect(screen.getByText(PAUSED_COPY.doneTitle)).toBeInTheDocument();
    expect(screen.getByText("試す")).toBeInTheDocument();
  });

  it("何も通っていないなら、その欄ごと出さない", () => {
    // 空の見出しだけが残ると「何も身に付かなかった」と読める
    render(<LessonPaused po={po} done={[]} onExit={() => {}} />);

    expect(screen.queryByText(PAUSED_COPY.doneTitle)).toBeNull();
  });

  it("残り回数も、回復までの時間も出さない", () => {
    /*
      数字で急かさない。焦って登録させても、次に開く理由にはならない。
    */
    const { container } = render(
      <LessonPaused po={po} canRegisterForMore done={["試す"]} onExit={() => {}} />,
    );
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/残り\s*\d/);
    expect(text).not.toMatch(/あと\s*\d+\s*(回|時間|分)/);
  });
});

describe("使い切ったときの言葉", () => {
  it("こちら側の都合の名前を出さない", () => {
    /*
      「Quota」「Credit」「API」「Token」——どれも押した人がした
      こととは関係が無い。読んでも次に何をすればよいか分からない。
    */
    const words = ["Quota", "quota", "Credit", "クレジット", "API", "Token", "トークン"];
    const copy = Object.values(PAUSED_COPY).join("\n");

    for (const word of words) expect(copy).not.toContain(word);
  });

  it("次にできることが書いてある", () => {
    expect(PAUSED_COPY.registerNow).toContain("続き");
    expect(PAUSED_COPY.waitTomorrow).toContain("明日");
  });
});
