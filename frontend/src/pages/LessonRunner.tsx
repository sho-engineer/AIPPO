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
import { DayCompletePage } from "../components/course/DayCompletePage";
import { LessonHeader } from "../components/course/LessonHeader";
import { LessonPaused } from "../components/course/LessonPaused";
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
import { poAppearance } from "../course/poPresence";
import { primaryLabel } from "../course/primaryLabel";
import { nextLessons } from "../course/availability";
import { dayOutcomeLine } from "../course/dayOutcome";
import { recommendLessons, saveRecommendations } from "../course/recommend";
import { saveProfile } from "../api/diagnosis";
import { useCompletedLessons } from "../course/progress";
import { useCourseLesson } from "../course/useCourseLesson";
import { FailureRescue } from "../components/course/FailureRescue";
import { rescuePaths, type RescuePath } from "../course/rescue";
import { sendLearningEvent } from "../api/lesson";
import type { Lesson } from "../course/types";

/**
 * この教材が持っている例文。
 *
 * 置き場は最初の回（`quick_try`）の `meta.sampleText`。詰まった人へ
 * 渡すのも同じものにする——別に用意すると、画面によって違う文章が
 * 出て「さっきのと違う」が起きる。
 */
function lessonSample(lesson: Lesson): string | undefined {
  const first = lesson.steps.find((step) => step.type === "quick_try");
  return (first?.meta as { sampleText?: string } | undefined)?.sampleText;
}

export interface LessonRunnerProps {
  lesson: Lesson;
  /**
   * レッスンから出る。
   *
   * 帯の「×」と、Day 完了の画面の「コースに戻る」。行き先は
   * そのレッスンが入っているコースの中身。
   *
   * 前はここに `onFinish`（＝ホームへ）もあった。完了の1押しで
   * ホームまで飛ばしていたが、いまは Day 完了の画面が受け止め、
   * 次のレッスンかコースかを**その人が選ぶ**。押した先が
   * どこか分からないまま飛ばされる道は無くした。
   */
  onExit: () => void;
  /**
   * このレッスンが入っているコースの中身をひらく。
   *
   * Day 完了の「コースに戻る」。`onExit`（来た道を1つ戻る）とは
   * 分ける——ホームから直接1本を開いた人は、`onExit` だと
   * ホームへ帰る。**ボタンに「コースに戻る」と書いてあるのに
   * ホームへ着く**のは、行き先を約束していないのと同じ。
   */
  onOpenCourse: () => void;
  /** 完了画面から次のレッスンへ直接移る。行き止まりにしないため。 */
  onSelectLesson?: (lessonId: string) => void;
  /** コース完走の締めくくりから「次のコースを見る」を押したとき。 */
  onOpenCourseCatalog?: () => void;
  /** 「やり方をくわしく見る」を押したとき。 */
  onOpenRecipe?: (tipId: string) => void;
}

export function LessonRunner({
  lesson,
  onExit,
  onOpenCourse,
  onSelectLesson,
  onOpenCourseCatalog,
  onOpenRecipe,
}: LessonRunnerProps) {
  const api = useCourseLesson(lesson);
  const { step, values, runs } = api;
  const [revealed, setRevealed] = useState(false);

  /*
    Day を終えた画面を出しているか。

    完了画面の「完了する」を押した先。**別の画面**であって、
    完了画面の上に重ねる飾りではない（`DayCompletePage.tsx` の冒頭）。
    帯の「←」で完了画面へ戻れる——祝われて行き止まり、にしない。
  */
  const [celebrating, setCelebrating] = useState(false);

  /*
    完了画面で使う、コース全体の進み具合と次の行き先。
    端末に残っている分と、サーバーが数えている分の両方から取る。
  */
  const course = useCourse();
  const completedIds = useCompletedLessons();
  /* 次の1本。絞り方は完了画面の「次におすすめ」と共通（availability.ts） */
  const upcoming = nextLessons(course.lessons, lesson.id, completedIds);
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
        /*
          レッスンを終える。押した先は Day 完了の画面。

          記録はここで確定する。祝いの画面から先に何を選んでも
          （次のレッスン・コースに戻る・帯の×）、終えたことは残る。
        */
        finalizeCompletion();
        setCelebrating(true);
        return;
      default:
        setRevealed(false);
        api.goNext();
    }
  };

  const blockingIssue = api.issue?.blocking ? api.issue : null;

  /*
    ポーを出す場面か。決め方は course/poPresence.ts に1か所でまとめてある。
    ヒントを出しているかは、ポーの動き（`show_hint`）で分かる——
    ヒントは押されて初めて出るので、状態としては動きの側に乗っている。
  */
  const po = poAppearance({
    stepType: step.type,
    busy: api.isSubmitting,
    failed: Boolean(api.error),
    hinting: api.po.action === "show_hint",
  });

  /*
    今日はここまで。押し直せば直る失敗とは扱いを分ける
    （`components/course/LessonPaused.tsx` 参照）。

    止まり方は2つある。**その人の分**を使い切った（`out_of_credits`）のと、
    サービス全体が今日の上限に達した（`limit`）の。画面の見た目は同じでも、
    次にできることが違う——前者は登録すれば続けられ、後者は登録しても
    増えない。取り違えると「登録したのに進めない」になるので、
    どちらなのかを画面へ渡す。
  */
  const pausedForToday =
    step.type === "ai_generate" &&
    (api.errorKind === "limit" || api.errorKind === "out_of_credits");

  /*
    詰まった。**行き止まりにしない。**

    出るのは「もう一度」1本ではなく、押した先が本当にある道を並べる
    （`course/rescue.ts` が決める）。出す条件は「AIを呼ぶ回で失敗した」
    ——今日はここまで（上限）とは別で、あちらは別の画面が持つ。
  */
  const stuck =
    step.type === "ai_generate" &&
    !pausedForToday &&
    (api.errorKind === "failed" || api.errorKind === "unusable");

  /*
    どこへ戻れば直せるか。

    自由入力の回（自分の文章）まで戻る。無ければ、最初に条件を
    選んだ回。**戻った先に必ず操作があること**が要で、無い回へ
    戻すと、押した人はまた同じ画面へ進むしかない。
  */
  const editableStep =
    [...lesson.steps]
      .slice(0, lesson.steps.findIndex((entry) => entry.id === step.id) + 1)
      .reverse()
      .find((entry) => entry.type === "real_task" || entry.type === "text_input") ??
    null;

  const rescue = rescuePaths({
    kind: api.errorKind ?? "failed",
    step,
    sampleText: lessonSample(lesson),
    hintsLeft: (step.hints?.length ?? 0) - api.hintIndex,
    editable: editableStep !== null,
  });

  const takeRescue = (path: RescuePath) => {
    switch (path.id) {
      case "retry":
        void send();
        return;
      case "sample":
        /*
          例文を入れて、そのまま送る。**成功体験まで連れていく。**
          欄へ入れるだけで止めると、詰まっている人はもう一度
          「送る」を探すことになる。
        */
        void sendLearningEvent({
          lessonId: lesson.id,
          eventType: "sample_fallback_used",
          step: step.id,
        });
        void api.useSample(lessonSample(lesson) ?? "").then((outcome) => {
          if (outcome === "sent") api.goNext();
        });
        return;
      case "adjust":
        // 書き直せる回まで戻す。戻った先には前の文章が残っている
        if (editableStep) api.goTo(editableStep.id);
        return;
      case "hint":
        api.showHint();
        return;
    }
  };

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
        /*
          祝いの画面からは、完了画面へ1歩戻る。

          成果物を写し忘れた・アンケートに答えたい、はここでしか
          戻れない。祝って行き止まり、にはしない。
        */
        onBack={
          celebrating
            ? () => setCelebrating(false)
            : api.canBack
              ? api.goBack
              : undefined
        }
        onExit={onExit}
        /*
          診断は受けなくても先へ進める。出ることが「スキップ」と同じ
          意味になるので、そこだけ言葉で出す。
        */
        exitLabel={lesson.id === "diagnosis" ? "スキップ" : undefined}
      />

      {/*
        高さは中身が決める。ここでは何も足さない。

        前は `min-h-screen`（＝画面の高さ）だった。帯（44px）の**下**に
        置いた面に画面まるごとの高さを与えていたので、中身が何も無くても
        44px はみ出す。Pixel 5 で測ると、レッスン15画面のうち8画面は
        「ぴったり 44px はみ出す」状態で、原因はここ1か所だった。

        いまは中の画面がそれぞれ `calc(100dvh - 2.75rem)` を取る。
      */}
      <main>

      {celebrating ? (
        <DayCompletePage
          day={lesson.number}
          /*
            できるようになったことを1行だけ。組み立て方と、その理由は
            `course/dayOutcome.ts`。
          */
          outcome={dayOutcomeLine(lesson)}
          /*
            技の名前。サーバーが返す `award.skills` は slug なので出せない
            （表示名は図鑑が持っている）。教材データが持っている
            読める名前をそのまま使う。
          */
          skill={lesson.learnedSkills?.[0]}
          nextDay={upcoming[0]?.number}
          /*
            次の行き先。押した先が本当にある道だけを出す。
            次の1本が無ければコースを終えたということなので、
            コース一覧へ渡す。それも無ければ、この段ごと出さない
            （「コースに戻る」は必ず残る）。
          */
          primary={
            upcoming[0] && onSelectLesson
              ? {
                  label: "次のレッスンへ",
                  onClick: () => onSelectLesson(upcoming[0].id),
                }
              : onOpenCourseCatalog
                ? { label: "次のコースを見る", onClick: onOpenCourseCatalog }
                : undefined
          }
          onBackToCourse={onOpenCourse}
        />
      ) : pausedForToday ? (
        <LessonPaused
          po={api.po}
          lessonId={lesson.id}
          canRegisterForMore={api.errorKind === "out_of_credits"}
          /*
            今日できるようになったこと。**通り終えた区切りだけ**を渡す。
            いまいる区切りはまだ途中なので入れない。
          */
          done={api.missions.missions
            .slice(0, Math.max(0, api.missions.current - 1))
            .map((mission) => mission.label)}
          /*
            登録できたので、そのまま続きを送る。登録した人の文章は
            持ち分ではなく登録済みの枠で数えるので、これで通る。
          */
          onResume={() => void send()}
          onExit={onExit}
        />
      ) : stuck ? (
        /*
          詰まった。**「もう一度」1本で終わらせない。**

          押した先が本当にある道だけを並べる。3回押して同じ画面を
          見た人はそこでやめる——特に「同じ頼み方ではまた同じになる」
          種類の失敗（`unusable`）では、押し直しは道ではない。
        */
        <div className="page">
          <FailureRescue
            kind={api.errorKind ?? "failed"}
            paths={rescue}
            onChoose={takeRescue}
            po={api.po}
          />
        </div>
      ) : (
        <>
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
        missions={api.missions.missions}
        currentMission={api.missions.current}
        phase={step.phase}
        po={api.po}
        summary={api.summary}
        onEditSummary={editSummary}
        primaryLabel={primaryLabel(step)}
        onPrimary={onPrimary}
        primaryDisabled={Boolean(blockingIssue)}
        hintNearButton={api.issue?.reason ?? null}
        error={api.error}
        secondary={
          /*
            主導線の終わり。ここから先は任意。

            「自分の文章で試す」は続き、「次のレッスンへ」は
            まとめの画面へ飛ぶ。**どちらも本当に終われる**
            ——押した先が無いほうを置くと、任意にした意味が消える。
          */
          step.id === "real_task_intro"
            ? { label: "次のレッスンへ", onClick: api.finishEarly }
            : step.type === "real_task"
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
          ポーを出すかどうか。

          決め方は course/poPresence.ts に1か所でまとめてある。
          前はここで「解説カードでなく、失敗もしていなければ出す」と
          書いていた——つまり**19画面中17画面に居た**。毎画面に居ると、
          居ること自体が何も言わなくなる。

          失敗しているときは、いまは**出す**（顔は warning）。
          吹き出しの文は `api.po` が持っているが、失敗の詳しい話は
          下のエラー欄が1度だけ言う担当なので、そちらと重ならない。
        */
        showPo={po !== null}
        poSpeaks={po?.speaks ?? false}
        poScene={po?.scene}
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
        </>
      )}
      </main>
    </>
  );
}
