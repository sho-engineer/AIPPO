/**
 * レッスン本体の API クライアント。
 *
 * - AbortController で中断可能にする（画面離脱時）
 * - 二重送信の防止は呼び出し側（useLesson）が担当する
 * - 失敗は例外として投げる。AIの出力そのものが目的なので固定文で代替できない
 */

import { apiBaseUrl } from "./config";
import { writeHeaders } from "./http";

/** 画面に出す既定の文言。専門用語を出さない（憲章 原則 I）。 */
export const GENERIC_ERROR = "うまく届かなかったようです。もう一度おくってみましょう。";

export class LessonApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LessonApiError";
  }
}

/**
 * 流し込みが使えない環境であることを表す。
 *
 * これは学習者の失敗ではないので、画面には出さず、
 * 呼び出し側が通常の生成へ黙って倒す。
 */
export class StreamUnsupportedError extends Error {
  constructor() {
    super("streaming is not available");
    this.name = "StreamUnsupportedError";
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
  // 読み取りには合言葉が要らない。GET のたびに取りに行かない
  const isWrite = (init.method ?? "GET").toUpperCase() !== "GET";
  const base = isWrite
    ? await writeHeaders()
    : { "Content-Type": "application/json" };

  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "include", // learner_key Cookie を送る
      signal,
      ...init,
      headers: { ...base, ...init.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    // サーバー未起動・CORS 拒否はここに落ちる。画面には出ない原因なので必ず記録する。
    console.error(`APIに届きませんでした: ${url}`, error);
    throw new LessonApiError(GENERIC_ERROR, 0);
  }

  if (!response.ok) {
    let detail = GENERIC_ERROR;
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

/**
 * 書けたところから受け取りながら文章を書き直す。
 *
 * 待ち時間はほぼすべてAIの応答待ちなので、途中から見せると体感が変わる。
 * この経路が使えないとき（古い環境、途中で溜め込むプロキシ、
 * ストリーミング非対応のAI）は、呼び出し側が `rewriteText()` へ倒す。
 *
 * @param onChunk 断片が届くたびに、そこまでの全文で呼ばれる
 * @returns 書き終わった全文
 */
export async function rewriteTextStreaming(
  input: RewriteTextRequest,
  onChunk: (textSoFar: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const url = `${apiBaseUrl()}/api/lessons/rewrite-text/stream/`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      credentials: "include",
      signal,
      headers: await writeHeaders({ Accept: "text/event-stream" }),
      body: JSON.stringify({
        original_text: input.originalText,
        audience: input.audience,
        tone: input.tone,
        length: input.length,
        instruction: input.instruction ?? "",
        step: input.step ?? "FIRST_INPUT",
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    console.error(`APIに届きませんでした: ${url}`, error);
    throw new LessonApiError(GENERIC_ERROR, 0);
  }

  // この経路そのものが無い／使えない場合は、通常の生成へ倒す合図を出す。
  // 400・429・503 は「断られた」であって使えないわけではないので、ここには来ない。
  const isEventStream = (response.headers.get("Content-Type") ?? "").includes(
    "text/event-stream",
  );
  if (!response.body || !isEventStream) {
    throw new StreamUnsupportedError();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finished = false;

  // 断り（400 / 429 / 503）も同じ形式で流れてくる。
  // ここでは本文と同じ読み方をして、error イベントを見て投げ分ける。
  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // 1件は空行で区切られる。最後の欠けた分は次回へ持ち越す。
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const parsed = parseEvent(block);
      if (!parsed) continue;

      if (parsed.name === "chunk" && typeof parsed.data.text === "string") {
        text += parsed.data.text;
        onChunk(text);
      } else if (parsed.name === "done") {
        if (typeof parsed.data.text === "string") text = parsed.data.text;
        finished = true;
      } else if (parsed.name === "error") {
        const message =
          typeof parsed.data.message === "string" ? parsed.data.message : GENERIC_ERROR;
        throw new LessonApiError(message, response.status);
      }
    }
  }

  if (!finished || !text.trim()) {
    // 書き終わりの合図が来ないまま切れた。中途半端な文章は結果にしない。
    if (text.length === 0) {
      // 一文字も届かなかった。途中で溜め込むプロキシの疑いがあるので、
      // 通常の生成へ倒す。まだ何も実行されていないので、やり直しても損はない。
      throw new StreamUnsupportedError();
    }
    // 途中までは届いていた。ここでやり直すとAIをもう一度呼ぶことになり、
    // 学習者の実行回数と利用料を二重に使ってしまうので、倒さずに失敗を伝える。
    throw new LessonApiError(GENERIC_ERROR, response.status);
  }
  return text;
}

function parseEvent(block: string): { name: string; data: Record<string, unknown> } | null {
  let name = "";
  let raw = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) name = line.slice(7);
    else if (line.startsWith("data: ")) raw = line.slice(6);
  }
  if (!name) return null;

  try {
    return { name, data: raw ? JSON.parse(raw) : {} };
  } catch {
    return null;
  }
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
  /**
   * 画面が閉じられても送り切る。
   *
   * 離脱の記録はまさに画面が消える瞬間に送るので、
   * これが無いと途中で打ち切られて届かない。
   */
  keepalive?: boolean;
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
      keepalive: input.keepalive ?? false,
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

/**
 * アンケートを送る。失敗してもレッスンを止めない。
 *
 * ここまで来た人はレッスンを終えている。送れなかったことを
 * 失敗として見せる意味がないので、例外を投げず成否だけ返す。
 *
 * 答えは選択肢の文字だけ。自由記述は受け取らない
 * （集計できないうえ、個人情報の入り込む口になる）。
 */
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
