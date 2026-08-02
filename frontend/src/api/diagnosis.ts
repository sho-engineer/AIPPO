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
