/**
 * 教材から AI を呼ぶ、唯一の入口。
 *
 * プロバイダもモデルも、ここには書かない。決めるのはサーバー。
 * 画面が知ってよいのは「何を頼むか（action）」だけ。
 *
 * タイムアウトは 20 秒。過ぎたら止めて、入力を残したまま
 * 再実行させる（要件 §6.8）。待たせ続けるより早く伝えるほうがよい。
 */

import { apiBaseUrl } from "./config";
import type { PoAction, PoEmotion, StepValues } from "../course/types";

/** 要件 §3 の AI_REQUEST_TIMEOUT_SECONDS に合わせる。 */
export const AI_TIMEOUT_MS = 20_000;

export interface AiUsage {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
}

export interface AiGenerateResult {
  result: string;
  tutor: { message: string; emotion: PoEmotion; action: PoAction };
  usage: AiUsage;
  extras: Record<string, unknown>;
}

export interface AiGenerateParams {
  sessionId?: string | null;
  lessonId: string;
  stepId: string;
  action: string;
  input: StepValues;
  /** 将来のモデル比較コース用。通常の教材では指定しない。 */
  provider?: string;
  model?: string;
}

export class AiRequestError extends Error {
  /** 学習者へ見せる文。専門用語を含めない。 */
  readonly detail: string;
  /** 上限に達したのか、通信が落ちたのか。画面の出し分けに使う。 */
  readonly kind: "limit" | "duplicate" | "failed";

  constructor(detail: string, kind: AiRequestError["kind"]) {
    super(detail);
    this.name = "AiRequestError";
    this.detail = detail;
    this.kind = kind;
  }
}

const FALLBACK_DETAIL = "うまく届かなかったようです。もう一度おくってみましょう。";

function detailOf(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) return FALLBACK_DETAIL;
  const errors = (payload as { errors?: Record<string, string[]> }).errors;
  if (!errors) return FALLBACK_DETAIL;

  const first = Object.values(errors)[0];
  return Array.isArray(first) && typeof first[0] === "string"
    ? first[0]
    : FALLBACK_DETAIL;
}

export async function generate(
  params: AiGenerateParams,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  // 呼び出し側から中断されることもあるので、両方の合図をまとめる
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  signal?.addEventListener("abort", () => controller.abort());

  try {
    const response = await fetch(`${apiBaseUrl()}/api/v1/ai/generate/`, {
      method: "POST",
      credentials: "include", // learner_key Cookie を送る
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        session_id: params.sessionId ?? null,
        lesson_id: params.lessonId,
        step_id: params.stepId,
        action: params.action,
        input: params.input,
        provider: params.provider ?? "",
        model: params.model ?? "",
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      if (response.status === 429 || response.status === 503) {
        throw new AiRequestError(detailOf(payload), "limit");
      }
      if (response.status === 409) {
        throw new AiRequestError(detailOf(payload), "duplicate");
      }
      throw new AiRequestError(detailOf(payload), "failed");
    }

    return (await response.json()) as AiGenerateResult;
  } catch (error) {
    if (error instanceof AiRequestError) throw error;
    // 通信できなかったことを黙って握りつぶさない。
    // ブラウザ側は CORS 設定の漏れでも何も言わずに失敗する。
    console.error("AIに届きませんでした", error);
    throw new AiRequestError(FALLBACK_DETAIL, "failed");
  } finally {
    window.clearTimeout(timer);
  }
}
