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
