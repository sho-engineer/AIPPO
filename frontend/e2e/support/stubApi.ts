import type { Page, Route } from "@playwright/test";

/**
 * バックエンドの応答をスタブへ差し替える。
 *
 * E2E は画面と導線を確かめるものなので、AI の揺れを持ち込まない。
 * **実APIは絶対に呼ばない**（要件 §15）。
 */

export interface GenerateBody {
  lesson_id: string;
  step_id: string;
  action: string;
  input: Record<string, string>;
}

export interface StubOptions {
  /** 生成結果。呼ばれた回数と本文を受け取る。 */
  result?: (callCount: number, body: GenerateBody) => string;
  /** 生成を失敗させる。回数を渡すと、その回だけ失敗する。 */
  failStatus?: number;
  failOnCall?: number;
  /** ポーの発言。 */
  tutor?: Partial<TutorBody>;
}

export interface TutorBody {
  message: string;
  emotion: string;
  action: string;
}

export interface StubHandle {
  calls: GenerateBody[];
  events: { event_type: string; step: string; input_length: number }[];
}

const DEFAULT_TUTOR: TutorBody = {
  message: "【スタブ応答】どこが変わったか見てみましょう。",
  emotion: "neutral",
  action: "review",
};

/** 条件を映した固定応答。条件を変えると結果が変わることを確かめられる。 */
function defaultResult(callCount: number, body: GenerateBody): string {
  const conditions = Object.entries(body.input)
    .filter(([key, value]) => value && key !== "original_text" && key !== "topic")
    .map(([, value]) => value)
    .join(" / ");
  const source = body.input.original_text ?? body.input.topic ?? "";
  return `【スタブ応答 ${callCount}回目】${conditions}\n${source.slice(0, 40)}`;
}

export async function stubApi(
  page: Page,
  options: StubOptions = {},
): Promise<StubHandle> {
  const handle: StubHandle = { calls: [], events: [] };
  let callCount = 0;

  await page.route("**/api/v1/ai/generate/", async (route: Route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 200, body: "" });
      return;
    }

    const body = route.request().postDataJSON() as GenerateBody;
    handle.calls.push(body);
    callCount += 1;

    const shouldFail =
      options.failStatus !== undefined &&
      (options.failOnCall === undefined || options.failOnCall === callCount);

    if (shouldFail) {
      await route.fulfill({
        status: options.failStatus as number,
        contentType: "application/json",
        body: JSON.stringify({
          errors: {
            detail: ["うまく届かなかったようです。もう一度おくってみましょう。"],
          },
          tutor: {
            message: "もう一度おくってみましょう。",
            emotion: "warning",
            action: "retry",
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: (options.result ?? defaultResult)(callCount, body),
        tutor: { ...DEFAULT_TUTOR, ...options.tutor },
        usage: {
          provider: "mock",
          model: "mock-1",
          input_tokens: 10,
          output_tokens: 20,
          latency_ms: 5,
        },
        extras: {},
      }),
    });
  });

  await page.route("**/api/learning-events/", async (route: Route) => {
    if (route.request().method() === "POST") {
      handle.events.push(route.request().postDataJSON());
    }
    await route.fulfill({ status: 204, body: "" });
  });

  // ほかの通信も実サーバーへ行かないよう塞ぐ。
  //
  // ここでまとめて塞ぐ形（api の下すべて）を使ってはいけない。
  // 開発サーバーはアプリ自身のソースを /src/api/ai.ts として配るので、
  // それごと JSON に差し替えてしまい、アプリが起動しなくなる。
  // そのうえ画面が真っ白なまま検査が通り、壊れていることに気づけない。
  for (const pattern of [
    "**/api/lessons/**",
    "**/api/profile/**",
    "**/api/tutor/**",
  ]) {
    await page.route(pattern, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: null }),
      });
    });
  }

  return handle;
}
