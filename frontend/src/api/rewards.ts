/**
 * 学習パス・スタンプ・Credit。
 *
 * 特典の判定はすべてサーバー側で行う。画面からは「受け取る」としか
 * 言えず、金額も節目も指定できない（設計方針 §36）。ここに金額を
 * 送る関数を足さないこと。
 */

import { getJson, sendJson } from "./http";

export interface CreditTransaction {
  type: string;
  amount: number;
  reason: string;
  balance_after: number;
  created_at: string;
}

export interface CreditState {
  /** 登録していない人。残高そのものを持たない */
  requires_account: boolean;
  /** ゲストのときは null。0 とは意味が違う（使い切ったのではない） */
  balance: number | null;
  lifetime_earned: number | null;
  lifetime_spent: number | null;
  transactions: CreditTransaction[];
}

export interface PathStampState {
  path_id: string;
  title: string;
  done: number;
  total: number;
  stamps: { id: number; title: string; stamp_type: string; earned: boolean }[];
  milestones: {
    required_stamp_count: number;
    reward_credits: number;
    badge_name: string;
    reached: boolean;
    claimed: boolean;
  }[];
}

export interface StampState {
  paths: PathStampState[];
  signed_in: boolean;
  /** 届いているのに受け取れていない特典があるか */
  unclaimed_waiting: boolean;
}

export interface LearningPathLesson {
  lesson_id: string;
  title: string;
  order: number;
  day_number: number | null;
  is_required: boolean;
}

export interface LearningPathRecipe {
  id: string;
  title: string;
  description: string;
  access_type: string;
}

export interface LearningPathSummary {
  id: string;
  title: string;
  description: string;
  short_description: string;
  category: string;
  difficulty: string;
  access_type: string;
  availability: string;
  badge_name: string;
  estimated_total_minutes: number | null;
  lessons: LearningPathLesson[];
  recipes: LearningPathRecipe[];
  stamp_done: number;
  stamp_total: number;
  next_milestone: {
    required_stamp_count: number;
    reward_credits: number;
  } | null;
}

export function fetchCredits(signal?: AbortSignal): Promise<CreditState> {
  return getJson<CreditState>("/api/v1/rewards/credits/", signal);
}

export function fetchStamps(signal?: AbortSignal): Promise<StampState> {
  return getJson<StampState>("/api/v1/rewards/stamps/", signal);
}

export function fetchLearningPaths(
  signal?: AbortSignal,
): Promise<{ paths: LearningPathSummary[] }> {
  return getJson<{ paths: LearningPathSummary[] }>(
    "/api/v1/rewards/paths/",
    signal,
  );
}

/**
 * 届いている特典を受け取る。
 *
 * **金額は送らない。** どの節目に届いたかはサーバーが数える。
 * 二重に押しても、サーバー側の記録が2回目を弾く。
 */
export function claimRewards(): Promise<{ granted: number; balance: number }> {
  return sendJson<{ granted: number; balance: number }>(
    "/api/v1/rewards/claim/",
    {},
  );
}
