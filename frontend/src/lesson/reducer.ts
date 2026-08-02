/**
 * レッスン進行の reducer（useReducer 本体）。
 *
 * - 遷移は machine.ts の遷移表に基づいてのみ行う
 * - 不正な遷移は現在の状態を維持する（FR-002）
 * - 前のステップへ戻っても入力内容は保持する（FR-004）
 * - AI の応答は状態を進めない。表示するチューターの発言だけを差し替える（憲章 原則 III）
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
  inputText: string;
  outputText: string;
}

export interface LessonState {
  step: LessonStep;
  returnTo: SubmittableStep;
  useCaseId: string | null;
  fillInValues: Record<string, string>;
  realTaskText: string;
  improvementId: string | null;
  runs: AiRunResult[];
  attemptCount: number;
  tutor: TutorMessage;
  isSubmitting: boolean;
  error: string | null;
}

export type LessonAction =
  | { type: "START" }
  | { type: "SELECT_CASE"; useCaseId: string }
  | { type: "SET_FILL_IN"; key: string; value: string }
  | { type: "SET_REAL_TASK"; text: string }
  | { type: "SELECT_IMPROVEMENT"; improvementId: string }
  | { type: "SUBMIT" }
  | { type: "RUN_SUCCEEDED"; inputText: string; outputText: string }
  | { type: "RUN_FAILED"; message: string }
  | { type: "CANCEL" }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "COMPLETE" }
  | { type: "SET_TUTOR"; tutor: TutorMessage }
  | { type: "RESUME"; step: LessonStep };

export const initialLessonState: LessonState = {
  step: "INTRO",
  returnTo: "FIRST_INPUT",
  useCaseId: null,
  fillInValues: {},
  realTaskText: "",
  improvementId: null,
  runs: [],
  attemptCount: 0,
  tutor: DEFAULT_POE,
  isSubmitting: false,
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
      return { ...state, step: target, useCaseId: action.useCaseId };

    case "SUBMIT":
      if (state.isSubmitting) return state; // 二重送信を防ぐ（FR-019）
      return {
        ...state,
        step: target,
        returnTo: isSubmittable(state.step) ? state.step : state.returnTo,
        attemptCount: state.attemptCount + 1,
        isSubmitting: true,
        error: null,
        tutor: THINKING_POE,
      };

    case "RUN_SUCCEEDED":
      return {
        ...state,
        step: target,
        isSubmitting: false,
        error: null,
        runs: [
          ...state.runs,
          {
            sequence: state.runs.length + 1,
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
        error: action.message,
      };

    case "CANCEL":
      return { ...state, step: target, isSubmitting: false, error: null };

    default:
      return { ...state, step: target };
  }
}
