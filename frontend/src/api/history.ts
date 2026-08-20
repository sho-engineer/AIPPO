/**
 * 学習の記録と、作ったもの。
 *
 * 作った文章はサーバーに残っている。ここはその読み口。
 * 貼った本文はサーバーが返さないので、こちらにも来ない。
 */

import { getJson } from "./http";

export interface Artifact {
  id: string;
  lesson_id: string;
  session_id: string;
  /** 何を頼んだか（rewrite / summarize / …）。 */
  action: string;
  step: string;
  /** AI が作ったもの。 */
  output: string;
  /** 長すぎて末尾を落としたか。 */
  truncated: boolean;
  /** そのとき指定した条件。なぜその結果になったかが分かる。 */
  conditions: Record<string, string>;
  created_at: string;
}

export interface HistorySession {
  id: string;
  lesson_id: string;
  completed: boolean;
  current_step: string;
  attempt_count: number;
  started_at: string;
  updated_at: string;
}

/** 今日あと何回AIを使えるか。上限を外しているときは null。 */
export interface AiQuota {
  limit: number | null;
  used: number;
  remaining: number | null;
}

export interface History {
  artifacts: Artifact[];
  sessions: HistorySession[];
  ai_quota: AiQuota;
}

export function fetchHistory(signal?: AbortSignal): Promise<History> {
  return getJson("/api/lessons/history/", signal);
}

// ------------------------------------------------------------------ 復習

export interface ReviewItem {
  lesson_id: string;
  /** その教材を何回終えたか。回を重ねるほど次は先になる。 */
  times_done: number;
  last_done_at: string;
  due_at: string;
  /** いま見返しどきか。 */
  due: boolean;
  /** あと何日待つか。過ぎているものは 0。 */
  days_until_due: number;
}

export interface Review {
  items: ReviewItem[];
  due_count: number;
}

/**
 * 見返しどきの教材。
 *
 * 点数は返ってこない。相手はAIに不安がある初心者なので、
 * 測って点を付けるより、もう一度手を動かしてもらうほうが定着する。
 */
export function fetchReview(signal?: AbortSignal): Promise<Review> {
  return getJson("/api/lessons/review/", signal);
}
