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

import { IconBook, IconChecklist } from "../components/Icons";
import { PrivacyDialog } from "../components/course/PrivacyDialog";
import { DayCompletePage } from "../components/course/DayCompletePage";
import { LessonHeader } from "../components/course/LessonHeader";
import { LessonPaused } from "../components/course/LessonPaused";
import { BackStackProvider, useBackStack } from "../components/course/BackStack";
import { MoreSheet } from "../components/course/MoreSheet";
import { PrimaryButton } from "../components/aippo/PrimaryButton";
import {
  SectionTransition,
  type SectionImage,
} from "../components/course/SectionTransition";
import { StepRenderer } from "../components/course/StepRenderer";
import { StepShell } from "../components/course/StepShell";
import { useAuth } from "../auth/AuthContext";
import { useCourse } from "../course/live";
import {
  DIAGNOSIS_PHASES,
  PHASE_COPY,
  FIRST_RESULT_PHASE,
  nextPhase,
  prevPhase,
  type DiagnosisPhase,
} from "../course/diagnosisFlow";
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
import { ResumeDialog } from "../components/course/ResumeDialog";
import { ownerTag, resumeOffer, type ResumeOffer } from "../course/resume";
import { loadDraft } from "../lib/draft";
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
 * 次に来る章扉の絵を、1枚だけ先に取っておく。
 *
 * なぜ要るか
 * ----------
 * 章扉は絵が画面そのもの。届くまでは何も無い画面で、届いた瞬間に
 * 0.3 秒かけて出る（`SectionTransition` の `shown`）。段の変わり目で
 * **何も無い一拍**が入るのは、そこがいちばん静かに繋ぎたい場所なので
 * いちばん目立つ。
 *
 * 1枚だけにする
 * -------------
 * 教材の絵を最初にまとめて取ると、**レッスンが始まるのが遅くなる**。
 * いま居る場所より後ろにある章扉のうち、**いちばん近い1枚**だけを
 * 取りに行く。押して進むあいだに間に合えばよく、間に合わなくても
 * これまでと同じ（届いてから出る）。
 *
 * `new Image()` で取るのは、`<link rel=preload>` と違って**取り消し
 * が要らない**から。画面を離れれば参照が切れて、あとはブラウザの
 * 置き場に残るだけになる。
 */
function usePreloadNextSection(lesson: Lesson, stepId: string): void {
  useEffect(() => {
    const at = lesson.steps.findIndex((step) => step.id === stepId);
    if (at < 0) return;

    const next = lesson.steps
      .slice(at + 1)
      .find((step) => step.type === "section_transition" && sectionImage(step));
    const src = next ? sectionImage(next)?.src : undefined;
    if (!src) return;

    const image = new Image();
    image.src = src;
  }, [lesson, stepId]);
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
   * 帯の「×」。行き先は、そのレッスンが入っているコースの中身。
   *
   * 前はここに `onFinish`（＝ホームへ）もあった。完了の1押しで
   * ホームまで飛ばしていたが、いまは Day 完了の画面が受け止め、
   * 次のレッスンかコースかを**その人が選ぶ**。押した先が
   * どこか分からないまま飛ばされる道は無くした。
   */
  onExit: () => void;
  /**
   * ホームへ返す。
   *
   * Day 完了の「ホームに戻る」と、診断をやめるときの「メインへ戻る」。
   * `onExit`（来た道を1つ戻る）とは分ける——コースから開いた人は
   * `onExit` だとコースへ帰るので、**ボタンに書いてある行き先と、
   * 着く場所が食い違う**。
   *
   * 名前が `onOpenCourse` なのは、以前この道がコースの中身へ
   * 向いていたころの名残（`App.tsx` はホームへ繋いでいる）。
   */
  onOpenCourse: () => void;
  /** 完了画面から次のレッスンへ直接移る。行き止まりにしないため。 */
  onSelectLesson?: (lessonId: string) => void;
  /** コース完走の締めくくりから「次のコースを見る」を押したとき。 */
  onOpenCourseCatalog?: () => void;
  /** 「やり方をくわしく見る」を押したとき。 */
  onOpenRecipe?: (tipId: string) => void;
  /**
   * 下書きが無いときに、始める回。
   *
   * ホームの診断の案内から入った人だけが持って来る（開始説明を
   * 飛ばして1問目へ）。続きがある人には効かない。
   */
  startAtStepId?: string;
  /**
   * 教材から降りる。**開いた画面へ返す。**
   *
   * 続きの関所の「あとで」で使う。`onExit` は教材の中を1回ぶん戻るので、
   * 関所で押すと選んでいない続きの画面に着く（実測）。
   */
  onLeave?: () => void;
}

export function LessonRunner({
  lesson,
  onExit,
  onOpenCourse,
  onSelectLesson,
  onOpenCourseCatalog,
  onOpenRecipe,
  startAtStepId,
  onLeave,
}: LessonRunnerProps) {
  const authUser = useAuth().user;
  const owner = ownerTag(authUser);
  const api = useCourseLesson(lesson, { startAtStepId, owner });

  /*
    途中まで進めた教材を、もう一度ひらいたとき。

    ここ1か所で聞く。ホーム・コース・診断の導線・直接ひらいた・読み込み
    直し——入口はいくつもあるが、教材をひらく道はこの画面を必ず通る。

    見るのは**ひらいた1回だけ**。中の「次へ」「戻る」では出さないので、
    控えではなく `useState` の初期値で1度だけ決める。
  */
  const [resume, setResume] = useState<ResumeOffer | null>(null);
  const asked = useRef(false);
  /*
    「←」で戻る先を、画面ではなく**直前の状態**にするための積み場。

    一枚（`MoreSheet`）が開いているあいだは、そこが戻る先。開いて
    いなければ、これまでどおり1つ前のステップへ戻る。詳しくは
    `components/course/BackStack.tsx`。
  */
  const backStack = useBackStack();
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
    診断を途中でやめようとしているか。

    「×」を押しただけでは消さない。ここまでの答えは端末に残るので、
    **消えるのは画面だけ**——それを言ってから決めてもらう。
  */
  const [leaving, setLeaving] = useState(false);

  /*
    完了画面で使う、コース全体の進み具合と次の行き先。
    端末に残っている分と、サーバーが数えている分の両方から取る。
  */
  const course = useCourse();
  const completedIds = useCompletedLessons();
  /* 次の1本。絞り方は完了画面の「次におすすめ」と共通（availability.ts） */
  const upcoming = nextLessons(course.lessons, lesson.id, completedIds);

  /*
    続きの選択を、ひらいた1回だけ決める。

    `useEffect` にしてあるのは、終えた教材の一覧がサーバーから遅れて
    届くため——**届く前に決めると、終えた人にも続きを聞く**ことになる。
    決めたら `asked` を立てて、以後は何が変わっても聞き直さない
    （中の「次へ」「戻る」で出ないのは、これが理由）。
  */
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    setResume(
      resumeOffer({
        lesson,
        draft: loadDraft(lesson.id),
        owner,
        completed: completedIds,
      }),
    );
    // ひらいた1回だけ。以後は聞き直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);
  /* 帳面にしまえるのは登録した人だけ（course/keeping.ts）。 */
  const { canKeep } = useKeeping();
  /*
    もう登録しているかどうか。「今日はここまで」の画面で使う。

    登録した人に「今すぐ登録して続ける」を出すと、押した先に何も無い
    （もう登録している）。ここは**押した先が本当にある道だけを並べる**
    と決めてある画面なので、その前提が崩れる。
  */
  const auth = useAuth();
  /**
   * AIへ送って、返ってきたら次の回へ。
   *
   * `reuse` を渡した呼びは、**直前と同じ内容なら送らない**（`run`）。
   * 戻ってもう一度「次へ」を押しただけの人に、同じ生成をやり直させない
   * ——待たされるうえ、費用も倍になる。「もう一度」は渡さない。
   */
  const send = async (label?: string, options: { reuse?: boolean } = {}) => {
    const outcome = await api.run({ label, reuse: options.reuse });
    if (outcome === "sent") api.goNext();
  };

  /*
    端末の「戻る」を、**帯の「←」と同じ意味にする。**

    このアプリが履歴に積んでいるのは画面（TOP / HOME / LESSON …）だけで、
    レッスンの中の回は積んでいない。だから診断の結果でブラウザバックを
    押すと、**5問すべてを飛ばしてコースの画面まで出ていた**（実測で
    履歴6段、1回でコースへ）。答えを見直したい人が、いちばん押しそうな
    操作で、いちばん遠くへ運ばれる。

    直し方は、一枚（`MoreSheet`）で既に使っている仕組みをそのまま使う
    ——戻れる回に居るあいだ、履歴を1つ持っておく。押された「戻る」は
    その1つを消し、こちらは1回ぶん戻るだけで済む（`BackStack.tsx`）。

    積み場は一枚と共用で、閉じる順は**後に積んだものから**。だから
    一枚が開いていれば先にそちらが閉じ、閉じ切ってからこの層に届く。
    順番はもともとその形になっている。

    最初の回では積まない。そこでの「戻る」はレッスンから出る合図で、
    行き先を持たない層を置くと、出口が消える。
  */

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
    /*
      続きを聞いているあいだは送らない。

      控えの回が「送信中」だった人は、開いた瞬間にここへ入る。選ぶ前に
      送ってしまうと、**「最初からやり直す」を押した人にも1回ぶん
      かかる**——しかもその結果は捨てられる。
    */
    if (resume) return;

    // 目印は**ステップの id だけ**にする。
    // 実行回数を混ぜると、成功して回数が増えた瞬間に
    // 別の目印になり、もう一度送ってしまう（費用が倍になる）。
    if (autoRan.current === step.id) return;
    autoRan.current = step.id;

    /*
      戻ってきた人には、**同じものを送り直させない**（`run` の `reuse`）。

      この効果は「送信のステップに入ったら送る」なので、帯の「←」で
      結果から1歩戻り、もう一度進んだ人もここを通る。直前と同じ内容
      なら、待たせも費用もかけずに次へ渡す。
    */
    void send(runs.length === 0 ? "1回目" : undefined, { reuse: true });
    // send は毎回作り直されるので、依存に入れると送り続ける
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, step.type, api.isSubmitting, api.error, api.findings.length, resume]);

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

  /*
    結果から条件へ戻る道。教材が行き先を持っている回にだけ出す
    （`course/day2Steps.ts` の `own_result`）。
  */
  const stepMeta = (step.meta ?? {}) as { editStep?: string; editLabel?: string };
  const editStep =
    stepMeta.editStep && lesson.steps.some((one) => one.id === stepMeta.editStep)
      ? stepMeta.editStep
      : undefined;
  const editLabel = stepMeta.editLabel ?? "条件を直す";

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
    問いの前に居るか、うしろに居るか。

    問いでない回（開始画面・結果）でも、帯は段のまま出す——**落とすと
    章の帯に戻ってしまう**（`LessonProgress` は `segments` が無ければ
    そちらを描く）。開始画面に章の区切り線が1本入り、読み上げは
    「2つのうち1つ目。いまは『試す』」と、画面から消したはずの言葉を
    言っていた。

    どちらに居るかは、最初の問いとの前後で決める。数は数えない。
  */
  const firstQuestionAt = lesson.steps.findIndex((each) => each.key);
  const beforeQuestions =
    firstQuestionAt >= 0 &&
    lesson.steps.findIndex((each) => each.id === step.id) < firstQuestionAt;

  /*
    診断の結果は4画面（`course/diagnosisFlow.ts`）。いまどれかを持つ。

    **教材のステップにはしない。** 増やすと3層（同梱・seed・配信）
    すべてに同じものが要り、採点も進み具合の分母も動く。ここで変わる
    のは結果の見せ方だけで、教材の中身ではない。

    ここに置いてあるのは、見出し・ポー・下のボタンを出しているのが
    この画面だから。中身側（`DiagnosisResult`）と別々に持つと、
    **画面の上と下で言うことがずれる。**
  */
  const isDiagnosisResult = lesson.id === "diagnosis" && step.type === "completion";
  const [phase, setPhase] = useState<DiagnosisPhase>(() =>
    /*
      **開き直した人には、演出を出さない。**

      控えから戻ってきた人は、結果の画面にいきなり着く。そこで
      整理中の1枚から始めると、**もう出ている結果を作り直している**
      ように見えるし、読み返すたびに 1.2 秒待たされる。

      演出を出すのは、5問目を押して**新しく結果を作ったとき**だけ
      ——そのときは問いの回から入ってくるので、ここは通らない。
    */
    isDiagnosisResult ? FIRST_RESULT_PHASE : DIAGNOSIS_PHASES[0],
  );
  /*
    結果の画面を離れたら、先頭（現在地）に戻す。

    答えを直しに問いへ戻った人は、直したあともう一度ここへ来る。
    そのとき前回の続き（おすすめ）から始まると、**直した結果を
    見ないまま**次へ行くことになる。
  */
  const atResult = isDiagnosisResult;
  useEffect(() => {
    if (!atResult) setPhase(DIAGNOSIS_PHASES[0]);
  }, [atResult]);

  /*
    押されたときに何をするかは、**そのときの状態で決める。**

    積むのは回が変わったときだけ（下の `useEffect`）。積んだ関数が
    そのときの `phase` を閉じ込めていると、診断の結果の中で画面を
    進めても、端末の「戻る」は**積んだ瞬間の画面**へ戻ろうとする。
    入れ物だけ先に置いて、中身は毎回書き換える。
  */
  const backRef = useRef<() => void>(() => {});

  /**
   * 1歩戻る。帯の「←」も端末の「戻る」も、ここを通る。
   *
   * 診断の結果の中にいるときは、まず**画面を1つ**戻す。4画面は教材の
   * ステップではないので `api.goBack()` はこれを知らない——そのまま
   * 呼ぶと、おすすめからいきなり5問目へ出る。分析中へは戻さない
   * （`prevPhase`）。同じ 1.8 秒をもう一度待つだけで、戻る先として
   * 意味を持たない。
   */
  const goBackOne = () => {
    if (isDiagnosisResult) {
      const back = prevPhase(phase);
      if (back) {
        setPhase(back);
        return;
      }
    }
    api.goBack();
  };
  backRef.current = goBackOne;

  const stepId = step.id;
  /* 次の章扉の絵を、1枚だけ先に取っておく（上の `usePreloadNextSection`） */
  usePreloadNextSection(lesson, stepId);
  useEffect(() => {
    if (!api.canBack || celebrating) return;
    /*
      回が変わるたびに積み直す。押されたぶんは `BackStack` の側で
      消えるので、積み直さないと2回目の「戻る」が素通りする。
    */
    return backStack.push(() => backRef.current());
    /*
      **結果の画面が変わったら積み直す。** ここを忘れると、端末の
      「戻る」が2回目から素通りしてレッスンの外へ出る——1回目で
      `BackStack` の1つが消え、次を積んでいないので履歴の底が
      むき出しになる（実測で、4つの力からコースの画面まで出た）。
    */
  }, [backStack, api.canBack, stepId, celebrating, isDiagnosisResult, phase]);

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
      /*
        診断の結果に添えたレッスンを押したとき。**下のボタンと同じ道を通す。**

        `onSelectLesson` を直に渡すと、診断を終えた記録
        （`finalizeCompletion`）を飛ばしてそのレッスンへ移る。受けたのに
        受けていないことになり、ホームのおすすめも既定のままになる
        ——「次のコースを見る」で同じことが起きたのを直したのが、
        すぐ上の `onOpenRecipe`。
      */
      onPickLesson={
        onSelectLesson
          ? (lessonId: string) => {
              finalizeCompletion();
              onSelectLesson(lessonId);
            }
          : undefined
      }
      /*
        結果の3画面。**上の見出しと下のボタンと同じ値を渡す。**
        別々に持つと、画面の上と下で言うことがずれる。
      */
      diagnosisPhase={phase}
      /*
        整理中の1枚を見終わったら、自分で現在地へ移る。

        **押すものは置かない。** 1〜1.5秒のあいだに「次へ」を出すと、
        押す人は演出を飛ばし、押さない人は待たされる——どちらにとっても
        余計な判断が1つ増える。
      */
      onAnalyzed={() => setPhase("stage")}
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
        void send(runs.length === 0 ? "1回目" : undefined, { reuse: true });
        return;
      case "improvement_choice":
        void send(values.improvement || "もう一度", { reuse: true });
        return;
      case "concept_card":
        /*
          解説の回は、そのまま次へ。

          前はここで技を1つずつ受け取らせ、進む前にスタンプ台紙を
          1枚挟んでいた。**受け取る演出が Day1 の中に3回**あり、
          そのたびに学習が止まる。名前は使った場所で言い、受け取るのは
          自分の文章を仕上げたあとに1度だけ（`day1/SkillRecap.tsx`）。

          台紙そのものも消した。教材のどこからも出なくなった画面を
          残すと、次に触る人が「どこから出るのか」を探すことになる。
        */
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
          /*
            結果は4画面。**最後まで来て初めて、レッスンへ渡す。**

            前はここが1画面で、下のボタンは最初から「ここから始める」
            だった。結果を読み終える前に次へ行く道が目に入るので、
            結果は読まれずに押されていた。いまは
            現在地 → 4つの力 → おすすめ、と進んでから。
          */
          const ahead = nextPhase(phase);
          if (ahead) {
            setPhase(ahead);
            return;
          }
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
    lessonId: lesson.id,
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
  /*
    ここへ来るのは**その人の持ち分を使い切ったときだけ**にした。

    前は「全体が混み合っている」（`limit`）も同じ画面へ送っていた。
    けれどこの画面には押し直す道が無く、出口は「ホームへ戻る」1本。
    混み合いは時間をおけば直るものなので、**直るはずの止まり方を
    行き止まりにしていた**（`course/rescue.ts` へ移した）。

    祝う言葉と「続けて n 日」も、ここに残す。使い切るまで練習した人に
    だけ言う言葉で、混み合いに当たっただけの人へ言うと嘘になる。
  */
  const pausedForToday =
    step.type === "ai_generate" && api.errorKind === "out_of_credits";

  /*
    詰まった。**行き止まりにしない。**

    出るのは「もう一度」1本ではなく、押した先が本当にある道を並べる
    （`course/rescue.ts` が決める）。出す条件は「AIを呼ぶ回で失敗した」
    ——今日はここまで（上限）とは別で、あちらは別の画面が持つ。
  */
  const stuck =
    step.type === "ai_generate" &&
    !pausedForToday &&
    (api.errorKind === "failed" ||
      api.errorKind === "unusable" ||
      // 混み合いも、押し直せる道のある側で受ける
      api.errorKind === "limit");

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
              ? () => {
                  /*
                    開いている一枚があれば、まずそれを閉じる。

                    閉じるだけで、背面には何もしない。選んだ札・図の
                    切り替え・送った位置は背面の画面が持ったままなので、
                    閉じれば元の姿に戻る。
                  */
                  if (backStack.closeTop()) return;
                  /* 端末の「戻る」と同じ道を通す（`goBackOne`） */
                  goBackOne();
                }
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
      <BackStackProvider stack={backStack}>

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
          /*
            登録を勧めるのは、**まだ登録していない人にだけ**。

            前はここが `api.errorKind === "out_of_credits"` だった。
            この画面へ来る条件がまさにそれ（すぐ上の `pausedForToday`）
            なので、**いつでも `true`**——登録済みの人にも
            「今すぐ続きを無料ではじめる」が出ていた。押すと登録の窓が
            開き、もう持っているアカウントを作れと言われる。

            条件が2か所に分かれていたせいで、片方が常に真になっている
            ことが読み取れなかった。見るものを変える：
            **持ち分が増えるかどうか**は、上限の種類ではなく
            「まだ登録していないか」で決まる。
          */
          canRegisterForMore={!auth.user}
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
          /*
            絵が無い章では、代わりに段の名前を出す（`PlainDoor`）。
            絵があるときは焼き込まれているので渡しても使われない。
          */
          number={(step.meta as { sectionNumber?: number } | undefined)?.sectionNumber}
          sectionLabel={
            (step.meta as { sectionLabel?: string } | undefined)?.sectionLabel
          }
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
        {...(isDiagnosisResult
          ? {
              /*
                結果は4画面。見出しも肩書きも、その画面のものを出す
                （`course/diagnosisFlow.ts`）。

                分析中だけ肩書きを出さない。**まだ結果ではない**ので、
                そこに「診断結果」と書くと、出る前から出たことになる。
              */
              eyebrow: PHASE_COPY[phase].eyebrow
                ? { icon: IconChecklist, label: PHASE_COPY[phase].eyebrow as string }
                : undefined,
              title: PHASE_COPY[phase].title,
              instruction: PHASE_COPY[phase].instruction,
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
        /*
          診断の帯は、**問いの数だけ段に割る。**

          前は1本の帯が少しずつ伸びるだけで、「4割くらい」は分かっても
          「2問目」は分からなかった。右の「質問 2 / 5」を読まないと
          位置が決まらない＝帯が仕事をしていない状態。段に割ると、
          埋まった数がそのまま問い数になる。

          **問いが始まってから、終わるまで段のまま出す。**

          前は問いの回だけに渡していた。開始画面と結果では「数える
          ものが無い」からという理由だったが、渡さないことは
          「帯を出さない」ことにはならない——`LessonProgress` は
          `segments` が無ければ章の帯を描く。実機の写しで開始画面の
          右寄りに入っていた細い切れ目がそれで、読み上げも
          「2つのうち1つ目。いまは『試す』」と、画面から消したはずの
          言葉を言っていた。

          開始画面は、帯そのものを出さない（`hideProgress`）。
          まだ1問も始まっていないので、空の段が5つ並ぶと「0 / 5 から
          始まる長いもの」に見える。数え始めるのは質問1から。

          結果では全部埋める。答え終わったことが、そのまま形になる。
        */
        segments={
          lesson.id === "diagnosis" && !beforeQuestions
            ? {
                total: questionCount,
                done: questionAt >= 0 ? questionAt + 1 : questionCount,
                at: questionAt >= 0 ? questionAt + 1 : undefined,
              }
            : undefined
        }
        /*
          開始画面には帯を出さない。ここで見せたいのは**何を測るか**で
          あって、残りの量ではない。
        */
        hideProgress={lesson.id === "diagnosis" && beforeQuestions}
        /*
          結果の画面では、低い端末でポーを引っ込める。

          ここは**読む画面**で、置くものがいちばん多い（道・段の名前・
          そうなった理由・回答から見えたこと）。375×667 の実測で、
          ポーの吹き出しを入れると 45px あふれていた。

          消す順は「同じことを言っているもの」から。現在地の画面で
          ポーが言うのは「いまはここ！」で、**見出しと道がすでに
          言っている**——削って最後に失われる情報が、いちばん少ない。
        */
        poHideBelow={isDiagnosisResult ? 700 : undefined}
        currentMission={api.missions.current}
        phase={step.phase}
        /*
          表情は、場面のほうが強いときだけ差し替える
          （`poPresence` の `emotion`）。ふだんは教材データに従う。
        */
        /*
          結果の4画面では、ポーもその画面のことを言う。

          教材データの `poMessage`（「いまはここ！」）は1画面ぶんの
          言葉で、4画面で言い回すと**3画面で場面と合わない**。
        */
        po={
          isDiagnosisResult
            ? { ...api.po, message: PHASE_COPY[phase].po }
            : po?.emotion
              ? { ...api.po, emotion: po.emotion }
              : api.po
        }
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
          isDiagnosisResult
            ? /*
                おすすめの画面だけ、Day の番号を入れる。

                押した先がどこかを**押す前に**言う。おすすめは人に
                よって Day1 とはかぎらないので、番号は結果から取る。
                残りの画面は `PHASE_COPY` のまま。
              */
              phase === "lesson"
              ? `Day ${course.lessons.find((one) => one.id === recommendLesson(values))?.number ?? 1}をはじめる`
              : PHASE_COPY[phase].primary
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
          /*
            結果を見て答える回には、**副の行を置かない。**

            前はここに「いま送ったお願いを見る」を置いていた。副の行は
            46px あり、それがそのまま「AIの結果を読む場所」から引かれる
            ——実測で 402×660 と 1280×720 の2つで、答える2択が枠の外へ
            出ていた（e2e/stepFits.spec.ts）。

            送ったお願いは消していない。画面の中にある
            「変わったところを見る」の一枚が、名前つきで持っている
            （`steps/Results.tsx` の `asked-conditions`）。**入口を
            2つ持つほど大事なものではない。**
          */
          /*
            結果から、条件へ戻る道（Day2 の仕上がり画面）。

            出てきたものを読んだあとで「もっと短く」「上司ではなく
            自分用に」と気づく。押す先が「完了」しか無いと、直すには
            戻るボタンを4回押すことになる。入れた文章も選んだ条件も
            消えない（`values` はステップを移っても残る）。
          */
          editStep
            ? { label: editLabel, onClick: () => api.goTo(editStep) }
          : step.id === "real_task_intro"
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
            : isDiagnosisResult
              ? /*
                  結果の画面の、細い1行。**画面ごとに行き先が違う。**

                    読み取り … 置かない。ここは進むだけ
                    現在地   … 置かない。ここは進むだけ
                    特徴     … 現在地に戻る
                    4つの力  … 答えから見えたことに戻る
                    おすすめ … 診断結果をもう一度見る（先頭へ）

                  前はここが「Day1から確認する」だった。おすすめが
                  Day2 以降だった人のための道だが、**結果を読み終える
                  前から出ていた**ので、読まずに Day1 へ出る道として
                  働いていた。おすすめ以外の1本は「ほかの候補も見る」が
                  持っている（`DiagnosisResult.tsx`）。
                */
                PHASE_COPY[phase].secondary
                ? {
                    label: PHASE_COPY[phase].secondary as string,
                    /*
                      おすすめから戻る先は**現在地**にする。1つ前
                      （4つの力）ではない——ここに書いてあるのは
                      「診断結果をもう一度見る」で、結果は現在地から
                      読む。1歩だけ戻したい人は帯の「←」を押す。

                      **整理中へは戻さない。** あれは結果を作っている
                      あいだの1枚で、結果ではない。見直すだけの人に
                      1.2秒の演出をもう一度見せると、読み返しのたびに
                      待たされることになる。
                    */
                    onClick: () =>
                      setPhase(
                        phase === "lesson"
                          ? FIRST_RESULT_PHASE
                          : (prevPhase(phase) ?? FIRST_RESULT_PHASE),
                      ),
                  }
                : undefined
              : step.type === "completion"
              ? /*
                  同じレッスンをもう一度。身についたか確かめたい人の逃げ道。

                  **「もう一度試す」から1語削った。** 完了画面では
                  「完了する」と横に並ぶので、1つあたり 160px ほど。
                  6字だと入り切らず「もう一度…」と切れていた（実機の
                  393px で実測）——押す先が読めないボタンは、押す先が
                  無いのと同じ。
                */
                { label: "もう一度", onClick: api.restart }
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
          結果の4画面では、押す場所を動かさない。

          逃げ道を持つのは後ろの2つだけ（4つの力・おすすめ）。何も
          しないと、現在地から4つの力へ移った瞬間に主ボタンが 46px
          上がる（実測）——順に押していく画面で、指を置いたまま次を
          押そうとすると、そこには何も無い。
        */
        reserveSecondary={isDiagnosisResult}
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
              /*
                **ホームへ返す。**`onExit` ではない。

                あちらは「来た道を1つ戻る」で、コースから診断を開いた人
                （＝ほぼ全員）はコースの中身に着く。ボタンには
                「メインへ戻る」と書いてあるのに、出るのは1つ手前の画面
                ——**押しても何も起きていないように見える**と報告された。
                実際に押して確かめると、着く先は「AIスタートコース」だった。

                行き先を約束している側に合わせる（`onOpenCourse` は
                `App.tsx` でホームへ繋いである）。
              */
              onClick={() => {
                setLeaving(false);
                onOpenCourse();
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

        </>
      )}
      </BackStackProvider>
      </main>

      {/*
        途中まで進めた教材を、もう一度ひらいたとき。**いちばん上に置く。**

        後ろの画面はもう続きの状態で描かれている（控えからの復元は
        `useCourseLesson` が済ませている）。選ぶ前に触られないよう、
        背景では閉じない形にしてある（`ResumeDialog`）。

        「つづきから」は閉じるだけ——後ろがもうその状態なので、
        ここで何かを積み直す必要が無い。
      */}
      {resume && (
        <ResumeDialog
          offer={resume}
          onResume={() => setResume(null)}
          onRestart={() => {
            api.restart();
            setResume(null);
          }}
          /*
            「あとで」。控えは触らず、来た画面へ戻る。

            行き先は `onExit`（開いた1つ前）。直接ひらいた人のように
            戻る先が無いときも、あちらがホームへ倒す（`App.tsx` の
            `goBack`）。閉じた先で同じ問いがもう一度出ることは無い
            ——この画面ごと外れるため。
          */
          onLater={onLeave ?? onExit}
        />
      )}
    </>
  );
}
