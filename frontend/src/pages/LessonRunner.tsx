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
import { MoreSheet } from "../components/course/MoreSheet";
import { PrimaryButton } from "../components/aippo/PrimaryButton";
import {
  SectionTransition,
  type SectionImage,
} from "../components/course/SectionTransition";
import { SkillStampCard } from "../components/course/SkillStampCard";
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
import { poAppearance, PO_SIZE_BY_SCENE } from "../course/poPresence";
import { primaryLabel } from "../course/primaryLabel";
import { nextLessons } from "../course/availability";
import { dayOutcomeLine } from "../course/dayOutcome";
import {
  recommendLesson,
  recommendLessons,
  saveRecommendations,
} from "../course/recommend";
import { saveProfile } from "../api/diagnosis";
import { useCompletedLessons } from "../course/progress";
import { useCourseLesson } from "../course/useCourseLesson";
import { FailureRescue } from "../components/course/FailureRescue";
import { rescuePaths, type RescuePath } from "../course/rescue";
import { sendLearningEvent } from "../api/lesson";
import type { Lesson } from "../course/types";

/**
 * その章扉が持っている絵。
 *
 * 絵は教材データ（`catalog.ts` の `sections`）が持ち、骨格が章扉の
 * ステップへ運んでくる。**画面側から別の表を引きに行かない**——
 * 引きに行く形だと、章扉を足したのに絵の表へ書き忘れた日に、
 * 絵の無い章扉が黙って出る（画面を見るまで気づけない）。
 */
function sectionImage(step: Lesson["steps"][number]): SectionImage | null {
  const image = (step.meta as { image?: SectionImage } | undefined)?.image;
  return image?.src ? image : null;
}

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
    導入の一枚を、もう出したか。

    最初の画面（`outcome_preview`）は、進んで戻ってくるたびに作り直され
    る。そこに置くと**戻るたびに導入が出る**——自分で戻ってきた人に
    「今日やること」をもう一度かぶせる形になる。

    出すのは**レッスンを開いた1回**。ここはレッスン1本につき1度しか
    作られないので、覚えるならこの高さになる。閉じてから開き直せば
    また出る（そのときは新しいレッスン開始）。
  */
  const [introSeen, setIntroSeen] = useState(false);

  /*
    Day を終えた画面を出しているか。

    完了画面の「完了する」を押した先。**別の画面**であって、
    完了画面の上に重ねる飾りではない（`DayCompletePage.tsx` の冒頭）。
    帯の「←」で完了画面へ戻れる——祝われて行き止まり、にしない。
  */
  const [celebrating, setCelebrating] = useState(false);

  /*
    スタンプ台紙を出しているか。

    「覚えた」を押した直後に1枚だけ挟む。**進む先は変わらない**
    ——閉じれば次の画面へ行く。ここで止めるのは、集まっていく形を
    見せる 1〜2 秒ぶんだけ。

    値は「いま押す技が、そのレッスンの何個目か」。`null` は出さない。
    番号を持つのは、閉じたあとに次の技を取ったとき**別の台紙として
    描き直す**ため（同じ値のままだと、押す動きが再生されない）。
  */
  const [stamping, setStamping] = useState<number | null>(null);

  /*
    診断を途中でやめようとしているか。

    「×」を押しただけでは消さない。ここまでの答えは端末に残るので、
    **消えるのは画面だけ**——それを言ってから決めてもらう。
  */
  const [leaving, setLeaving] = useState(false);

  /*
    そのレッスンで覚える技を、出てくる順に。

    **教材データから数える。** サーバーには聞かない——通信が失敗
    しても、覚えたこと自体は変わらないし、台紙に出すのは「このレッスン
    の中で何個目か」だけなので、手元のデータで足りる。

    AI技図鑑（`skillDex`）が持っているのは**通算で覚えた技**で、
    別の話。あちらを使うと、2回目に開いたレッスンで最初から全部
    押されている台紙が出る。
  */
  const skillOrder = lesson.steps
    .filter((each) => each.type === "concept_card" && each.skill)
    .map((each) => each.skill as string);

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
    サマリーの「なおす」。その回へ移すだけ。

    前はここで「戻ってきた回と、そのときの答え」を覚えていた
    （`editing` / `holdingForEdit`）。戻った瞬間に自動送りが走るのを
    止めるための細工で、**「なおす」から戻ったときにしか効かなかった**
    ——帯の「←」で戻った人は、そのまま送られていた。

    いまは下の `arrivedWith` が、どの道で戻ってきても同じように働く。
    細工はもう要らない。
  */
  const editSummary = (stepId: string) => api.goTo(stepId);

  const answerNow = step.key ? (values[step.key] ?? "") : "";

  /*
    ここまでに答えた数。**「×」を確かめるかどうか**だけに使う。

    1問も答えていない人に「ここまでの回答は保存されています」と
    出しても、保存されているものが無い。
  */
  const answeredSoFar = lesson.steps.filter(
    (each) => each.key && (values[each.key] ?? "").trim(),
  ).length;

  /*
    いま何問目か。**答えを持つ回だけ**を数える。

    入りと結果は問いではないので、そこでは番号を出さない。
    診断の帯（`LessonProgress`）に渡す。
  */
  const questions = lesson.steps.filter((each) => each.key);
  const questionCount = questions.length;
  const questionAt = questions.findIndex((each) => each.id === step.id);

  /*
    この回に**入ってきたときの答え**。

    自動送りの引き金をここに変えた。前は `isAnswered`——つまり
    「答えが入っているか」だけを見ていた。あれは**保存されている値の
    性質**であって、人が何かをした証ではない。だから2つ壊れていた。

      1. 札を押した瞬間に値が入る → 500ms で次へ送られ、
         何を選んだのか確かめられない
      2. **前の回へ戻ると、そこには前の答えが残っている** → 入った
         瞬間に「答えてある」と読まれ、また送られる。押しても押しても
         戻れない（診断で実際にそうなった）

    いま見るのは「**この回にいるあいだに答えが変わったか**」。
    戻ってきただけでは変わらないので送らない。別の札を押せば変わるので、
    そこからはこれまでどおり自動で進む。

    答えの復元と、人が選んだことは別のできごと——それを型の上で
    分けたのがここ。
  */
  const [arrivedWith, setArrivedWith] = useState<{ stepId: string; value: string }>({
    stepId: step.id,
    value: answerNow,
  });
  useEffect(() => {
    setArrivedWith({
      stepId: step.id,
      value: step.key ? (values[step.key] ?? "") : "",
    });
    // 回が変わったときだけ取り直す。答えが変わったからではない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  const changedHere =
    arrivedWith.stepId === step.id && answerNow !== arrivedWith.value;

  /*
    選ぶだけの回は、選んだら自動で次へ送る（Learning UX §3）。

    どの回を送ってよいかは autoAdvance.ts が決める。とくに
    「次がAIを呼ぶ回」では送らない——札を1つ触っただけでお金のかかる
    要求が飛ぶことになり、迷って押し直すたびに課金される。

    片付けで時計を止めるのが要。手で「次へ」を押して先に進んだときは、
    この回そのものが消えるので時計も止まり、二重に進まない。
  */
  const autoAdvancing =
    canAutoAdvance(lesson, step) && isAnswered(step, values) && changedHere;

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
      void saveProfile(values);
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
      introSeen={introSeen}
      onIntroSeen={() => setIntroSeen(true)}
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
      case "concept_card":
        /*
          技を受け取る回だけ、進む前に台紙を1枚挟む。

          「覚えた」で画面がすぐ切り替わると、取ったものが**次の画面
          に押し流される**。その日の何個目なのか、あと何個で揃うのかも
          どこにも出ない。台紙はそこだけを見せて、閉じれば進む。

          解説を並べただけの回（`skill` が無い）は素通り。あそこは
          読み物で、取るものが無い。
        */
        if (step.skill) {
          const at = skillOrder.indexOf(step.skill);
          if (at >= 0) {
            setStamping(at);
            return;
          }
        }
        setRevealed(false);
        api.goNext();
        return;
      case "quick_try":
      case "condition_choice":
      case "observation":
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
          診断の結果は、**そのままおすすめの1本へ入る**。

          祝いの画面（Day 完了）には行かない。診断は Day ではないし、
          あそこは「1日やり切った」を受け止める場所。診断で受け取った
          のは次にやることなので、押した先はその1本にする。
        */
        if (lesson.id === "diagnosis") {
          finalizeCompletion();
          if (onSelectLesson) onSelectLesson(recommendLesson(values));
          else onOpenCourse();
          return;
        }
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
    /* 技を受け取る回だけは、解説カードでもポーが出る */
    skill: step.type === "concept_card" && Boolean(step.skill),
    diagnosis: lesson.id === "diagnosis",
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
        /*
          診断の途中は、押した先を確かめてから出す。

          前はここが「スキップ」という文字で、押すと**その場で消えて
          いた**。5問のうち3問答えたところで指が触れると、そこまでの
          手が黙って消える。行き先も「飛ばす」なのか「閉じる」なのか
          読めない。

          いまはレッスンと同じ「×」にして、答え始めていたら一度だけ
          確かめる（`leaving`）。何も答えていなければ、そのまま出す
          ——確かめる中身が無い。
        */
        onExit={() => {
          /*
            結果まで着いた人には確かめない。**途中で出るときだけ。**

            「診断を終了しますか？」は「ここでやめると中途半端になる」を
            伝えるための一言で、答え終わった人にはもう当てはまらない。
            読み終えて閉じるだけの操作に、毎回1枚挟むことになる。
          */
          const midway =
            lesson.id === "diagnosis" &&
            step.type !== "completion" &&
            answeredSoFar > 0;
          if (midway) setLeaving(true);
          else onExit();
        }}
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
      ) : step.type === "section_transition" ? (
        /*
          章扉。**`StepShell` に入れない。**

          あの枠は「進み具合・見出し・ポー・中身・下の帯」を積むもので、
          ここに要るのは絵1枚と「つづける」だけ。枠に入れると、絵の中に
          焼き込まれている題がもう一度外に出て、同じ言葉が1画面に2回
          並ぶ（しかも絵に使える高さがその分だけ減る）。
        */
        <SectionTransition
          title={step.title}
          /*
            絵は**その章扉のステップ自身が持っている**（教材データの
            `sections` から運ばれてくる）。別の表を引きに行かない。
          */
          image={sectionImage(step)}
          onContinue={onPrimary}
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
        {...(lesson.id === "diagnosis" && step.type === "completion"
          ? {
              /*
                見出しは「診断の結果」。中身の1つ目が「いまの現在地」
                なので、上でも同じ言葉を使うと1画面に2回並ぶ。
              */
              title: "診断の結果",
            }
          : step.type === "concept_card" && step.skill
          ? {
              /*
                技を受け取る回は、見出しを「新しいAI技」にする。

                教材データの見出しは技の名前そのもの（「トーン指定」）で、
                画面の真ん中にも同じ名前が大きく出る。**同じ言葉が
                1画面に2回**並ぶので、上は場面の名前にする。
              */
              title: "新しいAI技",
            }
          : step.type === "outcome_preview"
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
        /*
          診断の帯だけ、言い方を変える。

          区切りの名前は教材の骨格から来ていて、診断では「試す」
          「自分で使う」と出ていた。聞かれているのは自分のことなのに、
          何かを試している最中に見える。結果の画面に至っては
          「自分で使う 2 / 2」で、何が 2 / 2 なのか読み取れない。

          代わりに、いま何問目かを出す。5問だと最初に言ってあるので、
          この数だけが「あとどれくらいか」を正しく答える。
        */
        label={lesson.id === "diagnosis" ? "" : undefined}
        count={
          lesson.id === "diagnosis"
            ? questionAt >= 0
              ? `質問 ${questionAt + 1} / ${questionCount}`
              : ""
            : undefined
        }
        currentMission={api.missions.current}
        phase={step.phase}
        /*
          表情は、場面のほうが強いときだけ差し替える
          （`poPresence` の `emotion`）。ふだんは教材データに従う。
        */
        po={po?.emotion ? { ...api.po, emotion: po.emotion } : api.po}
        /*
          成果物を出す回の終わりでは、答えた内容の畳みを出さない。

          「ここまでに答えた内容」は**次の答えを決めるための持ち物**で、
          もう答え終わった画面には要らない。畳んであっても見出しの行だけで
          34px 取り、その分だけ成果物が押し出される（iPhone の Safari で
          実際にはみ出した）。中身は「このレッスンの記録」の一枚にある。

          **診断は別。** あそこは結果画面が `completion` で、答えを
          直す「なおす」がこの畳みの中にしか無い。消すと直す道が
          消える（e2e/diagnosisEdit.spec.ts が捕まえた）。
          成果物を持たない回では、そもそも押し出す相手がいない。

          結果を見て答える回（`observation`）も同じ。あそこで決めるのは
          **いま返ってきたものについて**で、前に答えた内容は判断材料に
          ならない。34px はそのまま、読ませたいAIの結果から引かれる。
        */
        summary={
          (step.type === "completion" && lesson.usesAi) ||
          step.type === "observation" ||
          /*
            枠を埋める回（診断のミニ問題）も出さない。畳んであっても
            見出しの行だけで 34px 取り、そのぶん枠が下へ押し出される
            ——3つの枠と選択肢で埋まる画面なので、34px がそのまま
            はみ出しになる。前に答えた内容は、ここでの判断材料でもない。
          */
          step.type === "assemble" ||
          /*
            診断の**質問の画面**では出さない。質問そのものを主役に
            する——畳んであっても見出しの行だけで 34px 取り、5問とも
            同じだけ質問と選択肢を下へ押す。

            **結果の画面には残す。** ここの「なおす」が、答えを直す
            唯一の道になっている（一度これごと消して、直す道が
            消えた——`e2e/diagnosisEdit.spec.ts` が10件とも落ちた）。
          */
          /*
            診断では、この行を**どの画面にも出さない。**

            結果の画面にだけ残していたが、結果を見に来た人のいちばん上に
            「ここまでに答えた内容（5件）」が畳まれて場所を取る形で、
            自分の答えが結果より先に目に入っていた。答えの一覧と
            「なおす」は「くわしく見る」の一枚の中へ移した
            （`DiagnosisResult.tsx`）。
          */
          lesson.id === "diagnosis" ? [] : api.summary
        }
        onEditSummary={editSummary}
        primaryLabel={
          lesson.id === "diagnosis" && step.type === "completion"
            ? /*
                「おすすめLessonから始める」をやめた。日本語の中に
                Lesson が挟まって読みにくく、押す前に一度立ち止まる。
                押した先は上のカードに書いてあるので、ここは短くてよい。
              */
              "ここから始める"
            : primaryLabel(step)
        }
        onPrimary={onPrimary}
        /*
          答えるまで、次へは押せない。

          結果を見て答える回（`observation`）は、選ばずに次へ進める
          と**何も答えないまま先へ行ける**。この回でしてほしいのは
          1つ（分かりやすくなったか）だけなので、そこを飛ばせると
          画面の意味が無くなる。

          ほかの回は前のまま。入力の回は空でも進める道を残してある
          （例文で試す・飛ばす）ので、ここで一律に止めない。
        */
        primaryDisabled={
          Boolean(blockingIssue) ||
          (step.type === "observation" && !isAnswered(step, values))
        }
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
            : lesson.id === "diagnosis" && step.type === "intro"
              ? /*
                  診断は強くすすめるが、**必須にはしない。**

                  帯の「スキップ」だけでも出られるが、あれは小さくて
                  「間違えて押すもの」に見える。降りる道は、進む道の
                  すぐ下に同じ言葉で置く。
                */
                { label: "診断せずに始める", onClick: onExit }
            : lesson.id === "diagnosis" && step.type === "completion"
              ? /*
                  おすすめより前を飛ばさせない。

                  「Day1から確認する」は、おすすめが Day2 以降だった人
                  のための道。基礎を飛ばしたくない人が自分で選べる形に
                  しておく——こちらから強制はしない。
                */
                {
                  label: "Day1から確認する",
                  onClick: () =>
                    onSelectLesson
                      ? onSelectLesson("rewrite_text")
                      : onOpenCourse(),
                }
              : step.type === "completion"
              ? // 同じレッスンをもう一度。身についたか確かめたい人の逃げ道
                { label: "もう一度試す", onClick: api.restart }
              : step.skippable
                ? { label: "解説を飛ばす", onClick: api.skipConcept }
                : undefined
        }
        /*
          終わったあとだけ、逃げ道も同じ大きさで並べる（どちらも正しい行き先）。

          **診断の結果だけは並べない。** 「おすすめLessonから始める」と
          「Day1から確認する」はどちらも長く、390px で横に並べると
          右側が画面の外へ出る（実機で切れていた）。主役を1つに
          決めて、もう片方は下の文字の行にする。
        */
        secondaryProminent={step.type === "completion" && lesson.id !== "diagnosis"}
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
        /*
          置き場所と飾りも `poPresence` が決める。ここで条件を
          書き始めると、また画面の都合でポーが動き出す。
        */
        /*
          診断は5問続けて答えるだけの画面。星と電球が毎回並ぶと、
          印が印として働かなくなる（`StepShell` の `quiet`）。
        */
        quiet={lesson.id === "diagnosis"}
        poAlign={po?.align}
        poBurst={po?.burst}
        poSpeaks={po?.speaks ?? false}
        poScene={po?.scene}
        /* 場面ごとの大きさ。表は `course/poPresence.ts` が持つ */
        poSize={po ? PO_SIZE_BY_SCENE[po.scene] : undefined}
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

      {/*
        診断をやめる前の、ひと呼吸。

        押した先を言ってから決めてもらう。**ここまでの答えは消えない**
        ——端末に残るので、開き直せば続きから答えられる。それを
        書いておかないと、「×」は答えを捨てるボタンに見える。
      */}
      {leaving && (
        <MoreSheet
          placement="center"
          testId="diagnosis-leave-sheet"
          title="診断を終了しますか？"
          onClose={() => setLeaving(false)}
        >
          <p className="text-sm leading-6">ここまでの回答は保存されています。</p>
          <div className="mt-5 space-y-2">
            <PrimaryButton
              testId="diagnosis-leave-confirm"
              onClick={() => {
                setLeaving(false);
                onExit();
              }}
            >
              メインへ戻る
            </PrimaryButton>
            <button
              type="button"
              onClick={() => setLeaving(false)}
              data-testid="diagnosis-leave-cancel"
              className="w-full rounded-cta py-2 text-sm font-bold text-brand-dark"
            >
              診断を続ける
            </button>
          </div>
        </MoreSheet>
      )}

      {/*
        スタンプ台紙。「覚えた」を押した直後の1枚。

        `key` に番号を入れて、技ごとに**別の台紙として作り直す**。
        同じ部品を使い回すと、2つ目を取ったときに押す動きが再生
        されない（React は同じものが残っていると見なす）。
      */}
      {stamping !== null && (
        <SkillStampCard
          key={stamping}
          skills={skillOrder}
          earnedIndex={stamping}
          lessonNumber={lesson.number}
          onClose={() => {
            setStamping(null);
            setRevealed(false);
            api.goNext();
          }}
        />
      )}
        </>
      )}
      </main>
    </>
  );
}
