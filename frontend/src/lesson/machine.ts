/**
 * レッスン進行の状態と遷移表（data-model.md §1）。
 *
 * 進行を所有するのはこの状態機械であり、AI ではない（憲章 原則 III）。
 * 遷移表に無い遷移は無視して現在の状態を維持する（FR-002）。
 */

import type { TutorMessage } from "../types/tutor";

export const LESSON_STEPS = [
  "INTRO",
  "SELECT_USE_CASE",
  "FIRST_INPUT",
  "GENERATING",
  "REVIEW_RESULT",
  "IMPROVE_INPUT",
  "REAL_TASK",
  "REFLECTION",
  "COMPLETE",
] as const;

export type LessonStep = (typeof LESSON_STEPS)[number];

/** GENERATING から戻れる状態。 */
export type SubmittableStep = Extract<
  LessonStep,
  "FIRST_INPUT" | "IMPROVE_INPUT" | "REAL_TASK"
>;

export const SUBMITTABLE_STEPS: readonly SubmittableStep[] = [
  "FIRST_INPUT",
  "IMPROVE_INPUT",
  "REAL_TASK",
];

export type LessonEvent =
  | "START"
  | "SELECT_CASE"
  | "SUBMIT"
  | "RUN_SUCCEEDED"
  | "RUN_FAILED"
  | "CANCEL"
  | "NEXT"
  | "BACK"
  | "COMPLETE";

/**
 * 許可された遷移。
 * GENERATING からの復帰先は returnTo で決まるため、ここでは null を置く。
 */
export const TRANSITIONS: Record<
  LessonStep,
  Partial<Record<LessonEvent, LessonStep | null>>
> = {
  INTRO: { START: "SELECT_USE_CASE" },
  SELECT_USE_CASE: { SELECT_CASE: "FIRST_INPUT" },
  FIRST_INPUT: { SUBMIT: "GENERATING", BACK: "SELECT_USE_CASE" },
  GENERATING: {
    RUN_SUCCEEDED: "REVIEW_RESULT",
    RUN_FAILED: null,
    CANCEL: null,
  },
  REVIEW_RESULT: { NEXT: "IMPROVE_INPUT", BACK: "FIRST_INPUT" },
  IMPROVE_INPUT: { SUBMIT: "GENERATING", NEXT: "REAL_TASK" },
  REAL_TASK: { SUBMIT: "GENERATING", NEXT: "REFLECTION" },
  REFLECTION: { COMPLETE: "COMPLETE", BACK: "REAL_TASK" },
  COMPLETE: {},
};

export function canTransition(step: LessonStep, event: LessonEvent): boolean {
  return event in TRANSITIONS[step];
}

/**
 * 次の状態を返す。遷移できない場合は現在の状態をそのまま返す。
 * GENERATING からの RUN_FAILED / CANCEL は returnTo へ戻す。
 */
export function nextStep(
  step: LessonStep,
  event: LessonEvent,
  returnTo: SubmittableStep,
): LessonStep {
  if (!canTransition(step, event)) return step;

  // 実行が成功したときの行き先は、どこから送ったかで変わる。
  // 例文での実行は結果を確認する画面へ、自分の文章での実行は
  // その場で結果を見せて振り返りへ進ませる（AIPPO 開発概要 §10 Step 7-8）。
  if (step === "GENERATING" && event === "RUN_SUCCEEDED") {
    return returnTo === "REAL_TASK" ? "REAL_TASK" : "REVIEW_RESULT";
  }

  return TRANSITIONS[step][event] ?? returnTo;
}

/** 各状態でユーザーが次に取る行動は常に1つだけ（憲章 原則 I）。 */
export const PRIMARY_ACTION: Record<LessonStep, string> = {
  INTRO: "はじめる",
  SELECT_USE_CASE: "どの文章を分かりやすくするか選ぶ",
  FIRST_INPUT: "AIに送る",
  GENERATING: "待つ",
  REVIEW_RESULT: "次へ",
  IMPROVE_INPUT: "直したいところを選ぶ",
  REAL_TASK: "自分の文章で試す",
  REFLECTION: "完了する",
  COMPLETE: "結果をコピーする",
};

/** ポーの初回メッセージ（AIPPO 開発概要 §6）。 */
export const DEFAULT_POE: TutorMessage = {
  message:
    "はじめまして、ポーです。何から始めればいいか分からなくても大丈夫です。" +
    "まずは、あなたに合いそうな使い方を一緒に見つけましょう。",
  emotion: "neutral",
  action: "wait",
};

/** 診断中のポー。1問ずつ聞くので question 状態。 */
export const DIAGNOSIS_POE: TutorMessage = {
  message: "ひとつずつ聞きますね。近いものを選んでください。",
  emotion: "question",
  action: "wait",
};

/** 診断が終わり、用途を提案するとき。 */
export const DIAGNOSIS_COMPLETE_POE: TutorMessage = {
  message:
    "ありがとうございます。まずは一つだけ、実際に試してみましょう。",
  emotion: "hint",
  action: "next",
};

export const THINKING_POE: TutorMessage = {
  message: "入力した内容を確認しています。",
  emotion: "thinking",
  action: "wait",
};

export const COMPLETE_POE: TutorMessage = {
  message:
    "AIに「文章を直して」と頼むだけでなく、相手や長さを伝えられるようになりました。",
  emotion: "celebrate",
  action: "complete",
};
