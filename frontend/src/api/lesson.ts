/**
 * レッスン本体の API クライアント。
 *
 * - AbortController で中断可能にする（画面離脱時）
 * - 二重送信の防止は呼び出し側（useLesson）が担当する
 * - 失敗は例外として投げる。AIの出力そのものが目的なので固定文で代替できない
 */

import { apiBaseUrl } from "./config";

export class LessonApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LessonApiError";
  }
}

export interface RewriteTextRequest {
  originalText: string;
  audience: string;
  tone: string;
  length: string;
  instruction?: string;
  step?: string;
}

async function request<T>(
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<T> {
  const url = `${apiBaseUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "include", // learner_key Cookie を送る
      signal,
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    // サーバー未起動・CORS 拒否はここに落ちる。画面には出ない原因なので必ず記録する。
    console.error(`APIに届きませんでした: ${url}`, error);
    throw new LessonApiError(
      "うまく届かなかったようです。もう一度おくってみましょう。",
      0,
    );
  }

  if (!response.ok) {
    let detail = "うまく届かなかったようです。もう一度おくってみましょう。";
    try {
      const body = await response.json();
      detail = body?.errors?.detail?.[0] ?? detail;
    } catch {
      // JSON でない応答はそのまま既定文言にする
    }
    throw new LessonApiError(detail, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function rewriteText(
  input: RewriteTextRequest,
  signal?: AbortSignal,
): Promise<string> {
  const body = await request<{ rewritten_text: string }>(
    "/api/lessons/rewrite-text/generate/",
    {
      method: "POST",
      body: JSON.stringify({
        original_text: input.originalText,
        audience: input.audience,
        tone: input.tone,
        length: input.length,
        instruction: input.instruction ?? "",
        step: input.step ?? "FIRST_INPUT",
      }),
    },
    signal,
  );
  return body.rewritten_text;
}

export interface LearningEventInput {
  lessonId: string;
  eventType: string;
  step?: string;
  inputLength?: number;
  hintCount?: number;
  retryCount?: number;
  completed?: boolean;
  durationMs?: number;
}

/**
 * 操作ログを送る。
 *
 * 送信に失敗してもレッスンを止めない（AIPPO 開発概要 §17）。
 * そのため例外を投げず、成否を boolean で返す。
 *
 * 本文は送らない。文字数のみ（設計判断 Q-2）。
 */
export async function sendLearningEvent(
  input: LearningEventInput,
): Promise<boolean> {
  try {
    await request<void>("/api/learning-events/", {
      method: "POST",
      body: JSON.stringify({
        lesson_id: input.lessonId,
        event_type: input.eventType,
        step: input.step ?? "",
        input_length: input.inputLength ?? 0,
        hint_count: input.hintCount ?? 0,
        retry_count: input.retryCount ?? 0,
        completed: input.completed ?? false,
        duration_ms: input.durationMs ?? null,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

export interface SessionState {
  session_id: string;
  lesson_id: string;
  current_step: string;
  use_case_id: string;
  fill_in_values: Record<string, string>;
  attempt_count: number;
  completed: boolean;
}

/** 再訪時の到達ステップ。取得できなければ null。 */
export async function fetchSessionState(
  lessonId: string,
): Promise<SessionState | null> {
  try {
    const body = await request<{ session: SessionState | null }>(
      `/api/lessons/${lessonId}/session/`,
      { method: "GET" },
    );
    return body.session;
  } catch {
    return null;
  }
}

/** アンケートを送る。失敗してもレッスンを止めない。 */
export async function sendSurvey(
  lessonId: string,
  answers: Record<string, string>,
): Promise<boolean> {
  try {
    await request<void>(`/api/lessons/${lessonId}/survey/`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    });
    return true;
  } catch {
    return false;
  }
}
