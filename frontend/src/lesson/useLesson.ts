/**
 * reducer と API の結線（AIPPO 開発概要 §18 Phase 3-5）。
 *
 * 守っていること:
 * - 進行を決めるのは reducer だけ。AI の応答は表示を変えるだけ（憲章 原則 III）
 * - 実行中は再送信を受け付けない
 * - 画面を離れたら進行中の実行を中止する
 * - 操作ログの送信に失敗してもレッスンを止めない
 */

import { useCallback, useEffect, useRef, useReducer } from "react";

import {
  StreamUnsupportedError,
  fetchSessionState,
  rewriteText,
  rewriteTextStreaming,
  sendLearningEvent,
  sendSurvey,
} from "../api/lesson";
import { fetchTutorFeedback } from "../api/tutor";
import { ERRORS } from "../content/ui";
import {
  currentSourceText,
  initialLessonState,
  lessonReducer,
  type LessonAction,
  type LessonState,
} from "./reducer";
import { LESSON_STEPS, type LessonStep } from "./machine";
import type { TutorFeedback } from "../types/tutor";

/** レッスンの状態 → チューターAPI の step 値。 */
const TUTOR_STEP: Partial<Record<LessonStep, string>> = {
  FIRST_INPUT: "review_input",
  REVIEW_RESULT: "review_result",
  IMPROVE_INPUT: "improve_input",
  REAL_TASK: "real_task",
};

export interface SubmitInput {
  audience: string;
  tone: string;
  length: string;
  instruction?: string;
  label: string;
}

export interface UseLessonResult {
  state: LessonState;
  dispatch: (action: LessonAction) => void;
  submit: (input: SubmitInput) => Promise<void>;
  askTutor: (
    userInput: string,
    override?: { step: LessonStep; attemptCount: number },
  ) => Promise<void>;
  logEvent: (eventType: string, extra?: Record<string, number>) => void;
  complete: () => void;
  submitSurvey: (answers: Record<string, string>) => void;
}

export function useLesson(lessonId: string): UseLessonResult {
  const [state, dispatch] = useReducer(lessonReducer, initialLessonState);

  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  //: ポーの返事の世代。追い越された古い返事を捨てるために使う。
  const tutorSeqRef = useRef(0);
  //: 実行の世代。終わった実行が、後から始まった実行の錠前を外さないようにする。
  const runSeqRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  // 画面を離れたら進行中の実行を中止する
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const logEvent = useCallback(
    (eventType: string, extra: Record<string, number> = {}) => {
      // 送信結果は待たない。失敗してもレッスンを止めない。
      void sendLearningEvent({
        lessonId,
        eventType,
        step: stateRef.current.step,
        ...extra,
      });
    },
    [lessonId],
  );

  // 再訪時、前回の到達ステップから再開する
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await fetchSessionState(lessonId);
      if (cancelled || session === null || session.completed) return;
      if (session.current_step === "INTRO" || session.current_step === "GENERATING") {
        return;
      }
      // 問い合わせが遅いと、その間に学習者はもう進んでいることがある。
      // そこへ再開を当てると画面が後ろへ戻ってしまうので、
      // まだ何もしていないときだけ適用する。
      if (stateRef.current.step !== "INTRO" || stateRef.current.runs.length > 0) {
        return;
      }
      if ((LESSON_STEPS as readonly string[]).includes(session.current_step)) {
        dispatch({ type: "RESUME", step: session.current_step as LessonStep });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  /**
   * ポーにフィードバックを求める。
   *
   * dispatch の直後は stateRef がまだ更新されていないため、
   * 呼び出し側が分かっている場合は step / attemptCount を明示的に渡す。
   */
  const askTutor = useCallback(
    async (
      userInput: string,
      override?: { step: LessonStep; attemptCount: number },
    ) => {
      const lessonStep = override?.step ?? stateRef.current.step;
      const step = TUTOR_STEP[lessonStep];
      if (!step || !userInput.trim()) return;

      const seq = ++tutorSeqRef.current;
      const feedback: TutorFeedback = await fetchTutorFeedback({
        lessonId,
        step,
        userInput,
        attemptCount: Math.max(
          override?.attemptCount ?? stateRef.current.attemptCount,
          1,
        ),
      });
      // 次の実行に追い越されていたら、古い返事は捨てる
      if (seq !== tutorSeqRef.current) return;

      dispatch({
        type: "SET_TUTOR",
        tutor: {
          message: feedback.message,
          emotion: feedback.emotion,
          action: feedback.action,
        },
      });
      logEvent("hint_shown", { hint_count: feedback.hint_level });
    },
    [lessonId, logEvent],
  );

  const submit = useCallback(
    async (input: SubmitInput) => {
      if (inFlightRef.current) return; // 二重送信を防ぐ
      inFlightRef.current = true;
      const runId = ++runSeqRef.current;

      const before = stateRef.current;
      const originalText = currentSourceText(before);

      dispatch({ type: "SUBMIT" });
      logEvent("ai_run_requested", { input_length: originalText.length });

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const request = {
          originalText,
          audience: input.audience,
          tone: input.tone,
          length: input.length,
          instruction: input.instruction,
          step: before.step,
        };

        // まず、書けたところから見せる経路を試す。
        // 使えない環境（古いブラウザ、途中で溜め込むプロキシ、
        // ストリーミング非対応のAI）では、黙って通常の生成へ倒す。
        // 学習者の失敗ではないので、画面には何も出さない。
        let outputText: string;
        try {
          outputText = await rewriteTextStreaming(
            request,
            (textSoFar) => dispatch({ type: "STREAM_CHUNK", textSoFar }),
            controller.signal,
          );
        } catch (error) {
          if (!(error instanceof StreamUnsupportedError)) throw error;
          outputText = await rewriteText(request, controller.signal);
        }

        dispatch({
          type: "RUN_SUCCEEDED",
          label: input.label,
          fromStep: before.step,
          inputText: originalText,
          outputText,
        });
        // 生成はここで終わり。ポーの返事は助言なので、次の操作を待たせない
        // （憲章 原則 III）。ここで解除しないと、返事を待つ間の選択が
        // 黙って捨てられ、行き止まりになる。
        inFlightRef.current = false;
        // dispatch はまだ反映されていないので、遷移先を明示して渡す
        await askTutor(outputText, {
          step: before.step === "REAL_TASK" ? "REAL_TASK" : "REVIEW_RESULT",
          attemptCount: before.attemptCount + 1,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return; // 中断は状態を変えない
        }
        const message =
          error instanceof Error && error.message ? error.message : ERRORS.network;
        dispatch({ type: "RUN_FAILED", message });
      } finally {
        // 次の実行がもう始まっていたら、その実行の錠前を外さない
        if (runSeqRef.current === runId) inFlightRef.current = false;
      }
    },
    [askTutor, logEvent],
  );

  const complete = useCallback(() => {
    dispatch({ type: "COMPLETE" });
    void sendLearningEvent({
      lessonId,
      eventType: "lesson_completed",
      step: "COMPLETE",
      completed: true,
    });
  }, [lessonId]);

  const submitSurvey = useCallback(
    (answers: Record<string, string>) => {
      void sendSurvey(lessonId, answers);
    },
    [lessonId],
  );

  return { state, dispatch, submit, askTutor, logEvent, complete, submitSurvey };
}
