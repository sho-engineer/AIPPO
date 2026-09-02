/**
 * レッスンを終えた画面。
 *
 * StepViews から切り出した。1つのファイルに全ステップの見た目を
 * 積むと、完了画面を1行直すために1400行を開くことになる。
 *
 * ここだけ演出が強い（紙吹雪・チェック）。19歩かけて終えたことが
 * 何も起きずに終わると、終えた実感が残らないため。ただし大人が
 * 仕事の合間に使う画面なので、花火も光も置かない。
 */

import { useEffect, useState } from "react";

import { Card, IconBadge } from "../../AppShell";
import { SaveProgressCard } from "../../auth/SaveProgressCard";
import { CourseCheckpoint } from "../CourseCheckpoint";
import { LessonAwardCard } from "../LessonAwardCard";
import { playSuccessSound } from "../../../course/sound";
import { KeepArtifactButton } from "../KeepArtifactButton";
import { SurveyCard } from "../SurveyCard";
import { LessonCelebration } from "../LessonCelebration";
import { MoreButton, MoreSheet } from "../MoreSheet";
import { AppliedTips } from "../AppliedTips";
import { LessonThumbnail } from "../../lessons/LessonThumbnail";
import { lessonThumbnailById } from "../../../course/lessonThumbnail";
import { CourseStampRow, MilestoneLegend } from "../CourseStamps";
import { appliedTipsFor } from "../../../course/appliedTips";
import { lookupLesson } from "../../../course/live";
import { milestonesCrossed, milestonesFor } from "../../../course/milestones";
import {
  IconCheckCircle,
  IconClock,
  IconChevronRight,
  IconCopy,
  IconMedal,
  IconSparkle,
  IconStar,
} from "../../Icons";
import type { Course } from "../../../course/types";
import type { LessonAward } from "../../../api/lesson";

// ------------------------------------------------------------- 完了画面

/**
 * レッスンを終えた画面（支給デザイン）。
 *
 * ここは行き止まりにしない（憲章 原則 I）。
 * 「おめでとう」だけで終わらせると、次に何をすればよいか分からず、
 * その場でアプリを閉じることになる。出すものを6つに決めている。
 *
 *   1. 何ができるようになったか（身についたこと）
 *   2. 持ち帰れるもの（今回の成果物。押せば手元に写せる）
 *   3. 全体のどこまで来たか（スタンプラリー）
 *   4. これで何ができるか（応用例・組み合わせ。AppliedTips）
 *   5. 次の行き先
 *   6. コースを完走した回だけ、特別な締めくくり
 *
 * 2 が肝心で、これが無いと「練習しただけ」で終わる。
 * せっかく作った文章を、その場で仕事に持っていけるようにする。
 * 4 も同じ理由で足した——1本のレッスンだけでは「これで何の役に
 * 立つのか」が見えないまま、次のレッスンへ流されてしまう。
 *
 * スタンプラリーについて
 * ----------------------
 * 3 は「n / 9」の数字だけでなく、コース専用のスタンプで埋めていく形に
 * している（`CourseStamps.tsx`）。節目（3個・6個・完走）には特典の
 * 予告が付くが、**実際に使える残高ではない**——画像生成コースなど
 * 使い道がまだ存在しないため。詳しくは `course/milestones.ts`。
 */
export function CompletionView({
  course,
  skills,
  outcomes,
  outcomeText,
  outcomeLabel,
  lessonId,
  lessonNumber,
  done,
  total,
  next,
  completedIds,
  onSelectLesson,
  onOpenCourseCatalog,
  onOpenRecipe,
  award = null,
}: {
  /** スタンプの絵と、節目の中身を決めるのに使う。 */
  course: Course;
  skills: string[];
  /**
   * このレッスンを終えて、できるようになったこと。
   *
   * 完了画面のいちばん上に出す。**この画面の主役**で、XP より前。
   */
  outcomes?: string[];
  outcomeText?: string;
  outcomeLabel: string;
  lessonId: string;
  lessonNumber: number;
  done: number;
  total: number;
  next: {
    id: string;
    number: number;
    title: string;
    goal: string;
    /** 所要時間。「あと7分なら」と決められるように出す。 */
    estimatedMinutes?: number;
  }[];
  /** 「こんな使い方もできます」で、足りない技を言い当てるのに使う。 */
  completedIds: string[];
  onSelectLesson?: (lessonId: string) => void;
  /** コース完走の締めくくりから「次のコースを見る」を押したとき。 */
  onOpenCourseCatalog?: () => void;
  /** 「やり方をくわしく見る」を押したとき。 */
  onOpenRecipe?: (tipId: string) => void;
  /**
   * 終えたときに増えた分（XPとAI技）。サーバーが決める。
   *
   * 無い回（やり直し・届かなかったとき）は、その節ごと出さない。
   */
  award?: LessonAward | null;
}) {
  /*
    このレッスンで、新しく超えた節目。

    `done` は、この画面を出している時点の「いまの本数を含んだ」数
    （StepRenderer 側で +1 してある）。1本前の状態と比べれば、
    このレッスンで初めて超えた節目だけが分かる。やり直しで
    もう一度終えたときは before === done になるので、何も超えない
    （二重に祝わない）。
  */
  /*
    「このレッスンの記録」を開いているか。

    進み具合・節目・XP・登録の誘い・アンケート・応用例・次におすすめは
    ここへ入れた。画面には残さない（この関数の冒頭を参照）。
  */
  const [recordOpen, setRecordOpen] = useState(false);

  const crossed = milestonesCrossed(course, done - 1, done);
  const courseComplete = done >= total && total > 0;

  /*
    コースを完走した回だけ、節目と同じ長い音を鳴らす。

    節目のまとめ（CourseCheckpoint）は完走の回には出さないので、
    ここで鳴らさないと、いちばん大きな回だけ音が短くなる。
  */
  useEffect(() => {
    if (courseComplete) playSuccessSound("milestone");
  }, [courseComplete]);

  /*
    節目のまとめに、**いま終えた1本**を必ず含める。

    `completedIds` はサーバーと端末から取った一覧で、この画面を
    出している時点ではまだ今回の分が入っていないことがある。
    そのまま渡すと、節目を起こした当の1本だけが抜けたまとめが出る。
  */
  const doneSoFar = completedIds.includes(lessonId)
    ? completedIds
    : [...completedIds, lessonId];

  /*
    Day を終えた瞬間は、この画面には無い。

    前はここへ重ねていた。祝いの下に、できるようになったこと・成果物・
    スタンプ・アンケート・次におすすめが透けて並び、**1日やり切った
    瞬間が、長い縦積みの前置き**になっていた。いまは下の「完了する」を
    押した先が1画面まるごと持つ（`components/course/DayCompletePage.tsx`）。

    この画面の役割は変えていない——できるようになったことを見せ、
    成果物を持ち帰らせ、次の行き先を出すところ。
  */

  return (
    /*
      1画面＝1アクション。

      前はここに9つの塊が縦に並んでいて、Pixel 5 で 3036px あった。
      押す場所を探して送るしかない画面で、**レッスンの終わりが
      「読む場所」**になっていた。

      画面に残すのは3つだけ。

          できるようになったこと
          覚えたAI技
          今回の成果物（持ち帰るもの）

      残り（進み具合・節目・XP・登録の誘い・アンケート・応用例・
      次におすすめ）は「このレッスンの記録」の一枚へ移した。**消して
      いない**——押せば全部ある。祝いと進み具合は、この次の
      Day 完了の画面が持つ。

      `relative` は紙吹雪の親。紙はこの枠の中だけで散る。
    */
    <div
      data-testid="completion-view"
      className="relative flex min-h-0 flex-1 flex-col"
    >
      <LessonCelebration />

      {/*
        いちばん上は「できるようになったこと」。

        前はここが XP のカードだった。数が主役だと、その回に**何が
        できるようになったのか**が下へ押しやられる。数は増えたことしか
        言えず、増えた先に何があるかは言えない。

        **2つまで。** 3つ目からは記録の一枚に入っている。ここは
        「今日できるようになったこと」を思い出す場所で、一覧ではない。
      */}
      {outcomes && outcomes.length > 0 && (
        <ul
          className="shrink-0 space-y-1.5"
          role="list"
          data-testid="completion-outcomes"
        >
          {outcomes.slice(0, 2).map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm leading-6">
              <IconCheckCircle className="mt-1 h-4 w-4 shrink-0 text-brand" />
              {line}
            </li>
          ))}
        </ul>
      )}

      {/* 覚えたAI技。1行ずつ、囲いは付けない（面を積み重ねない） */}
      {skills.length > 0 && (
        <p
          className="mt-3 flex shrink-0 items-center gap-2 text-sm"
          data-testid="completion-skills"
        >
          <IconStar className="h-4 w-4 shrink-0 text-brand" />
          <span className="text-xs text-ink-muted">覚えたAI技</span>
          {/*
            1行で切る。技が2つある回は折り返して2行になり、そのぶん
            下の成果物が縮む——**この画面でいちばん大事なのは成果物**。
            全部は「このレッスンの記録」の一枚に並んでいる。
          */}
          <span className="min-w-0 truncate font-bold text-brand-dark">
            {skills.join(" ／ ")}
          </span>
        </p>
      )}

      {/*
        今回の成果物。**この画面でいちばん大事なもの。**

        これが無いと「練習しただけ」で終わる。せっかく作った文章を、
        その場で仕事へ持っていけるようにする。長さが決まらないので、
        残りの高さに合わせて縮み、入りきらない分はこの面の中で送る。
      */}
      {outcomeText && (
        /*
          読める下限を置く。1行だけ見えて切れていると、**持ち帰るもの
          が見えない**まま「完了する」を押すことになる。届かないときは
          外側（この画面の柱）が送れるようにしてある。
        */
        <div className="mt-3 flex min-h-[7.5rem] flex-1 flex-col">
          <p className="shrink-0 text-xs font-bold text-ink-muted">{outcomeLabel}</p>
          <p className="mt-1.5 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-card border border-line bg-surface p-3.5 text-sm leading-7">
            {outcomeText}
          </p>
          {/*
            いま貼るのと、あとで出すのは別のこと。両方を並べて置く。
            取っておくには登録が要るが、ボタンは出しておき、押したときに
            理由を返す（先に消すと、そういう場所があること自体が伝わらない）。
          */}
          <div className="mt-2 flex shrink-0 items-start justify-end gap-2">
            <KeepArtifactButton lessonId={lessonId} output={outcomeText} />
            <CopyButton text={outcomeText} />
          </div>
        </div>
      )}

      <div className="mt-3 shrink-0">
        <MoreButton testId="completion-more" onClick={() => setRecordOpen(true)}>
          このレッスンの記録を見る
        </MoreButton>
      </div>

      {recordOpen && (
        <MoreSheet
          title="このレッスンの記録"
          onClose={() => setRecordOpen(false)}
        >
          {/*
            アンケートを先頭に置く。

            フェーズ2→3 の判定にある2つの条件のうち、記録から出せない
            ほうの1つ（有料テストの申込率）は、ここが唯一の入口
            （`docs/roadmap.md`）。一枚の中へ移したぶん目に触れにくく
            なるので、せめていちばん上に置く。**回答率は数字で見張ること。**
          */}
          <SurveyCard lessonId={lessonId} />

          {/*
            登録の誘いは、ここ以外に置かない。
            作ったものが目の前にある、この1回だけ聞く。
            ログイン済みの人には何も出ない。
          */}
          <SaveProgressCard />

          {/* 全体のどこまで来たか */}
          <section className="mt-5 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-ink-muted">
                コース進捗（Lesson {lessonNumber} 完了）
              </span>
              <span className="text-sm font-bold tabular-nums">
                {done} / {total}
              </span>
            </div>
            <div className="mt-2">
              <CourseStampRow course={course} done={done} total={total} />
            </div>
            {/*
              節目の一覧。完走したときは、ここではなく下の締めくくりで
              祝う。二重に出すと「どちらが本番か」が分からなくなる。
            */}
            {!courseComplete && (
              <div className="mt-4">
                <MilestoneLegend course={course} done={done} />
              </div>
            )}
          </section>

          {/*
            コースの節目。**ここまでで何ができるようになったか**をまとめる。
            積み上がっていることは、積み上げた本人がいちばん気づきにくい。
          */}
          {crossed.length > 0 && !courseComplete && (
            <div className="mt-5">
              <CourseCheckpoint
                course={course}
                completedIds={doneSoFar}
                atCount={crossed[0].atCount}
                rewardLabel={crossed[0].label}
              />
            </div>
          )}

          {/*
            XP はいちばん下。増えた数は励みになるが、主役ではない。
            「+100 XP!!!」が完了の主役、という形にしない。
          */}
          <div className="mt-5">
            <LessonAwardCard award={award} />
          </div>

          {/*
            「これで何ができるか」。練習しただけで終わらせず、
            仕事の場面に結びつける。

            いま終えたレッスンを、足りない技として案内しない
            --------------------------------------------------
            `completedIds` には、この画面を出している時点ではまだ
            いまのレッスンが入っていない（`done` の数え方と同じ理由）。
            素通しすると、たったいま終えたばかりの技を「学ぶ→」と
            案内してしまう。
          */}
          <div className="mt-5">
            <AppliedTips
              tips={appliedTipsFor(lessonId)}
              lessonTitle={(id) => lookupLesson(id)?.title ?? null}
              completedIds={doneSoFar}
              onSelectLesson={onSelectLesson}
              onOpenRecipe={onOpenRecipe}
            />
          </div>

          {/*
            コースを完走した回だけの締めくくり。

            `next` は、このコースにもう教材が残っていないと空になる。
            空のまま何も出さずに終わると、いちばん大きな節目のはずの回が
            ふだんの回より静かに終わる。ここを埋める。
          */}
          {courseComplete && (
            <Card testId="course-complete" className="mt-5 border-brand-line">
              <div className="text-center">
                <p className="text-xs font-bold tracking-wide text-brand">
                  COURSE COMPLETE
                </p>
                <h2 className="mt-1 text-lg font-bold leading-7">{course.title}</h2>
                <p className="mt-1 text-sm leading-6 text-ink-muted">
                  {total}個のスタンプが、すべて埋まりました
                </p>
              </div>

              <div className="mt-4 flex justify-center">
                <CourseStampRow course={course} done={done} total={total} />
              </div>

              {/* 完走の証。バッジという形で残す */}
              <div className="mt-4 flex items-center justify-center gap-2 rounded-card bg-brand-soft px-4 py-3">
                <IconMedal className="h-5 w-5 shrink-0 text-brand-dark" />
                <span className="text-sm font-bold text-brand-dark">
                  {milestonesFor(course).badgeTitle}
                </span>
              </div>

              <p className="mt-3 text-center text-xs leading-6 text-ink-muted">
                {milestonesFor(course).completeLabel} ぶんの体験が、近日公開予定です
              </p>

              {onOpenCourseCatalog && (
                <button
                  type="button"
                  onClick={onOpenCourseCatalog}
                  data-testid="course-complete-next"
                  className="mt-4 flex min-h-[2.75rem] w-full items-center justify-center gap-2
                             rounded-cta bg-brand px-6 py-2.5 text-sm font-bold text-white
                             shadow-cta transition hover:brightness-110 active:scale-[0.98]"
                >
                  次のコースを見る
                  <IconChevronRight className="h-4 w-4 shrink-0" />
                </button>
              )}
            </Card>
          )}

          {/*
            次におすすめ。**行き先の主役はこの次の Day 完了の画面**が
            持つ（「次のレッスンへ」）。ここは「ほかにもある」を見る場所。
          */}
          {next.length > 0 && (
            <section className="mt-5 border-t border-line pt-4" aria-labelledby="next-heading">
              <div className="flex items-center gap-3">
                <IconBadge icon={IconSparkle} tone="plain" size="sm" />
                <h2 id="next-heading" className="text-base font-bold">
                  次におすすめ
                </h2>
              </div>

              <ul className="mt-3 grid gap-3 sm:grid-cols-2" role="list">
                {next.map((lesson) => {
                  const thumbnail = lessonThumbnailById(lesson.id);
                  return (
                    <li key={lesson.id}>
                      <button
                        type="button"
                        disabled={!onSelectLesson}
                        onClick={() => onSelectLesson?.(lesson.id)}
                        data-testid={`next-${lesson.id}`}
                        className="flex h-full w-full items-center gap-3 rounded-panel bg-surface
                                   p-4 text-left shadow-card transition
                                   enabled:hover:-translate-y-0.5 enabled:hover:shadow-raised
                                   disabled:cursor-not-allowed"
                      >
                        {thumbnail && <LessonThumbnail src={thumbnail} variant="side" />}
                        <div className="min-w-0 flex-1">
                          <span className="inline-block rounded-badge bg-brand-soft px-2.5 py-1 text-[0.6875rem] font-bold text-brand-dark">
                            Lesson {lesson.number}
                          </span>
                          <h3 className="mt-2 text-sm font-bold leading-6">{lesson.title}</h3>
                          <p className="mt-1 text-xs leading-6 text-ink-muted">{lesson.goal}</p>
                          {lesson.estimatedMinutes !== undefined && (
                            <p className="mt-1.5 flex items-center gap-1 text-xs font-bold text-brand-dark">
                              <IconClock className="h-3.5 w-3.5 shrink-0" />
                              約{lesson.estimatedMinutes}分
                            </p>
                          )}
                        </div>
                        <span
                          aria-hidden="true"
                          className="flex shrink-0 items-center justify-center text-ink-muted"
                        >
                          <IconChevronRight className="h-4 w-4" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </MoreSheet>
      )}
    </div>
  );
}

/**
 * 手元へ写すボタン。
 *
 * 押したことが分からないと、もう一度押される。
 * 文字を変えて2秒だけ残す。失敗したときは黙らず、その場で伝える
 * （権限が無い端末や、安全でない接続では使えない）。
 */
export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("done");
        } catch {
          setState("failed");
        }
      }}
      className="flex items-center gap-2 rounded-badge bg-brand-soft px-4 py-2
                 text-xs font-bold text-brand-dark transition hover:bg-brand-line"
    >
      <IconCopy className="h-4 w-4 shrink-0" />
      {/* 結果は読み上げにも届ける */}
      <span role="status">
        {state === "done" ? "写しました" : state === "failed" ? "写せません" : "コピー"}
      </span>
    </button>
  );
}
