/**
 * 診断結果 → おすすめ用途のマッピング。
 *
 * 責務分担では「後から変えたい」ためバックエンド側に置く
 * （docs/aippo-mvp-design.md §4）。ただし Phase 1 は AI API も
 * バックエンドも使わず固定レスポンスで動かす段階なので、
 * ここでは同じ形の応答をローカルで返す。
 *
 * Phase 5 で `GET /api/recommendations/` への fetch に差し替える。
 * 呼び出し側（画面）はそのときも変更不要。
 */

import type { CompletedDiagnosisAnswers } from "../content/diagnosis";

import { apiBaseUrl } from "./config";
import { writeHeaders } from "./http";

export interface UseCaseRecommendation {
  lessonId: string;
  useCaseId: string;
  headline: string;
  description: string;
  /** MVP で実際に試せるレッスンかどうか。 */
  available: boolean;
}

/** MVP で唯一完成させるレッスン。 */
const REWRITE_TEXT: UseCaseRecommendation = {
  lessonId: "rewrite_text_001",
  useCaseId: "work_email",
  headline: "文章を分かりやすくしてもらう",
  description:
    "相手・言い方・長さを伝えると、AIの直し方が変わります。まずはここから。",
  available: true,
};

/** pain_point ごとの2件目以降。MVP では未実装のため available: false。 */
const UPCOMING: Record<string, UseCaseRecommendation[]> = {
  writing: [
    {
      lessonId: "reply_draft_002",
      useCaseId: "reply",
      headline: "返信の下書きを作ってもらう",
      description: "受け取ったメールから、返信の案を出してもらいます。",
      available: false,
    },
  ],
  summarizing: [
    {
      lessonId: "summarize_003",
      useCaseId: "summary",
      headline: "長い資料を要点だけにまとめてもらう",
      description: "何のために読むのかを伝えると、まとめ方が変わります。",
      available: false,
    },
  ],
  researching: [
    {
      lessonId: "research_004",
      useCaseId: "research",
      headline: "調べたいことを整理してもらう",
      description: "AIの答えをそのまま信じず、確かめ方も一緒に学びます。",
      available: false,
    },
  ],
  organizing: [
    {
      lessonId: "organize_005",
      useCaseId: "table",
      headline: "バラバラの情報を表にしてもらう",
      description: "何を並べたいのかを伝えると、表の形が決まります。",
      available: false,
    },
  ],
};

/**
 * 診断結果からおすすめ用途を返す。
 *
 * MVP では必ず「文章を分かりやすくしてもらう」を先頭に置く。
 * 唯一完成しているレッスンであり、ユーザーが次に取る行動を1つに絞るため
 * （憲章 原則 I）。
 */
export async function fetchRecommendations(
  answers: CompletedDiagnosisAnswers,
): Promise<UseCaseRecommendation[]> {
  const upcoming = UPCOMING[answers.pain_point] ?? [];
  return [REWRITE_TEXT, ...upcoming];
}

/**
 * 診断の回答を保存する。
 *
 * 実証実験で「どんな人が来て、どんな人が完走したか」を見るために要る。
 * 完了率だけでは、AIを使ったことがない人が離脱しているのか、
 * ふだん使う人が物足りなくて離脱しているのかを区別できない。
 *
 * 診断は本題ではないので、**結果を待たせない**。
 * 失敗しても学習者には何も見せず、そのまま先へ進める。
 */
export async function saveProfile(
  answers: CompletedDiagnosisAnswers,
): Promise<boolean> {
  try {
    const response = await fetch(`${apiBaseUrl()}/api/profile/`, {
      method: "POST",
      credentials: "include", // learner_key Cookie を送る
      headers: await writeHeaders(),
      body: JSON.stringify({
        ai_experience: answers.ai_experience,
        job_category: answers.job_category,
        pain_point: answers.pain_point,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
