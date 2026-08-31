/**
 * レッスン1本を進めるための状態。
 *
 * 受け持つこと:
 * - どのステップにいるか（進めるのはここ。AI ではない）
 * - 入力した値（戻っても消さない・読み込み直しても消さない）
 * - AI の実行と、その結果の履歴
 * - 二重送信の抑止
 * - 送信前の機密チェック
 * - 操作ログ
 *
 * 受け持たないこと:
 * - 見た目（components/steps/* が受け持つ）
 * - プロンプト（サーバーが組み立てる）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { generate, AiRequestError, type AiUsage } from "../api/ai";
import { completeLesson, sendLearningEvent, type LessonAward } from "../api/lesson";
import { missionStateOf, type MissionState } from "./missions";
import { rememberForReview } from "./review";
import { playSuccessSound } from "./sound";
import {
  clearDraft,
  countRealTask,
  loadDraft,
  markCompleted,
  saveDraft,
} from "../lib/draft";
import { isBlocking, scanForSensitive, type PrivacyFinding } from "../lib/privacy";
import { newRequestId } from "../lib/requestId";
import {
  buildAiInput,
  canGoBack,
  checkStep,
  findStep,
  firstStepId,
  nextStepId,
  previousStepId,
  progressOf,
  stepIndex,
  summaryOf,
  type StepIssue,
} from "./engine";
import type { Lesson, LessonStep, PoMessage, StepValues } from "./types";

/** AI の実行1回分。消さずに積む＝前の結果と比べられる（要件 §6.9）。 */
export interface RunRecord {
  sequence: number;
  stepId: string;
  /** 何をした回か。「1回目」「もっと短く」「自分の文章」。 */
  label: string;
  inputText: string;
  outputText: string;
  usage: AiUsage;
  extras: Record<string, unknown>;
}

export type SubmitOutcome = "sent" | "needs_confirm" | "blocked" | "busy";

export interface CourseLessonApi {
  step: LessonStep;
  values: StepValues;
  po: PoMessage;
  runs: RunRecord[];
  /**
   * 終えたときに増えた分。終える前と、届かなかったときは null。
   *
   * 完了画面はこれで「新しく覚えた技」と「増えたXP」を出す。
   */
  award: LessonAward | null;
  progress: { current: number; total: number };
  /** レッスンの中の区切り（ミッション）と、いまどこにいるか。 */
  missions: MissionState;
  summary: { stepId: string; label: string; value: string }[];
  issue: StepIssue | null;
  canBack: boolean;
  isSubmitting: boolean;
  error: string | null;
  /**
   * 失敗の種類。`error` の文だけでは、押し直せば直る失敗（"failed"）と、
   * 押しても意味が無い失敗（"limit"）を画面側が区別できない
   * ——結果、上限に達しても「AIに送る」を出し続けてしまっていた。
   * `error` が null のときは常に null。
   */
  errorKind: AiRequestError["kind"] | null;
  findings: PrivacyFinding[];
  hintIndex: number;
  realTaskSkipped: boolean;

  setValue: (key: string, value: string) => void;
  goNext: () => void;
  goBack: () => void;
  goTo: (stepId: string) => void;
  showHint: () => void;
  /** AI を実行する。機密チェックに引っかかったら送らずに知らせる。 */
  run: (options?: { force?: boolean; label?: string }) => Promise<SubmitOutcome>;
  dismissFindings: () => void;
  /**
   * 注意を読んだうえで、そのまま次へ進む。
   *
   * AI へ送らないステップ（自分の文章を書くところ）で使う。
   * ここが無いと、注意が出た人はダイアログから出られなくなる。
   */
  continueAnyway: () => void;
  skipRealTask: () => void;
  /** 解説カードを飛ばす。飛ばしたことも記録する。 */
  skipConcept: () => void;
  complete: () => void;
  restart: () => void;
}

/**
 * ステップの種類ごとの記録名（要件 §18）。
 *
 * 何を見て何を飛ばしたかが分かると、どこで離脱するかを追える。
 * 載っていない種類は step_viewed にまとめる。
 */
const STEP_EVENT: Record<string, string> = {
  outcome_preview: "outcome_preview_viewed",
  quick_try: "quick_try_started",
  observation: "result_observation_submitted",
  concept_card: "concept_card_viewed",
  condition_choice: "condition_added",
  real_task: "real_task_started",
};

/**
 * 自分の課題の本文を使うステップ。
 *
 * 入力そのものは real_task で受けるが、送るのは
 * その先の generate_real なので、両方を同じ扱いにする。
 */
const REAL_TASK_STEPS = new Set(["real_task", "prompt_preview", "generate_real"]);

function poOf(step: LessonStep): PoMessage {
  return { message: step.poMessage, emotion: step.poEmotion, action: "wait" };
}

/**
 * Final Challenge だけは、選んだ種類で AI の頼み先が変わる。
 * 教材データは型だけ持ち、差し替えはここでする。
 */
function resolveAction(lesson: Lesson, step: LessonStep, values: StepValues): string {
  const declared = step.aiAction?.action ?? "";
  if (lesson.id !== "final_challenge") return declared;
  if (declared === "improve") return declared; // 改善はどの型でも共通
  return values.kind || declared;
}

export function useCourseLesson(lesson: Lesson): CourseLessonApi {
  const [stepId, setStepId] = useState(() => firstStepId(lesson));
  const [values, setValues] = useState<StepValues>({});
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [po, setPo] = useState<PoMessage>(() => poOf(lesson.steps[0]));
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AiRequestError["kind"] | null>(null);
  const [findings, setFindings] = useState<PrivacyFinding[]>([]);
  const [hintIndex, setHintIndex] = useState(0);
  const [realTaskSkipped, setRealTaskSkipped] = useState(false);
  /* 終えたときに増えた分。サーバーが決める（画面では数えない） */
  const [award, setAward] = useState<LessonAward | null>(null);
  const [restored, setRestored] = useState(false);

  /**
   * 送信中かどうかを ref でも持つ。
   * state だけだと、同じ描画の中で2回押されたときに両方通る。
   */
  const inFlight = useRef(false);
  /** 追い越された古い返事を捨てるための世代番号。 */
  const generation = useRef(0);
  /**
   * いま送ろうとしている操作の合言葉（`lib/requestId.ts`）。
   *
   * 持ち続けるあいだが「ひとつの操作」。**成功したら捨てる**ので、
   * そのあと同じ画面でもう一度押した人には、ちゃんと新しい結果が出る。
   * 逆に、送ったのに返事が来なくて押し直した人には同じ合言葉が付き、
   * サーバーは作り直さずに前の結果を返す（持ち分が2つ減らない）。
   *
   * `key` は「何を送ろうとしているか」。中身が変われば別の操作なので、
   * 合言葉も引き直す。
   */
  const pendingRequest = useRef<{ key: string; id: string } | null>(null);

  const step = useMemo(
    () => findStep(lesson, stepId) ?? lesson.steps[0],
    [lesson, stepId],
  );

  // -- 読み込み直しても続きから（要件 §6.6） ---------------------------
  useEffect(() => {
    const draft = loadDraft(lesson.id);
    if (draft && findStep(lesson, draft.stepId)) {
      setStepId(draft.stepId);
      setValues(draft.values);
      setRealTaskSkipped(Boolean(draft.realTaskSkipped));
      setPo(poOf(findStep(lesson, draft.stepId) as LessonStep));
    }
    setRestored(true);
    void sendLearningEvent({ lessonId: lesson.id, eventType: "lesson_started" });
  }, [lesson]);

  // 復元し終えてから保存する。しないと空の値で上書きしてしまう。
  useEffect(() => {
    if (!restored) return;
    saveDraft({ lessonId: lesson.id, stepId, values, realTaskSkipped });
  }, [restored, lesson.id, stepId, values, realTaskSkipped]);

  /*
    最初の1回で使う例文と、選ばせない条件の既定値を先に入れておく。

    空欄から始めさせないため、そして「相手だけ選べば送れる」状態を
    作るため。すでに値があるときは上書きしない（戻ってきたとき用）。
  */
  useEffect(() => {
    if (!restored || step.type !== "quick_try") return;
    const meta = (step.meta ?? {}) as {
      sampleText?: string;
      defaults?: StepValues;
    };

    setValues((current) => {
      const next = { ...current };
      if (meta.sampleText && !next.source_text) next.source_text = meta.sampleText;
      for (const [key, value] of Object.entries(meta.defaults ?? {})) {
        if (!next[key]) next[key] = value;
      }
      return next;
    });
  }, [restored, step]);

  // 画面を見たことを記録する
  useEffect(() => {
    if (!restored) return;
    void sendLearningEvent({
      lessonId: lesson.id,
      eventType: STEP_EVENT[step.type] ?? "step_viewed",
      step: stepId,
    });
  }, [restored, lesson.id, step.type, stepId]);

  const setValue = useCallback(
    (key: string, value: string) => {
      setValues((current) => ({ ...current, [key]: value }));
      setError(null);
      setErrorKind(null);
      void sendLearningEvent({
        lessonId: lesson.id,
        eventType: value.length > 0 && key.endsWith("_text") ? "text_entered" : "option_selected",
        step: stepId,
        inputLength: value.length,
      });
    },
    [lesson.id, stepId],
  );

  const move = useCallback(
    (nextId: string) => {
      const target = findStep(lesson, nextId);
      if (!target) return;

      /*
        区切り（ミッション）を1つ終えたか。

        進んだときだけ数える。戻ったときに数えると、行き来した回数が
        そのまま「終えた区切りの数」になる。
      */
      const from = missionStateOf(lesson, stepIndex(lesson, stepId));
      const to = missionStateOf(lesson, stepIndex(lesson, nextId));
      if (to.current > from.current) {
        void sendLearningEvent({
          lessonId: lesson.id,
          eventType: "mission_completed",
          step: stepId,
          inputLength: from.current,
        });
      }

      setStepId(nextId);
      setPo(poOf(target));
      setHintIndex(0);
      setError(null);
      setErrorKind(null);
      setFindings([]);
    },
    [lesson, stepId],
  );

  const goNext = useCallback(() => {
    if (step.type === "prompt_preview") {
      void sendLearningEvent({
        lessonId: lesson.id,
        eventType: "prompt_preview_opened",
        step: step.id,
      });
    }

    /*
      自分の文章を書くステップを離れるときに、いちど見る。

      送るのはこの先の generate_real で、そこでも必ず見ている。
      ここで見るのは**言うのが遅すぎるのを防ぐ**ため。ここで見ないと、
      パスワードを書いた人は「誰が読むか」「どう変えたいか」と
      3つ4つ答えたあとで初めて「消してください」と言われる。
      そこまでの操作が丸ごと無駄になり、書き直す気も削がれる。
    */
    if (step.type === "real_task") {
      const found = scanForSensitive(values.real_task_text ?? "");
      if (found.length > 0) {
        setFindings(found);
        setPo({
          message: "個人情報や会社の非公開情報が含まれていないか確認してください。",
          emotion: "warning",
          action: "wait",
        });
        void sendLearningEvent({
          lessonId: lesson.id,
          eventType: "privacy_warning_shown",
          step: step.id,
        });
        return;
      }
    }

    move(nextStepId(lesson, stepId));
  }, [lesson, move, step, stepId, values]);

  const goBack = useCallback(() => move(previousStepId(lesson, stepId)), [
    lesson,
    move,
    stepId,
  ]);

  const showHint = useCallback(() => {
    const hints = step.hints ?? [];
    if (hints.length === 0) return;

    const index = Math.min(hintIndex, hints.length - 1);
    setHintIndex(index + 1);
    setPo({ message: hints[index], emotion: "hint", action: "show_hint" });
    void sendLearningEvent({
      lessonId: lesson.id,
      eventType: "hint_opened",
      step: step.id,
      hintCount: index + 1,
    });
  }, [hintIndex, lesson.id, step]);

  /** AI へ送る本文。自分の課題のステップだけ、そちらの文章を使う。 */
  const bodyText = useCallback(
    (target: LessonStep): string =>
      REAL_TASK_STEPS.has(target.id)
        ? values.real_task_text ?? ""
        : values.source_text ?? values.topic ?? values.trouble ?? "",
    [values],
  );

  const run = useCallback(
    async (options: { force?: boolean; label?: string } = {}) => {
      if (inFlight.current) return "busy" as const;

      const spec = step.aiAction;
      if (!spec) return "busy" as const;

      const input = buildAiInput(step, {
        ...values,
        // 自分の課題のステップでは、本文だけ差し替える
        source_text: bodyText(step),
        original_text: bodyText(step),
      });
      /*
        条件を足す回は、**直前の結果**を対象にする。
        元の文章へ戻して送り直すと、1回目の効果が消えてしまい、
        「足すたびに近づく」という体験にならない。
      */
      const action = resolveAction(lesson, step, values);
      if (action === "improve") {
        const previous = runs[runs.length - 1];
        input.original_text = previous?.outputText ?? bodyText(step);
        input.improvement =
          values.condition || values.improvement || values.improvement_direction || "";
      }

      // 送る直前に確かめる。端末の中だけで判定する（要件 §7）
      const found = scanForSensitive(Object.values(input).join("\n"));
      if (found.length > 0 && !options.force) {
        setFindings(found);
        setPo({
          message: "個人情報や会社の非公開情報が含まれていないか確認してください。",
          emotion: "warning",
          action: "wait",
        });
        void sendLearningEvent({
          lessonId: lesson.id,
          eventType: "privacy_warning_shown",
          step: step.id,
        });
        return isBlocking(found) ? ("blocked" as const) : ("needs_confirm" as const);
      }
      if (found.length > 0 && options.force) {
        if (isBlocking(found)) return "blocked" as const;
        void sendLearningEvent({
          lessonId: lesson.id,
          eventType: "privacy_warning_overridden",
          step: step.id,
        });
      }

      inFlight.current = true;
      generation.current += 1;
      const mine = generation.current;

      /*
        この送りの合言葉を決める。

        送ろうとしている中身（どの回・どの頼み方・何の文章）が
        さっきと同じなら、同じ操作の送り直しとみなして引き継ぐ。
        違っていれば別の操作なので引き直す。

        成功したら下で捨てる。捨てるからこそ、同じ内容でもう一度
        押した人には**新しい結果**が返る。
      */
      const key = `${step.id}|${action}|${JSON.stringify(input)}`;
      if (pendingRequest.current?.key !== key) {
        pendingRequest.current = { key, id: newRequestId() };
      }
      const requestId = pendingRequest.current.id;

      setSubmitting(true);
      setError(null);
      setErrorKind(null);
      setFindings([]);
      setPo({
        message: step.poMessage,
        emotion: "thinking",
        action: "wait",
      });

      try {
        const response = await generate({
          lessonId: lesson.id,
          stepId: step.id,
          action,
          input,
          requestId,
          // 将来のモデル比較コース用。通常の教材では指定しない
          provider: step.aiAction?.provider,
          model: step.aiAction?.model,
        });
        if (mine !== generation.current) return "busy" as const;

        /*
          届いた。合言葉はここで捨てる。

          持ったままにすると、同じ内容で押し直した人にサーバーが
          前の結果を返してしまう——押しても何も変わらない画面になる。
          「もう一度」は新しい操作。
        */
        pendingRequest.current = null;

        /*
          AIの返事が届いた。既定は無音で、入れた人にだけ短く1音。

          いちばん待たされる場面なので、届いたことが画面を見ていない
          人にも分かるようにする。文字（結果そのもの）は必ず出るので、
          音はその上乗せ。
        */
        playSuccessSound("result");

        setRuns((current) => [
          ...current,
          {
            sequence: current.length + 1,
            stepId: step.id,
            label: options.label ?? (current.length === 0 ? "1回目" : `${current.length + 1}回目`),
            inputText: input.original_text ?? "",
            outputText: response.result,
            usage: response.usage,
            extras: response.extras ?? {},
          },
        ]);
        setPo(response.tutor);
        if (REAL_TASK_STEPS.has(step.id)) {
          countRealTask();
          void sendLearningEvent({
            lessonId: lesson.id,
            eventType: "real_task_completed",
            step: step.id,
            completed: true,
          });
        }
        return "sent" as const;
      } catch (caught) {
        if (mine !== generation.current) return "busy" as const;

        const failure =
          caught instanceof AiRequestError
            ? caught
            : new AiRequestError("うまく届かなかったようです。", "failed");
        // 入力は消さない。同じことをもう一度書かせない（要件 §6.8）
        setError(failure.detail);
        setErrorKind(failure.kind);
        /*
          「今日はここまで」と「うまく届かなかった」を分ける。

          前者は押し直しても意味が無く、後者は押し直せば直ることが多い。
          持ち分を使い切った（`out_of_credits`）のも、その日の上限に
          当たった（`limit`）のも、次にすることは同じ——今日はここまで。
        */
        const done = failure.kind === "limit" || failure.kind === "out_of_credits";
        setPo({
          message: failure.detail,
          /*
            上限に達しただけなのに、押しても直らない「失敗」として
            出さない。ここまでよく練習した、という事実は変わらない。
          */
          emotion: done ? "celebrate" : "warning",
          action: done ? "wait" : "retry",
        });
        return "busy" as const;
      } finally {
        if (mine === generation.current) setSubmitting(false);
        inFlight.current = false;
      }
    },
    [bodyText, lesson, runs, step, values],
  );

  /*
    注意を読んだうえで、そのまま進む。

    取り消せない実害が出るもの（パスワード・APIキー・カード番号）は
    ここでも通さない。画面のボタンも押せなくしてあるが、
    最後の判断をここに置いておく。
  */
  const continueAnyway = useCallback(() => {
    if (isBlocking(findings)) return;

    void sendLearningEvent({
      lessonId: lesson.id,
      eventType: "privacy_warning_overridden",
      step: step.id,
    });
    setFindings([]);
    setPo(poOf(step));
    move(nextStepId(lesson, stepId));
  }, [findings, lesson, move, step, stepId]);

  const dismissFindings = useCallback(() => {
    setFindings([]);
    setPo(poOf(step));
    void sendLearningEvent({
      lessonId: lesson.id,
      eventType: "privacy_warning_cancelled",
      step: step.id,
    });
  }, [lesson.id, step]);

  const skipConcept = useCallback(() => {
    void sendLearningEvent({
      lessonId: lesson.id,
      eventType: "concept_card_skipped",
      step: step.id,
    });
    // あとで見返せるように控える（復習の回を作るときの材料）
    rememberForReview({
      lessonId: lesson.id,
      stepId: step.id,
      reason: "concept_skipped",
    });
    move(nextStepId(lesson, stepId));
  }, [lesson, move, step.id, stepId]);

  const skipRealTask = useCallback(() => {
    setRealTaskSkipped(true);
    void sendLearningEvent({
      lessonId: lesson.id,
      eventType: "real_task_skipped",
      step: step.id,
    });
    rememberForReview({
      lessonId: lesson.id,
      stepId: step.id,
      reason: "real_task_skipped",
    });
    move(nextStepId(lesson, stepId));
  }, [lesson, move, step.id, stepId]);

  const complete = useCallback(() => {
    markCompleted(lesson.id);
    /*
      何が増えたかはサーバーが決める（設計方針 §36）。
      画面で数えると必ず食い違うので、返ってきた分をそのまま出す。
      届かなくても学習は終わっている——祝いの材料が無いだけ。
    */
    void completeLesson(lesson.id, stepId).then(setAward);
    clearDraft(lesson.id);
  }, [lesson.id, stepId]);

  const restart = useCallback(() => {
    clearDraft(lesson.id);
    setAward(null);
    setValues({});
    setRuns([]);
    setRealTaskSkipped(false);
    move(firstStepId(lesson));
  }, [lesson, move]);

  return {
    step,
    values,
    po,
    runs,
    award,
    progress: progressOf(lesson, stepId),
    missions: missionStateOf(lesson, progressOf(lesson, stepId).current - 1),
    summary: summaryOf(lesson, stepId, values),
    issue: checkStep(step, values),
    canBack: canGoBack(lesson, stepId),
    isSubmitting,
    error,
    errorKind,
    findings,
    hintIndex,
    realTaskSkipped,
    setValue,
    goNext,
    goBack,
    goTo: move,
    showHint,
    run,
    dismissFindings,
    continueAnyway,
    skipRealTask,
    skipConcept,
    complete,
    restart,
  };
}
