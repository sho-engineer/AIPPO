/**
 * 取っておいた成果物。
 *
 * 「作ったもの」（`api/history.ts`）との違い
 * ------------------------------------------
 *     作ったもの      … 自動。AIを動かすたびにたまる。いずれ消える
 *     取っておいたもの … 手動。名前が付く。消えない
 *
 * 同じものを取っておこうとしたときは、失敗ではなく `already_saved`
 * が立って返る。押し直しただけの人に赤い字を出さない。
 *
 * 取っておけるのは登録した人だけ。ゲストには 403 が返り、
 * `errors.requires_account` が入る（目印・修了証と同じ線）。
 */

import { getJson, sendJson, ApiError } from "./http";

export interface SavedArtifact {
  id: string;
  lesson_id: string;
  title: string;
  output: string;
  conditions: Record<string, string>;
  /** 使ったAI技の slug。図鑑から辿るため */
  skills: string[];
  created_at: string;
}

export interface SavedArtifactList {
  items: SavedArtifact[];
  /** ゲストのとき true。空と、使えないは別のこと */
  requires_account?: boolean;
}

export interface SaveResult {
  artifact: SavedArtifact;
  already_saved: boolean;
}

const BASE = "/api/lessons/saved";

export function fetchSavedArtifacts(
  signal?: AbortSignal,
): Promise<SavedArtifactList> {
  return getJson<SavedArtifactList>(`${BASE}/`, signal);
}

export function saveArtifact(input: {
  lessonId: string;
  output: string;
  conditions?: Record<string, string>;
  title?: string;
}): Promise<SaveResult> {
  return sendJson<SaveResult>(`${BASE}/`, {
    lesson_id: input.lessonId,
    output: input.output,
    conditions: input.conditions ?? {},
    ...(input.title ? { title: input.title } : {}),
  });
}

export function renameArtifact(
  id: string,
  title: string,
): Promise<{ artifact: SavedArtifact }> {
  return sendJson<{ artifact: SavedArtifact }>(`${BASE}/${id}/`, { title }, "PATCH");
}

export async function discardArtifact(id: string): Promise<void> {
  await sendJson<unknown>(`${BASE}/${id}/`, {}, "DELETE");
}

/** 登録が要るという断り方か。画面は登録のお誘いに切り替える。 */
export function needsAccount(error: unknown): boolean {
  return error instanceof ApiError && Boolean(error.fieldErrors.requires_account);
}
