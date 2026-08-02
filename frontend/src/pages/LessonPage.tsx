/**
 * レッスン画面（AIPPO 開発概要 §18 Phase 1 = レイアウト）。
 *
 * Phase 1 では枠と導線だけを用意する。
 * 用途選択・穴埋めフォーム・結果比較の各コンポーネントは Phase 2、
 * AI実行は Phase 3 で実装する。
 *
 * 進行を所有するのはこの画面の reducer であり、AI ではない（憲章 原則 III）。
 */

import { useReducer } from "react";

import { PoeAvatar } from "../components/PoeAvatar";
import lesson from "../content/lessons/rewrite_text_001.json";
import { BRAND, BUTTONS, SAFETY } from "../content/ui";
import { PRIMARY_ACTION } from "../lesson/machine";
import { initialLessonState, lessonReducer } from "../lesson/reducer";
import type { TutorEmotion } from "../types/tutor";

type StepContent = {
  primaryAction: string;
  tutorMessage: string;
  tutorEmotion: TutorEmotion;
  helpText?: string;
};

export type LessonPageProps = {
  /** 診断から渡されるレッスンID。MVP は1本のみ。 */
  lessonId?: string | null;
  onExit?: () => void;
};

export function LessonPage({ onExit }: LessonPageProps = {}) {
  const [state, dispatch] = useReducer(lessonReducer, initialLessonState);
  const content = (lesson.steps as Record<string, StepContent>)[state.step];
  const totalSteps = Object.keys(lesson.steps).length;
  const stepNumber = Object.keys(lesson.steps).indexOf(state.step) + 1;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 pb-48 sm:pb-10">
      <header>
        <p className="text-xs tracking-[0.3em] text-neutral-500">
          {BRAND.name}
        </p>
        <h1 className="mt-2 text-xl font-bold">{lesson.title}</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600">{lesson.goal}</p>
      </header>

      <p
        className="mt-6 text-xs text-neutral-500"
        data-testid="lesson-progress"
      >
        {stepNumber} / {totalSteps}
      </p>

      <section
        className="mt-3 rounded-2xl bg-white p-6 shadow-sm"
        data-testid="lesson-step"
        data-step={state.step}
      >
        {content?.helpText ? (
          <p className="whitespace-pre-line text-sm leading-7">
            {content.helpText}
          </p>
        ) : null}

        {/* 各状態で「次の行動」は常に1つだけ（憲章 原則 I） */}
        <button
          type="button"
          className="mt-6 w-full rounded-xl bg-neutral-900 px-5 py-3 text-white
                     disabled:cursor-not-allowed disabled:bg-neutral-300 sm:w-auto"
          disabled={state.isSubmitting || state.step === "COMPLETE"}
          onClick={() => dispatch({ type: "START" })}
        >
          {PRIMARY_ACTION[state.step]}
        </button>

        {state.error ? (
          <p className="mt-4 text-sm text-red-700" role="alert">
            {state.error}
          </p>
        ) : null}
      </section>

      <p className="mt-6 text-xs leading-5 text-neutral-500">
        {SAFETY.beforeInput}
      </p>

      {onExit ? (
        <button
          type="button"
          onClick={onExit}
          className="mt-8 text-xs text-neutral-500 underline"
        >
          {BUTTONS.back}
        </button>
      ) : null}

      <PoeAvatar
        tutor={{
          message: content?.tutorMessage ?? state.tutor.message,
          emotion: content?.tutorEmotion ?? state.tutor.emotion,
          action: state.tutor.action,
        }}
      />
    </main>
  );
}
