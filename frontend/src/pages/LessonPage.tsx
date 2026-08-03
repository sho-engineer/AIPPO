/**
 * レッスン画面（AIPPO 開発概要 §10 の全ステップ）。
 *
 * 各状態で提示する「次の行動」は常に1つだけ（憲章 原則 I）。
 * 進行を決めるのは reducer であり、AI ではない（原則 III）。
 */

import { useEffect, useState, type ReactNode } from "react";

import { BrandLogo } from "../components/BrandLogo";
import { CompletionView } from "../components/CompletionView";
import { FillInForm, firstMissingField } from "../components/FillInForm";
import { ImprovementSelector } from "../components/ImprovementSelector";
import { PoeAvatar } from "../components/PoeAvatar";
import { RealTaskInput } from "../components/RealTaskInput";
import { ResultCompare } from "../components/ResultCompare";
import { UseCaseSelector } from "../components/UseCaseSelector";
import lessonData from "../content/lessons/rewrite_text_001.json";
import { BUTTONS, ERRORS, LIMITS, SAFETY, WAITING } from "../content/ui";
import { hasRealTaskRun } from "../lesson/reducer";
import { useLesson } from "../lesson/useLesson";
import type { TutorEmotion } from "../types/tutor";

type StepContent = {
  primaryAction: string;
  tutorMessage: string;
  tutorEmotion: TutorEmotion;
  helpText?: string;
};

type Lesson = {
  id: string;
  title: string;
  goal: string;
  useCases: { id: string; label: string; sampleText: string }[];
  fillInFields: {
    key: string;
    label: string;
    placeholder: string;
    options: string[];
    required: boolean;
  }[];
  improvements: { id: string; label: string; instruction: string }[];
  steps: Record<string, StepContent>;
};

const lesson = lessonData as Lesson;

const ACHIEVEMENTS = [
  "AIに「誰向けの文章か」を伝えられるようになった",
  "「どんな表現にしたいか」を伝えられるようになった",
  "「どれくらいの長さか」を伝えられるようになった",
  "AIの回答を見て、直したいところを言えるようになった",
] as const;

const NEXT_SUGGESTION =
  "同じやり方は、返信の下書きや、長い資料の要約にも使えます。" +
  "「誰に」「どんな言い方で」「どれくらい」を伝えるところは同じです。";

export type LessonPageProps = {
  lessonId?: string | null;
  onExit?: () => void;
};

export function LessonPage({ onExit }: LessonPageProps = {}) {
  const { state, dispatch, submit, askTutor, logEvent, complete, submitSurvey } =
    useLesson(lesson.id);
  const [formError, setFormError] = useState<string | null>(null);
  const [waitedMs, setWaitedMs] = useState(0);

  // 待機中の案内を段階的に切り替える（15秒 / 30秒）
  useEffect(() => {
    if (state.step !== "GENERATING") {
      setWaitedMs(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => setWaitedMs(Date.now() - started), 1000);
    return () => window.clearInterval(timer);
  }, [state.step]);

  // ステップ通過を記録する
  useEffect(() => {
    logEvent("step_entered");
  }, [state.step, logEvent]);

  const content = lesson.steps[state.step];
  const stepNumber = Object.keys(lesson.steps).indexOf(state.step) + 1;
  const totalSteps = Object.keys(lesson.steps).length;
  const latestRun = state.runs.at(-1);
  const hasImproved = state.runs.length >= 2;
  const realTaskDone = hasRealTaskRun(state);

  function conditions() {
    return {
      audience: state.fillInValues.audience ?? "",
      tone: state.fillInValues.tone ?? "",
      length: state.fillInValues.length ?? "",
    };
  }

  function handleFirstSubmit() {
    const missing = firstMissingField(lesson.fillInFields, state.fillInValues);
    if (missing) {
      setFormError(ERRORS.requiredField(missing.label));
      return;
    }
    if (!state.sourceText.trim()) {
      setFormError("分かりやすくしたい文章を入れてみましょう。");
      return;
    }
    if (state.sourceText.length > LIMITS.maxUserInputLength) {
      setFormError(ERRORS.tooLong(LIMITS.maxUserInputLength));
      return;
    }
    setFormError(null);
    logEvent("input_submitted", { input_length: state.sourceText.length });
    void submit({ ...conditions(), label: "はじめの条件" });
  }

  function handleImprove(improvementId: string, instruction: string, label: string) {
    dispatch({ type: "SELECT_IMPROVEMENT", improvementId });
    logEvent("improvement_selected");
    void submit({ ...conditions(), instruction, label });
  }

  function handleRealTaskSubmit() {
    if (!state.realTaskText.trim()) {
      setFormError(ERRORS.emptyRealTask);
      return;
    }
    if (state.realTaskText.length > LIMITS.maxUserInputLength) {
      setFormError(ERRORS.tooLong(LIMITS.maxUserInputLength));
      return;
    }
    setFormError(null);
    logEvent("real_task_submitted", { input_length: state.realTaskText.length });
    void submit({ ...conditions(), label: "自分の文章" });
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 pb-56 sm:pb-10">
      <header>
        <BrandLogo className="h-7" />
        <h1 className="mt-2 text-xl font-bold">{lesson.title}</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">{lesson.goal}</p>
      </header>

      {/*
        今どこにいて、あとどれくらいかを見せる。
        数字だけだと、初心者には「まだ先が長いのか」が伝わらない。
      */}
      <div className="mt-6" data-testid="lesson-progress">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-brand-soft"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-valuenow={stepNumber}
          aria-label="レッスンの進み具合"
        >
          <div
            className="h-full rounded-full bg-brand transition-all duration-500"
            style={{ width: `${(stepNumber / totalSteps) * 100}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">
          {stepNumber} / {totalSteps}
        </p>
      </div>

      <section
        className="mt-3 rounded-2xl bg-surface p-6 shadow-sm"
        data-testid="lesson-step"
        data-step={state.step}
      >
        {state.step === "INTRO" ? (
          <>
            <h2 className="text-base font-bold">このレッスンでやること</h2>
            <p className="mt-3 text-sm leading-7">
              AIに「文章を直して」と頼むだけでは、思ったとおりになりません。
              相手・言い方・長さを伝えると、結果がどう変わるかを実際に試します。
            </p>
            <PrimaryButton onClick={() => dispatch({ type: "START" })}>
              {BUTTONS.start}
            </PrimaryButton>
          </>
        ) : null}

        {state.step === "SELECT_USE_CASE" ? (
          <UseCaseSelector
            useCases={lesson.useCases}
            selectedId={state.useCaseId}
            onSelect={(useCase) => {
              logEvent("use_case_selected");
              dispatch({
                type: "SELECT_CASE",
                useCaseId: useCase.id,
                sampleText: useCase.sampleText,
              });
            }}
          />
        ) : null}

        {state.step === "FIRST_INPUT" ? (
          <>
            <FillInForm
              fields={lesson.fillInFields}
              values={state.fillInValues}
              sourceText={state.sourceText}
              onChangeSourceText={(text) =>
                dispatch({ type: "SET_SOURCE_TEXT", text })
              }
              onChange={(key, value) =>
                dispatch({ type: "SET_FILL_IN", key, value })
              }
              disabled={state.isSubmitting}
            />
            <PrimaryButton onClick={handleFirstSubmit} disabled={state.isSubmitting}>
              {BUTTONS.submit}
            </PrimaryButton>
          </>
        ) : null}

        {state.step === "GENERATING" ? (
          <div data-testid="generating">
            <p className="text-sm" role="status">
              {waitedMs >= LIMITS.waitingTooLongMs
                ? WAITING.tooLong
                : waitedMs >= LIMITS.waitingLongMs
                  ? WAITING.long
                  : WAITING.short}
            </p>

            {/*
              書けたところから見せる。待ち時間はほぼすべてAIの応答待ちなので、
              ここが体感を一番左右する。
              まだ書きかけなので、読み上げの割り込みはしない（aria-live は付けない）。
            */}
            {state.streamingText ? (
              <div
                data-testid="streaming-text"
                className="mt-4 rounded-xl border border-line bg-surface p-4"
              >
                <p className="whitespace-pre-wrap text-sm leading-7">
                  {state.streamingText}
                  <span
                    aria-hidden="true"
                    className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-brand align-middle"
                  />
                </p>
              </div>
            ) : null}

            {waitedMs >= LIMITS.waitingTooLongMs ? (
              <button
                type="button"
                onClick={() => dispatch({ type: "CANCEL" })}
                className="mt-4 rounded-xl border border-line px-5 py-3 text-sm"
              >
                {BUTTONS.cancel}
              </button>
            ) : null}
          </div>
        ) : null}

        {state.step === "REVIEW_RESULT" && latestRun ? (
          <>
            <ResultCompare
              originalText={latestRun.inputText}
              runs={state.runs}
              showChecklist
            />
            <PrimaryButton onClick={() => dispatch({ type: "NEXT" })}>
              {BUTTONS.next}
            </PrimaryButton>
          </>
        ) : null}

        {state.step === "IMPROVE_INPUT" ? (
          hasImproved ? (
            <>
              <ResultCompare
                originalText={state.runs[0]?.inputText ?? state.sourceText}
                runs={state.runs}
              />
              <p className="mt-6 text-sm">
                条件を足すと結果が変わることを確認できました。
              </p>
              <PrimaryButton onClick={() => dispatch({ type: "NEXT" })}>
                自分の文章で試す
              </PrimaryButton>
              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-ink-muted">
                  もう一度、別の直し方も試す
                </summary>
                <div className="mt-3">
                  <ImprovementSelector
                    improvements={lesson.improvements}
                    selectedId={state.improvementId}
                    onSelect={(improvement) =>
                      handleImprove(
                        improvement.id,
                        improvement.instruction,
                        improvement.label,
                      )
                    }
                    disabled={state.isSubmitting}
                  />
                </div>
              </details>
            </>
          ) : (
            <ImprovementSelector
              improvements={lesson.improvements}
              selectedId={state.improvementId}
              onSelect={(improvement) =>
                handleImprove(
                  improvement.id,
                  improvement.instruction,
                  improvement.label,
                )
              }
              disabled={state.isSubmitting}
            />
          )
        ) : null}

        {state.step === "REAL_TASK" && realTaskDone ? (
          <>
            <ResultCompare
              originalText={state.realTaskText}
              runs={state.runs.filter((run) => run.fromStep === "REAL_TASK")}
            />
            <p className="mt-6 text-sm">
              自分の文章でも、同じやり方で直せました。
            </p>
            <PrimaryButton onClick={() => dispatch({ type: "NEXT" })}>
              振り返りへ進む
            </PrimaryButton>
          </>
        ) : null}

        {state.step === "REAL_TASK" && !realTaskDone ? (
          <>
            <RealTaskInput
              value={state.realTaskText}
              onChange={(text) => dispatch({ type: "SET_REAL_TASK", text })}
              onUseSample={() => {
                dispatch({ type: "SET_REAL_TASK", text: state.sourceText });
                setFormError(null);
              }}
              disabled={state.isSubmitting}
            />
            <PrimaryButton
              onClick={handleRealTaskSubmit}
              disabled={state.isSubmitting}
            >
              {BUTTONS.submit}
            </PrimaryButton>
          </>
        ) : null}

        {state.step === "REFLECTION" ? (
          <>
            <h2 className="text-base font-bold">ここまでを振り返りましょう</h2>
            <ul className="mt-4 grid gap-2" role="list">
              {ACHIEVEMENTS.map((item) => (
                <li key={item} className="text-sm leading-6">
                  ・{item}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-5 text-ink-muted">
              {SAFETY.checkFacts}
            </p>
            <PrimaryButton onClick={complete}>{BUTTONS.complete}</PrimaryButton>
          </>
        ) : null}

        {state.step === "COMPLETE" ? (
          <CompletionView
            achievements={ACHIEVEMENTS}
            resultText={latestRun?.outputText ?? ""}
            nextSuggestion={NEXT_SUGGESTION}
            onSubmitSurvey={submitSurvey}
            onRestart={() => {
              logEvent("lesson_started");
              dispatch({ type: "RESTART" });
            }}
          />
        ) : null}

        {formError ? (
          <p className="mt-4 text-sm text-caution" role="alert">
            {formError}
          </p>
        ) : null}
        {state.error ? (
          <p className="mt-4 text-sm text-caution" role="alert">
            {state.error}
          </p>
        ) : null}
      </section>

      {state.step === "REVIEW_RESULT" ? (
        <button
          type="button"
          onClick={() => void askTutor(latestRun?.outputText ?? "")}
          className="mt-6 text-xs text-ink-muted underline"
        >
          ポーにヒントをもらう
        </button>
      ) : null}

      {onExit ? (
        <button
          type="button"
          onClick={onExit}
          className="mt-8 block text-xs text-ink-muted underline"
        >
          {BUTTONS.back}
        </button>
      ) : null}

      <PoeAvatar
        tutor={{
          message: state.tutor.message || content?.tutorMessage || "",
          emotion: state.tutor.emotion,
          action: state.tutor.action,
        }}
      />
    </main>
  );
}

function PrimaryButton({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid="primary-action"
      className="mt-6 w-full rounded-xl bg-brand px-5 py-3 text-white
                 disabled:cursor-not-allowed disabled:bg-brand-line sm:w-auto"
    >
      {children}
    </button>
  );
}
