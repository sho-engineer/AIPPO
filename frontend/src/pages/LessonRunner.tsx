/**
 * レッスン1本を最後まで進める画面。
 *
 * ステップの種類ごとに出し分けるだけで、進行の判断はしない。
 * 何を出すかは教材データ、どう進むかは engine.ts が決める。
 *
 * この画面が持つ責任は3つだけ。
 *   1. いまのステップの種類に合う見た目を選ぶ
 *   2. 「次にやること」のラベルを決める
 *   3. 送信前の確認を割り込ませる
 */

import { useEffect, useRef, useState } from "react";

import { AppHeader, Card, CardHeading } from "../components/AppShell";
import { IconBook, IconCaution, IconSparkle } from "../components/Icons";
import { PrivacyDialog } from "../components/course/PrivacyDialog";
import { SafetyNote } from "../components/SafetyNote";
import { StepShell } from "../components/course/StepShell";
import {
  ChoiceStep,
  ChoiceTiles,
  CompletionView,
  ConceptCardView,
  GeneratingCard,
  ObservationList,
  OutcomePreview,
  PromptPreview,
  QuizStep,
  ResultCompare,
  RunHistory,
  StartChoiceTiles,
  TextStep,
  ThreeWayCompare,
} from "../components/course/StepViews";
import { buildAiInput } from "../course/engine";
import { lookupLesson, useCourse } from "../course/live";
import { recommendLessons, saveRecommendations } from "../course/recommend";
import { saveProfile } from "../api/diagnosis";
import { useCompletedLessons } from "../course/progress";
import { useCourseLesson } from "../course/useCourseLesson";
import type { Lesson } from "../course/types";

export interface LessonRunnerProps {
  lesson: Lesson;
  onFinish: () => void;
  onExit: () => void;
  /** 完了画面から次のレッスンへ直接移る。行き止まりにしないため。 */
  onSelectLesson?: (lessonId: string) => void;
}

/** ステップの種類ごとの「次にやること」。1つに絞る（憲章 原則 I）。 */
const PRIMARY_LABEL: Record<string, string> = {
  intro: "はじめる",
  outcome_preview: "まず試してみる",
  quick_try: "AIに送ってみる",
  observation: "解説を見る",
  concept_card: "次へ",
  condition_choice: "この条件で試す",
  single_choice: "次へ",
  multi_choice: "次へ",
  text_input: "次へ",
  template_builder: "次へ",
  prompt_preview: "この内容でAIに送る",
  ai_generate: "AIに送る",
  result_review: "次へ",
  result_compare: "次へ",
  improvement_choice: "もう一度AIに送る",
  safety_check: "この中から選ぶ",
  real_task: "自分の文章で試す",
  reflection: "次へ",
  completion: "完了する",
};

export function LessonRunner({
  lesson,
  onFinish,
  onExit,
  onSelectLesson,
}: LessonRunnerProps) {
  const api = useCourseLesson(lesson);
  const { step, values, runs } = api;
  const [revealed, setRevealed] = useState(false);

  /*
    完了画面で使う、コース全体の進み具合と次の行き先。
    端末に残っている分と、サーバーが数えている分の両方から取る。
  */
  const course = useCourse();
  const completedIds = useCompletedLessons();
  const completedCount = completedIds.length;
  const nextLessons = course.lessons
    .filter(
      (entry) =>
        entry.id !== lesson.id &&
        entry.usesAi &&
        !completedIds.includes(entry.id),
    )
    .slice(0, 2);

  const lastRun = runs[runs.length - 1];
  const meta = (step.meta ?? {}) as {
    reviewPoints?: string[];
    factCheck?: boolean;
    answer?: string[];
    /** 元・1回目・改善後の3つを並べるか。 */
    threeWay?: boolean;
  };

  /** 最初の1回で使う例文。空欄から始めさせないために事前に入れておく。 */
  const sampleText = (() => {
    const quick = lesson.steps.find((entry) => entry.type === "quick_try");
    return (quick?.meta as { sampleText?: string } | undefined)?.sampleText;
  })();

  const send = async (label?: string) => {
    const outcome = await api.run({ label });
    if (outcome === "sent") api.goNext();
  };

  /*
    送信のステップに入ったら、そのまま送る。

    ここで待たせて「AIに送る」をもう一度押させると、
    直前の確認画面で押したボタンは何だったのか分からなくなる。
    確認画面＝送る意思表示、このステップ＝送っている最中、と分ける。

    失敗したときは自動で送り直さない。同じ失敗を繰り返して
    費用だけが増える。押し直してもらう。
  */
  const autoRan = useRef("");
  useEffect(() => {
    if (step.type !== "ai_generate") {
      // 送信のステップから離れたら覚え直す。
      // 戻ってきたときにもう一度送れるようにするため。
      autoRan.current = "";
      return;
    }
    if (api.isSubmitting || api.error || api.findings.length > 0) return;

    // 目印は**ステップの id だけ**にする。
    // 実行回数を混ぜると、成功して回数が増えた瞬間に
    // 別の目印になり、もう一度送ってしまう（費用が倍になる）。
    if (autoRan.current === step.id) return;
    autoRan.current = step.id;

    void send(runs.length === 0 ? "1回目" : undefined);
    // send は毎回作り直されるので、依存に入れると送り続ける
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, step.type, api.isSubmitting, api.error, api.findings.length]);

  const confirmAndSend = async () => {
    const outcome = await api.run({ force: true });
    if (outcome === "sent") api.goNext();
  };

  const body = (() => {
    switch (step.type) {
      case "safety_check":
        if (step.options) {
          return (
            <div>
              <div className="flex items-start gap-2 rounded-card bg-caution-soft px-4 py-3 text-sm leading-7 text-caution">
                <IconCaution className="mt-1.5 h-4 w-4 shrink-0" />
                <span>{step.poMessage}</span>
              </div>
              <div className="mt-5">
                <StartChoiceTiles
                  onPick={(value) => {
                    api.setValue(step.key ?? "", value);
                    api.goNext();
                  }}
                  onSkip={api.skipRealTask}
                />
              </div>
            </div>
          );
        }
        return (
          <div className="rounded-card border border-brand-line bg-surface p-5">
            <p className="text-sm leading-7">{step.poMessage}</p>
            <ul className="mt-4 space-y-2 text-sm leading-7" role="list">
              <li>・会社の秘密や個人情報は入力しない</li>
              <li>・数字・日付・固有名詞は、あとで自分で確かめる</li>
              <li>・医療・法律・お金の大事な判断は、専門家にも確認する</li>
            </ul>
          </div>
        );

      case "intro":
        return (
          <div className="rounded-card border border-brand-line bg-surface p-5">
            <p className="text-sm leading-7">{step.poMessage}</p>
          </div>
        );

      case "outcome_preview":
        return (
          <OutcomePreview
            minutes={lesson.estimatedMinutes}
            before={lesson.beforeExample}
            after={lesson.afterExample}
            skills={lesson.learnedSkills ?? lesson.outcomes}
          />
        );

      case "concept_card":
        return step.card ? <ConceptCardView card={step.card} /> : null;

      case "quick_try":
        return (
          <div>
            <ChoiceStep
              step={step}
              value={values[step.key ?? ""] ?? ""}
              onChange={(value) => api.setValue(step.key ?? "", value)}
            />
            {/*
              何を送るのかは、この画面でも見えるようにしておく（要件 §12）。
              ただし確認のためだけの1画面は挟まない。
              最初の結果までが遠くなると、そこで離れる。
            */}
            {sampleText && (
              <div className="mt-5">
                <Card>
                  <CardHeading icon={IconSparkle} tone="plain">
                    AIにはこう伝えます
                  </CardHeading>
                  <p className="mt-4 whitespace-pre-wrap rounded-card bg-canvas p-4 text-sm leading-7">
                    {sampleText}
                  </p>
                </Card>
              </div>
            )}
          </div>
        );

      case "observation":
        return (
          <div>
            {lastRun && (
              <ResultCompare
                before={lastRun.inputText}
                after={lastRun.outputText}
                reviewPoints={meta.reviewPoints ?? []}
                factCheck={meta.factCheck}
              />
            )}
            <div className="mt-6">
              <ObservationList
                step={step}
                value={values[step.key ?? ""] ?? ""}
                onChange={(value) => api.setValue(step.key ?? "", value)}
              />
            </div>
          </div>
        );

      case "condition_choice":
        return (
          <div>
            {/*
              直前の結果を上に置く。
              条件だけを並べても「何に対して足すのか」が画面から消えていて、
              思い出しながら選ばせることになっていた。
            */}
            {lastRun && (
              <Card className="mb-5">
                <CardHeading icon={IconSparkle} tone="plain">
                  いまのAIの結果
                </CardHeading>
                <p className="mt-4 whitespace-pre-wrap break-words rounded-card bg-canvas p-4 text-sm leading-7">
                  {lastRun.outputText}
                </p>
              </Card>
            )}
            <ChoiceTiles
              step={step}
              value={values[step.key ?? ""] ?? ""}
              onChange={(value) => api.setValue(step.key ?? "", value)}
            />
          </div>
        );

      case "single_choice":
      case "multi_choice":
        return meta.answer ? (
          <QuizStep
            step={step}
            value={values[step.key ?? ""] ?? ""}
            onChange={(value) => {
              api.setValue(step.key ?? "", value);
              setRevealed(true);
            }}
            revealed={revealed}
          />
        ) : (
          <ChoiceStep
            step={step}
            value={values[step.key ?? ""] ?? ""}
            onChange={(value) => api.setValue(step.key ?? "", value)}
            multiple={step.type === "multi_choice"}
          />
        );

      case "text_input":
      case "template_builder":
      case "real_task":
        return (
          <>
          <TextStep
            step={step}
            value={values[step.key ?? ""] ?? ""}
            onChange={(value) => api.setValue(step.key ?? "", value)}
            sampleText={step.type === "real_task" ? undefined : sampleText}
            onHint={api.showHint}
            hintsLeft={(step.hints?.length ?? 0) - api.hintIndex}
          />
          {/* 入れてはいけないものを、書き始める前に伝える（§15） */}
          <SafetyNote placement="input" />
          </>
        );

      case "prompt_preview": {
        const input = buildAiInput(step, values);
        const cards = Object.entries(input)
          .filter(([key, value]) => value && key !== "original_text")
          .map(([key, value]) => ({ label: LABELS[key] ?? key, value }));
        return (
          <PromptPreview
            cards={[
              { label: "やること", value: lesson.title },
              ...cards,
            ]}
            detail={buildDetail(lesson.title, input)}
          />
        );
      }

      case "ai_generate":
        return (
          <GeneratingCard
            busy={api.isSubmitting}
            message={
              api.isSubmitting
                ? (step.instruction ?? "AIが考えています…")
                : api.error
                  ? "もう一度おくってみましょう。"
                  : "送っています。"
            }
          />
        );

      case "result_review":
      case "result_compare":
      case "improvement_choice":
        if (meta.threeWay && runs.length >= 2) {
          return (
            <div>
              <ThreeWayCompare
                original={runs[0].inputText}
                first={runs[0].outputText}
                improved={runs[runs.length - 1].outputText}
                condition={values.condition ?? ""}
              />
              <SafetyNote placement="output" />
              <RunHistory runs={runs} />
            </div>
          );
        }
        return (
          <div>
            {lastRun && (
              <ResultCompare
                before={lastRun.inputText}
                after={lastRun.outputText}
                reviewPoints={meta.reviewPoints ?? ["元の意味が変わっていないか"]}
                factCheck={meta.factCheck}
              />
            )}
            {step.type === "improvement_choice" && (
              <div className="mt-6">
                <ChoiceStep
                  step={step}
                  value={values.improvement ?? ""}
                  onChange={(value) => api.setValue("improvement", value)}
                />
              </div>
            )}
            {/* AIの回答をそのまま信じないことを、結果のそばで伝える（§15） */}
            <SafetyNote placement="output" />
            <RunHistory runs={runs} />
          </div>
        );

      case "reflection":
        return (
          <div className="rounded-card border border-brand-line bg-surface p-5">
            <p className="text-sm leading-7">{step.poMessage}</p>
            <ul className="mt-4 space-y-2 text-sm leading-7" role="list">
              {lesson.outcomes.map((outcome) => (
                <li key={outcome}>・{outcome}</li>
              ))}
            </ul>
            {api.realTaskSkipped && (
              <p className="mt-4 text-xs text-ink-muted">
                自分の文章での練習は、あとからでも試せます。
              </p>
            )}
          </div>
        );

      case "completion":
        if (lesson.id === "diagnosis") {
          const ids = recommendLessons(values);
          return (
            <div data-testid="completion-view">
              <p className="text-sm leading-7 text-ink-muted">
                答えに近いものを3つ選びました。上から順に試すのがおすすめです。
              </p>
              <ol className="mt-4 space-y-3" role="list">
                {ids.map((id, index) => {
                  const target = lookupLesson(id);
                  if (!target) return null;
                  return (
                    <li
                      key={id}
                      data-testid={`recommended-${id}`}
                      className="rounded-card border border-brand-line bg-surface p-4"
                    >
                      <p className="text-xs text-brand-dark">おすすめ {index + 1}</p>
                      <h3 className="mt-1 text-base font-bold">{target.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-ink-muted">
                        {target.goal}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        }
        return (
          <CompletionView
            skills={lesson.learnedSkills ?? lesson.outcomes}
            outcomeText={lastRun?.outputText}
            outcomeLabel={
              api.realTaskSkipped ? "AIが書いた文章（練習）" : "AIが書いた文章"
            }
            lessonNumber={lesson.number}
            /*
              このレッスンぶんを足して数える。
              画面を出している時点ではまだ「完了」を記録していないので、
              足さないと「最後の1本を終えたのに 8/9」のままになる。
            */
            done={completedCount + (completedIds.includes(lesson.id) ? 0 : 1)}
            total={course.lessons.length}
            next={nextLessons}
            onSelectLesson={onSelectLesson}
          />
        );

      default:
        return null;
    }
  })();

  const onPrimary = () => {
    switch (step.type) {
      case "prompt_preview":
        // 送るのは次のステップ。ここは「この内容でよい」の意思表示だけ
        api.goNext();
        return;
      case "ai_generate":
        void send(runs.length === 0 ? "1回目" : undefined);
        return;
      case "improvement_choice":
        void send(values.improvement || "もう一度");
        return;
      case "quick_try":
      case "condition_choice":
      case "observation":
      case "concept_card":
        setRevealed(false);
        api.goNext();
        return;
      case "real_task":
        /*
          ここでは送らない。

          成果物ファーストの流れでは、このあと条件を聞き、prompt_preview で
          「こう伝えます」を見せてから generate_real で送る。
          ここで送ろうとしても、このステップに aiAction が無いため
          run() は即座に "busy" を返して**何も起きなかった**。
          押しても画面が動かないので、レッスンを最後まで進められなかった。
        */
        api.goNext();
        return;
      case "completion":
        if (lesson.id === "diagnosis") {
          // 診断の結果は端末に残す。次に開いたときも同じ順で出す
          saveRecommendations(recommendLessons(values));
          // 誰が来たかを実証実験で見るために送る。待たない
          void saveProfile({
            ai_experience: values.ai_experience ?? "",
            job_category: values.work_kind ?? "",
            pain_point: values.pain_point ?? "",
          });
        }
        api.complete();
        onFinish();
        return;
      default:
        setRevealed(false);
        api.goNext();
    }
  };

  const blockingIssue = api.issue?.blocking ? api.issue : null;

  return (
    <main className="min-h-screen">
      {/*
        抜け道は1つでよい。「＜」と「レッスン一覧へ」を両方置いていたが、
        行き先が同じものを2つ並べると、違う場所へ行くのだと思わせる。
      */}
      <AppHeader centered action={{ label: "レッスン一覧へ", onClick: onExit }} />

      <StepShell
        {...(step.type === "outcome_preview"
          ? {
              /*
                最初の画面だけ、見出しをレッスンそのものの名前にする。
                「今日つくるもの」は器の名前で、どのレッスンでも同じ。
                中身の名前を出さないと、開いた画面が何なのか分からない。
              */
              eyebrow: { icon: IconBook, label: `Lesson ${lesson.number}` },
              title: lesson.outcomeTitle ?? lesson.title,
              instruction: lesson.outcomeDescription ?? step.instruction,
            }
          : { title: step.title, instruction: step.instruction })}
        progress={api.progress}
        phase={step.phase}
        po={api.po}
        summary={api.summary}
        onEditSummary={api.goTo}
        primaryLabel={PRIMARY_LABEL[step.type] ?? "次へ"}
        onPrimary={onPrimary}
        primaryDisabled={Boolean(blockingIssue)}
        hintNearButton={api.issue?.reason ?? null}
        error={api.error}
        onBack={api.canBack ? api.goBack : undefined}
        secondary={
          step.type === "real_task"
            ? { label: "今回はスキップする", onClick: api.skipRealTask }
            : step.type === "completion"
              ? // 同じレッスンをもう一度。身についたか確かめたい人の逃げ道
                { label: "もう一度試す", onClick: api.restart }
              : step.skippable
                ? { label: "解説を飛ばす", onClick: api.skipConcept }
                : undefined
        }
        busy={api.isSubmitting}
      >
        {body}
      </StepShell>

      {api.findings.length > 0 && (
        <PrivacyDialog
          findings={api.findings}
          onEdit={api.dismissFindings}
          /*
            自分の文章のステップは AI へ送らない。ここで run() を呼んでも
            送るものが無く、ダイアログから出られなくなる。
            そのステップだけ「読んだうえで次へ」に振り分ける。
          */
          onSend={() =>
            step.type === "real_task" ? api.continueAnyway() : void confirmAndSend()
          }
        />
      )}
    </main>
  );
}

/** 依頼内容のカードに出す見出し。専門用語を使わない。 */
const LABELS: Record<string, string> = {
  audience: "読む相手",
  tone: "表現",
  length: "長さ",
  purpose: "まとめる目的",
  format: "出力の形",
  style: "説明のしかた",
  example: "具体例",
  criteria: "比べる基準",
  priority: "いちばん大事にしたいこと",
  as_table: "表にするか",
  deadline: "期限",
  available_time: "使える時間",
  avoid: "避けたいこと",
  improvement: "直したい方向",
  topic: "知りたいこと",
  goal: "達成したいこと",
  options_text: "比べたいもの",
};

/** 詳細表示に出す文面。サーバーが組み立てるものと同じ形にそろえる。 */
function buildDetail(title: string, input: Record<string, string>): string {
  const lines = [`やること: ${title}`, ""];
  for (const [key, value] of Object.entries(input)) {
    if (!value || key === "original_text") continue;
    lines.push(`- ${LABELS[key] ?? key}: ${value}`);
  }
  if (input.original_text) {
    lines.push("", "--- 対象 ---", input.original_text);
  }
  return lines.join("\n");
}
