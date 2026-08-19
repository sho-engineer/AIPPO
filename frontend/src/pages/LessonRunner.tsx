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

import { AppHeader } from "../components/AppShell";
import { IconBook } from "../components/Icons";
import { PrivacyDialog } from "../components/course/PrivacyDialog";
import { StepRenderer } from "../components/course/StepRenderer";
import { StepShell } from "../components/course/StepShell";
import { useCourse } from "../course/live";
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

  const body = (
    <StepRenderer
      lesson={lesson}
      api={api}
      course={course}
      completedIds={completedIds}
      revealed={revealed}
      setRevealed={setRevealed}
      onSelectLesson={onSelectLesson}
    />
  );

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
        /*
          解説の回は、カード本文とポーの台詞が同じ文になる（教材データが
          同じ文字を持っている）。同じことを2回言うと、2つ別のことが
          書いてあるのかと読んでしまう。ここだけ吹き出しを下げる。
        */
        showPo={step.type !== "concept_card"}
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
