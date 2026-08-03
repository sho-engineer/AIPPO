/**
 * レッスン進行の reducer（useReducer 本体）。
 *
 * - 遷移は machine.ts の遷移表に基づいてのみ行う
 * - 不正な遷移は現在の状態を維持する
 * - 前のステップへ戻っても入力内容は保持する
 * - AI の応答は状態を進めない。表示するポーの発言だけを差し替える（憲章 原則 III）
 */

import {
  DEFAULT_POE,
  SUBMITTABLE_STEPS,
  THINKING_POE,
  type LessonEvent,
  type LessonStep,
  type SubmittableStep,
  nextStep,
} from "./machine";
import type { TutorMessage } from "../types/tutor";

export interface AiRunResult {
  sequence: number;
  /** どのステップから実行したか。自分の文章での実行を見分けるのに使う。 */
  fromStep: LessonStep;
  /** 何をした回か（「1回目」「もっと短く」「自分の文章」）。比較表示の見出しに使う。 */
  label: string;
  inputText: string;
  outputText: string;
}

export interface LessonState {
  step: LessonStep;
  returnTo: SubmittableStep;
  useCaseId: string | null;
  /** いま書き換えの対象にしている文章。用途選択で例文が入り、編集もできる。 */
  sourceText: string;
  fillInValues: Record<string, string>;
  realTaskText: string;
  improvementId: string | null;
  runs: AiRunResult[];
  attemptCount: number;
  tutor: TutorMessage;
  isSubmitting: boolean;
  /**
   * 書きかけの文章。AIが書いている途中だけ中身が入る。
   *
   * 待ち時間はほぼすべてAIの応答待ちなので、書けたところから見せる。
   * 書き終わったら `runs` へ移して、ここは空に戻す。
   */
  streamingText: string;
  error: string | null;
}

export type LessonAction =
  | { type: "START" }
  | { type: "SELECT_CASE"; useCaseId: string; sampleText: string }
  | { type: "SET_SOURCE_TEXT"; text: string }
  | { type: "SET_FILL_IN"; key: string; value: string }
  | { type: "SET_REAL_TASK"; text: string }
  | { type: "SELECT_IMPROVEMENT"; improvementId: string }
  | { type: "SUBMIT" }
  | { type: "STREAM_CHUNK"; textSoFar: string }
  | {
      type: "RUN_SUCCEEDED";
      label: string;
      fromStep: LessonStep;
      inputText: string;
      outputText: string;
    }
  | { type: "RUN_FAILED"; message: string }
  | { type: "CANCEL" }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "COMPLETE" }
  | { type: "SET_TUTOR"; tutor: TutorMessage }
  | { type: "RESUME"; step: LessonStep }
  | { type: "RESTART" };

export const initialLessonState: LessonState = {
  step: "INTRO",
  returnTo: "FIRST_INPUT",
  useCaseId: null,
  sourceText: "",
  fillInValues: {},
  realTaskText: "",
  improvementId: null,
  runs: [],
  attemptCount: 0,
  tutor: DEFAULT_POE,
  isSubmitting: false,
  streamingText: "",
  error: null,
};

const isSubmittable = (step: LessonStep): step is SubmittableStep =>
  (SUBMITTABLE_STEPS as readonly LessonStep[]).includes(step);

/** 遷移イベントを伴うアクションのみ、遷移表を引く。 */
const TRANSITION_EVENTS: Partial<Record<LessonAction["type"], LessonEvent>> = {
  START: "START",
  SELECT_CASE: "SELECT_CASE",
  SUBMIT: "SUBMIT",
  RUN_SUCCEEDED: "RUN_SUCCEEDED",
  RUN_FAILED: "RUN_FAILED",
  CANCEL: "CANCEL",
  NEXT: "NEXT",
  BACK: "BACK",
  COMPLETE: "COMPLETE",
};

export function lessonReducer(
  state: LessonState,
  action: LessonAction,
): LessonState {
  // --- 遷移を伴わない、入力の保持のみのアクション ---
  switch (action.type) {
    case "SET_SOURCE_TEXT":
      return { ...state, sourceText: action.text };
    case "SET_FILL_IN":
      return {
        ...state,
        fillInValues: { ...state.fillInValues, [action.key]: action.value },
      };
    case "SET_REAL_TASK":
      return { ...state, realTaskText: action.text };
    case "SELECT_IMPROVEMENT":
      return { ...state, improvementId: action.improvementId };
    case "SET_TUTOR":
      return { ...state, tutor: action.tutor };
    case "RESTART":
      // はじめから試し直す。前回の入力も結果も残さない。
      // 遷移表は通さない。COMPLETE からの「戻り」ではなく、やり直しなので。
      return initialLessonState;
    case "STREAM_CHUNK":
      // 書きかけを見せるだけ。進行は動かさない（憲章 原則 III）。
      // 実行中でないときに届いたものは、追い越された古い実行なので捨てる。
      if (!state.isSubmitting) return state;
      return { ...state, streamingText: action.textSoFar };
    case "RESUME":
      return {
        ...state,
        step: action.step,
        returnTo: isSubmittable(action.step) ? action.step : state.returnTo,
      };
    default:
      break;
  }

  const event = TRANSITION_EVENTS[action.type];
  if (event === undefined) return state;

  const target = nextStep(state.step, event, state.returnTo);
  // 遷移が拒否された場合は、状態を一切変更しない
  if (target === state.step && event !== "RUN_FAILED" && event !== "CANCEL") {
    return state;
  }

  switch (action.type) {
    case "SELECT_CASE":
      return {
        ...state,
        step: target,
        useCaseId: action.useCaseId,
        sourceText: action.sampleText,
      };

    case "SUBMIT":
      if (state.isSubmitting) return state; // 二重送信を防ぐ
      return {
        ...state,
        step: target,
        returnTo: isSubmittable(state.step) ? state.step : state.returnTo,
        attemptCount: state.attemptCount + 1,
        isSubmitting: true,
        // 前回の書きかけを残すと、今回の結果と見分けがつかない
        streamingText: "",
        error: null,
        tutor: THINKING_POE,
      };

    case "RUN_SUCCEEDED":
      return {
        ...state,
        step: target,
        isSubmitting: false,
        // 書き終わったので、書きかけの表示は畳む
        streamingText: "",
        error: null,
        runs: [
          ...state.runs,
          {
            sequence: state.runs.length + 1,
            label: action.label,
            fromStep: action.fromStep,
            inputText: action.inputText,
            outputText: action.outputText,
          },
        ],
      };

    case "RUN_FAILED":
      return {
        ...state,
        step: target, // returnTo（入力内容は保持されたまま）
        isSubmitting: false,
        // 途中で切れた文章を結果として残さない
        streamingText: "",
        error: action.message,
      };

    case "CANCEL":
      return { ...state, step: target, isSubmitting: false, error: null };

    default:
      return { ...state, step: target };
  }
}

/** 自分の文章での実行が済んでいるか（§10 Step 7）。 */
export function hasRealTaskRun(state: LessonState): boolean {
  return state.runs.some((run) => run.fromStep === "REAL_TASK");
}

/** いまAIへ渡す対象の文章。REAL_TASK 以降は自分の文章を使う。 */
export function currentSourceText(state: LessonState): string {
  if (state.step === "REAL_TASK" || state.realTaskText) {
    return state.realTaskText || state.sourceText;
  }
  return state.sourceText;
}
