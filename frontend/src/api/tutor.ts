/**
 * チューターのフィードバック API クライアント。
 *
 * - AbortController で中断可能にする（FR-020）
 * - 失敗しても例外を投げず、固定ヒントへ倒す（FR-013）
 */

import type { TutorFeedback } from "../types/tutor";
import { FALLBACK_TUTOR_MESSAGE } from "../content/ui";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export interface TutorFeedbackRequest {
  lessonId: string;
  step: string;
  userInput: string;
  attemptCount: number;
}

const OFFLINE_FALLBACK: TutorFeedback = {
  message: FALLBACK_TUTOR_MESSAGE,
  emotion: "hint",
  action: "retry",
  hint_level: 1,
  completed: false,
};

export async function fetchTutorFeedback(
  request: TutorFeedbackRequest,
  signal?: AbortSignal,
): Promise<TutorFeedback> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/poe/feedback/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // learner_key Cookie を送る
      signal,
      body: JSON.stringify({
        lesson_id: request.lessonId,
        step: request.step,
        user_input: request.userInput,
        attempt_count: request.attemptCount,
      }),
    });

    if (!response.ok) {
      return OFFLINE_FALLBACK;
    }
    return (await response.json()) as TutorFeedback;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error; // 中断は呼び出し側で扱う
    }
    return OFFLINE_FALLBACK;
  }
}
