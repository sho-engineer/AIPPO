import type { Page, Route } from "@playwright/test";

/**
 * バックエンドの応答をスタブへ差し替える。
 *
 * AIPPO 開発概要 §18 Phase 6 の「AI APIはテスト用レスポンスに置き換える」。
 * E2E は画面と導線を確かめるものなので、AI の揺れを持ち込まない。
 */

export interface StubOptions {
  /** 文章生成の応答。呼ばれた回数を受け取る。 */
  rewrite?: (callCount: number, body: RewriteBody) => string;
  /** 文章生成を失敗させる。 */
  rewriteStatus?: number;
  /** ポーのフィードバック。 */
  feedback?: Partial<TutorFeedbackBody>;
  /** 再訪時の到達ステップ。 */
  resumeStep?: string | null;
}

export interface RewriteBody {
  original_text: string;
  audience: string;
  tone: string;
  length: string;
  instruction: string;
  step: string;
}

export interface TutorFeedbackBody {
  message: string;
  emotion: string;
  action: string;
  hint_level: number;
  completed: boolean;
}

export interface StubHandle {
  rewriteCalls: RewriteBody[];
  events: { event_type: string; step: string; input_length: number }[];
  surveys: Record<string, string>[];
}

const DEFAULT_FEEDBACK: TutorFeedbackBody = {
  message: "【スタブ応答】読む相手を伝えると、結果が変わります。",
  emotion: "hint",
  action: "retry",
  hint_level: 1,
  completed: false,
};

export async function stubApi(
  page: Page,
  options: StubOptions = {},
): Promise<StubHandle> {
  const handle: StubHandle = { rewriteCalls: [], events: [], surveys: [] };

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

  await page.route("**/api/lessons/rewrite-text/generate/", async (route) => {
    const body = route.request().postDataJSON() as RewriteBody;
    handle.rewriteCalls.push(body);

    if (options.rewriteStatus && options.rewriteStatus >= 400) {
      return json(route, options.rewriteStatus, {
        errors: { detail: ["うまく届かなかったようです。もう一度おくってみましょう。"] },
      });
    }

    const text = options.rewrite
      ? options.rewrite(handle.rewriteCalls.length, body)
      : defaultRewrite(handle.rewriteCalls.length, body);
    return json(route, 200, { rewritten_text: text });
  });

  await page.route("**/api/tutor/feedback/", (route) =>
    json(route, 200, { ...DEFAULT_FEEDBACK, ...options.feedback }),
  );

  await page.route("**/api/learning-events/", async (route) => {
    handle.events.push(route.request().postDataJSON());
    return route.fulfill({ status: 204, body: "" });
  });

  await page.route("**/api/lessons/*/session/", (route) =>
    json(route, 200, {
      session: options.resumeStep
        ? {
            session_id: "00000000-0000-0000-0000-000000000001",
            lesson_id: "rewrite_text_001",
            current_step: options.resumeStep,
            use_case_id: "work_email",
            fill_in_values: {},
            attempt_count: 1,
            completed: false,
          }
        : null,
    }),
  );

  await page.route("**/api/lessons/*/survey/", async (route) => {
    handle.surveys.push(route.request().postDataJSON()?.answers ?? {});
    return route.fulfill({ status: 204, body: "" });
  });

  return handle;
}

function defaultRewrite(callCount: number, body: RewriteBody): string {
  if (body.instruction) {
    return `【${callCount}回目・改善】${body.instruction}を反映しました。短く整えた文章です。`;
  }
  if (body.step === "REAL_TASK") {
    return `【${callCount}回目・自分の文章】${body.audience}向けに${body.length}で整えました。`;
  }
  return `【${callCount}回目】${body.audience}向けに、${body.tone}、${body.length}にしました。`;
}
