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

import { IconBook } from "../components/Icons";
import { PrivacyDialog } from "../components/course/PrivacyDialog";
import { LessonHeader } from "../components/course/LessonHeader";
import { StepRenderer } from "../components/course/StepRenderer";
import { StepShell } from "../components/course/StepShell";
import { useCourse } from "../course/live";
import { buildAiInput } from "../course/engine";
import { promptEntryFor } from "../course/promptSummary";
import { savePrompt } from "../course/promptLibrary";
import { useKeeping } from "../course/keeping";
import {
  AUTO_ADVANCE_MS,
  canAutoAdvance,
  isAnswered,
} from "../course/autoAdvance";
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
  /** コース完走の締めくくりから「次のコースを見る」を押したとき。 */
  onOpenCourseCatalog?: () => void;
  /** 「やり方をくわしく見る」を押したとき。 */
  onOpenRecipe?: (tipId: string) => void;
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
  onOpenCourseCatalog,
  onOpenRecipe,
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
  /* 帳面にしまえるのは登録した人だけ（course/keeping.ts）。 */
  const { canKeep } = useKeeping();
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

  /*
    「なおす」で戻ってきた回。

    サマリーの「なおす」は、その質問へ戻すだけだった。戻った先には
    前の答えがそのまま残っているので、下の自動送りが「もう答えてある」と
    判断して 500ms で次へ送ってしまう。**押しても何も起きない**ように
    見えて、答えを直せない。実際に3問とも素通りしていた。

    そこで「戻ってきた回で、答えがまだ変わっていない間」だけ自動送りを
    止める。止めるのはそこだけで、別の札を押した瞬間からは
    ふだんどおり自動で進む——直したあとにもう一度「次へ」を
    押させるのでは、直す前より手間が増える。

    答えを先に消す方法は採らない。いま何を選んでいるかを見ながら
    選び直せるほうが、選び直しやすい。
  */
  const [editing, setEditing] = useState<{ stepId: string; value: string } | null>(
    null,
  );

  const editSummary = (stepId: string) => {
    const target = lesson.steps.find((entry) => entry.id === stepId);
    const current = target?.key ? (values[target.key] ?? "") : "";
    setEditing({ stepId, value: current });
    api.goTo(stepId);
  };

  // その回から離れたら、覚えていた印は捨てる。
  // 残すと、あとで同じ回に来たときに理由もなく自動送りが止まる
  useEffect(() => {
    if (editing && editing.stepId !== step.id) setEditing(null);
  }, [editing, step.id]);

  const answerNow = step.key ? (values[step.key] ?? "") : "";
  const holdingForEdit =
    editing !== null && editing.stepId === step.id && editing.value === answerNow;

  /*
    選ぶだけの回は、選んだら自動で次へ送る（Learning UX §3）。

    どの回を送ってよいかは autoAdvance.ts が決める。とくに
    「次がAIを呼ぶ回」では送らない——札を1つ触っただけでお金のかかる
    要求が飛ぶことになり、迷って押し直すたびに課金される。

    片付けで時計を止めるのが要。手で「次へ」を押して先に進んだときは、
    この回そのものが消えるので時計も止まり、二重に進まない。
  */
  const autoAdvancing =
    canAutoAdvance(lesson, step) && isAnswered(step, values) && !holdingForEdit;

  /*
    受け取ったことを返す文。

    作文はせず、**選んだ答えそのもの**を出す。教材が選択肢の言葉を
    持っているので、値ではなく人が読める側を探して使う。
  */
  const chosen = step.key ? (values[step.key] ?? "").trim() : "";
  const chosenLabel =
    step.options?.find((option) => option.value === chosen)?.label || chosen;
  const doneLabel = autoAdvancing && chosenLabel ? `「${chosenLabel}」で進みます` : null;

  useEffect(() => {
    if (!autoAdvancing) return;
    const timer = window.setTimeout(() => {
      setRevealed(false);
      api.goNext();
    }, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
    // 回か答えが変わったときだけ引き直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdvancing, step.id, step.key ? values[step.key] : ""]);

  const confirmAndSend = async () => {
    const outcome = await api.run({ force: true });
    if (outcome === "sent") api.goNext();
  };

  /*
    レッスンを終えたことを記録する。

    「完了する」ボタン（下の onPrimary の completion 分岐）と、
    完了画面の「次のコースを見る」ボタンの、両方から呼ぶ。

    どちらも同じ画面（完了ステップ）に出ている、対等な出口。
    片方だけに記録を結びつけると、もう片方から出た人の
    「終えた」が端末にもサーバーにも残らない——実際にこの形で
    見つかった（E2E で、8/9 のまま次のコースへ渡ってしまっていた）。

    2回呼ばれても壊れない。`markCompleted` は集合なので、
    同じ id を足しても増えない。
  */
  const finalizeCompletion = () => {
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
      onOpenCourseCatalog={
        onOpenCourseCatalog
          ? () => {
              finalizeCompletion();
              onOpenCourseCatalog();
            }
          : undefined
      }
      /*
        くわしい説明へ出るのも、完了画面からの**出口**の1つ。
        ここで記録を確定しないと、この道から出た人のぶんだけ
        完了が残らない（「次のコースを見る」で実際に起きた）。
      */
      onOpenRecipe={
        onOpenRecipe
          ? (tipId: string) => {
              finalizeCompletion();
              onOpenRecipe(tipId);
            }
          : undefined
      }
    />
  );

  const onPrimary = () => {
    switch (step.type) {
      case "prompt_preview":
        /*
          自分で組み立てた依頼を、帳面へしまう。

          しまうのはここ。「この内容でよい」と押した瞬間が、条件の
          決まった唯一の時点になる。完了画面のコピーボタンに任せると、
          押さずに閉じた人には何も残らない。

          本文は入れない（promptSummary が外している）。指示は次も使えるが、
          そのときの文章は一度きり。
        */
        // ゲストには溜めない。7日で鍵が切れるので、帳面ごと消える
        if (canKeep) savePrompt(promptEntryFor(lesson, buildAiInput(step, values)));
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
        finalizeCompletion();
        onFinish();
        return;
      default:
        setRevealed(false);
        api.goNext();
    }
  };

  const blockingIssue = api.issue?.blocking ? api.issue : null;

  return (
    <>
      {/*
        レッスン中は、ロゴではなく**いま何をしているか**を上に出す。
        ロゴは開いた瞬間に一度見れば足り、19歩のあいだ出しておく価値は無い。

        左の「←」は1歩戻る、右の「×」は出る。行き先が違うので分けてある。
        前は右上の「レッスン一覧へ」と画面下の「もどる」に散っていて、
        どちらがどこへ行くのか押すまで分からなかった。

        `<main>` の**外**に置くこと。中に入れると「本文の中のボタン」に
        なり、教材の選択肢を探す仕組み（E2E も含む）が拾ってしまう。
        実際それでレッスンから勝手に出ていた。帯は本文ではない。
      */}
      <LessonHeader
        title={lesson.title}
        onBack={api.canBack ? api.goBack : undefined}
        onExit={onExit}
        /*
          診断は受けなくても先へ進める。出ることが「スキップ」と同じ
          意味になるので、そこだけ言葉で出す。
        */
        exitLabel={lesson.id === "diagnosis" ? "スキップ" : undefined}
      />

      <main className="min-h-screen">

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
        onEditSummary={editSummary}
        primaryLabel={PRIMARY_LABEL[step.type] ?? "次へ"}
        onPrimary={onPrimary}
        primaryDisabled={Boolean(blockingIssue)}
        hintNearButton={api.issue?.reason ?? null}
        error={api.error}
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
        // 終わったあとだけ、逃げ道も同じ大きさで並べる（どちらも正しい行き先）
        secondaryProminent={step.type === "completion"}
        /*
          自動で進む回では、下のボタンに「送っています」ではなく
          進む合図を出す。押さなくてよいことが、押す前に分かる。
        */
        autoAdvancing={autoAdvancing}
        doneLabel={doneLabel}
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
    </>
  );
}
