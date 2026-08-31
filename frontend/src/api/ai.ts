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
import { writeHeaders } from "./http";
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
  /**
   * この操作の名前。**同じ操作の送り直しは、同じ id で送る。**
   *
   * 連打、通信が切れたあとの再送、戻ってからの送り直し——どれも
   * 「もう1回作ってほしい」ではないので、無料枠を二度減らさない。
   * サーバーは同じ id を見たら、押さえ直さずに前の結果を返す。
   *
   * 逆に、**自分でもう一度押したときは新しい id** にする。
   * そこは本当に「もう1回作る」なので、1回ぶん減ってよい。
   */
  requestId?: string;
  /** 将来のモデル比較コース用。通常の教材では指定しない。 */
  provider?: string;
  model?: string;
}

export class AiRequestError extends Error {
  /** 学習者へ見せる文。専門用語を含めない。 */
  readonly detail: string;
  /** 上限に達したのか、通信が落ちたのか。画面の出し分けに使う。 */
  readonly kind: "limit" | "duplicate" | "failed" | "out_of_credits";

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
      headers: await writeHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        session_id: params.sessionId ?? null,
        lesson_id: params.lessonId,
        step_id: params.stepId,
        action: params.action,
        input: params.input,
        request_id: params.requestId ?? null,
        provider: params.provider ?? "",
        model: params.model ?? "",
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      if (response.status === 429 || response.status === 503) {
        /*
          この2つの番号には、次にすることが違う3つが乗っている。
          見分けはサーバーの `code` でする。文言で分けると、
          文言を直した日に画面の出し分けが黙って壊れる。

            FREE_CREDITS_EXHAUSTED … 自分の持ち分を使い切った。
              押し直しても直らないので、「また明日」と「いま登録する」
            AI_SERVICE_NOT_CONFIGURED … AI 側が止まっている。
              **これは上限ではない。** 直ればまた使えるので「もう一度」
            印なし … 全体が混み合っている。時間をおけば直る

          真ん中を見落としていた。503 をまとめて「上限」にしていたので、
          鍵が入っていない日や AI が落ちた日に、**何もしていない人へ
          「今日の練習はここまで！」と出していた**——その人はまだ
          1回も使えていない。実際に E2E の画面写しで見つかった。
        */
        const code = (payload as { code?: string } | null)?.code;
        if (code === "FREE_CREDITS_EXHAUSTED") {
          throw new AiRequestError(detailOf(payload), "out_of_credits");
        }
        if (code === "AI_SERVICE_NOT_CONFIGURED") {
          throw new AiRequestError(detailOf(payload), "failed");
        }
        throw new AiRequestError(detailOf(payload), "limit");
      }
      if (response.status === 409) {
        throw new AiRequestError(detailOf(payload), "duplicate");
      }
      throw new AiRequestError(detailOf(payload), "failed");
    }

    try {
      return (await response.json()) as AiGenerateResult;
    } catch {
      // 200 なのに JSON でない（経路の設定違いなど）。
      // 生の SyntaxError は画面の再実行の道を素通りする
      throw new AiRequestError(FALLBACK_DETAIL, "failed");
    }
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
