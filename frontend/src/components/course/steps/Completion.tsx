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

import { Card, CardHeading, IconBadge } from "../../AppShell";
import { SaveProgressCard } from "../../auth/SaveProgressCard";
import { CourseCheckpoint } from "../CourseCheckpoint";
import { LessonAwardCard } from "../LessonAwardCard";
import { playSuccessSound } from "../../../course/sound";
import { KeepArtifactButton } from "../KeepArtifactButton";
import { SurveyCard } from "../SurveyCard";
import { LessonCelebration } from "../LessonCelebration";
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
  IconDocument,
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
  return (
    /*
      `relative` は紙吹雪の親。紙はこの枠の中だけで散り、
      画面全体を覆わない（覆うと、次に押す場所が読めなくなる）。
    */
    <div data-testid="completion-view" className="relative space-y-4">
      <LessonCelebration />

      {/*
        並びは 祝う → XP → AI技 → 成果物。
        数の前に祝いを置き、数のあとに持ち帰れるものを置く。
        数字で終わらせない。
      */}
      <LessonAwardCard award={award} />

      <Card>
        <CardHeading icon={IconStar} tone="plain">
          スキルを身につけました
        </CardHeading>
        <ul className="mt-4 space-y-2.5" role="list">
          {skills.map((skill) => (
            <li key={skill} className="flex items-start gap-2.5 text-sm leading-7">
              <IconCheckCircle className="mt-1.5 h-4 w-4 shrink-0 text-brand" />
              {skill}
            </li>
          ))}
        </ul>

        {outcomeText && (
          <div className="mt-5 border-t border-line pt-5">
            <CardHeading icon={IconDocument} tone="plain">
              今回の成果物
            </CardHeading>
            <div className="mt-3 rounded-card bg-canvas p-4">
              <p className="text-xs font-bold text-ink-muted">{outcomeLabel}</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">
                {outcomeText}
              </p>
              {/*
                いま貼るのと、あとで出すのは別のこと。両方を並べて置く。
                取っておくには登録が要るが、ボタンは出しておき、
                押したときに理由を返す（先に消すと、そういう場所が
                あること自体が伝わらない）。
              */}
              <div className="mt-3 flex items-start justify-end gap-2">
                <KeepArtifactButton lessonId={lessonId} output={outcomeText} />
                <CopyButton text={outcomeText} />
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* 全体のどこまで来たか */}
      <Card>
        <p className="flex items-center justify-center gap-2 text-lg font-bold text-brand">
          <IconMedal className="h-6 w-6 shrink-0" />
          Lesson {lessonNumber} 完了
        </p>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-ink-muted">コース進捗</span>
            <span className="text-sm font-bold tabular-nums">
              {done} / {total}
            </span>
          </div>
          <div className="mt-2">
            <CourseStampRow course={course} done={done} total={total} />
          </div>
        </div>

        {/*
          節目の一覧。完走したときは、ここではなく専用の締めくくり
          （下の courseComplete）で祝う。二重に出すと、
          「どちらが本番か」が分からなくなる。
        */}
        {!courseComplete && (
          <div className="mt-4 border-t border-line pt-4">
            <MilestoneLegend course={course} done={done} />
          </div>
        )}
      </Card>

      {/*
        節目に届いた回だけ、Po が軽く反応する。
        毎レッスンで祝うと、19歩ぶんの手応えの重さが均されて、
        逆に薄くなる。節目にだけ乗せるほうが効く。
      */}
      {/*
        コースの節目。**ここまでで何ができるようになったか**をまとめる。

        前はスタンプの数と特典の予告だけを出していた。数と、まだ
        使えない特典の話しか無く、積み上がったことが見えなかった。
        積み上がっていることは、積み上げた本人がいちばん気づきにくい。
      */}
      {crossed.length > 0 && !courseComplete && (
        <CourseCheckpoint
          course={course}
          completedIds={doneSoFar}
          atCount={crossed[0].atCount}
          rewardLabel={crossed[0].label}
        />
      )}

      {/*
        登録の誘いは、ここ以外に置かない。
        作ったものが目の前にある、この1回だけ聞く。
        ログイン済みの人には何も出ない。
      */}
      <SaveProgressCard />

      {/*
        アンケートは登録の誘いのあと、次の教材より前に出す。
        いちばん下だと、次を選んで離れた人には見えない。
      */}
      <SurveyCard lessonId={lessonId} />

      {/*
        「これで何ができるか」を、次のレッスンより前に置く。
        練習しただけで終わらせず、仕事の場面に結びつけてから
        次へ進んでもらう。

        いま終えたレッスンを、足りない技として案内しない
        --------------------------------------------------
        `completedIds` には、この画面を出している時点ではまだ
        いまのレッスンが入っていない（`done` の数え方と同じ理由。
        このファイル冒頭のコメント参照）。素通しすると、
        たったいま終えたばかりの技を「学ぶ→」と案内してしまう。
      */}
      <AppliedTips
        tips={appliedTipsFor(lessonId)}
        lessonTitle={(id) => lookupLesson(id)?.title ?? null}
        completedIds={
          completedIds.includes(lessonId) ? completedIds : [...completedIds, lessonId]
        }
        onSelectLesson={onSelectLesson}
        onOpenRecipe={onOpenRecipe}
      />

      {/*
        コースを完走した回だけの締めくくり。

        `next`（次におすすめ）は、このコースにもう教材が残っていないと
        空になる（StepRenderer が「同じコースで未完了のAIレッスン」だけ
        拾うため）。空のまま何も出さずに終わると、いちばん大きな
        節目のはずの回が、ふだんの回より静かに終わる。ここを埋める。
      */}
      {courseComplete && (
        <Card testId="course-complete" className="border-brand-line">
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

      {next.length > 0 && (
        <section aria-labelledby="next-heading">
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
                  /*
                    `h-full` を付ける。横に2枚並ぶ幅（sm 以上）では、
                    ねらいの行数が違うと下端がそろわない。
                  */
                  className="flex h-full w-full items-center gap-3 rounded-panel bg-surface
                             p-4 text-left shadow-card transition
                             enabled:hover:-translate-y-0.5 enabled:hover:shadow-raised
                             disabled:cursor-not-allowed"
                >
                  {/* 絵の無いレッスンでは置かない。並びは文字側で崩れない */}
                  {thumbnail && <LessonThumbnail src={thumbnail} variant="side" />}
                  <div className="min-w-0 flex-1">
                    <span className="inline-block rounded-badge bg-brand-soft px-2.5 py-1 text-[0.6875rem] font-bold text-brand-dark">
                      Lesson {lesson.number}
                    </span>
                    <h3 className="mt-2 text-sm font-bold leading-6">{lesson.title}</h3>
                    <p className="mt-1 text-xs leading-6 text-ink-muted">{lesson.goal}</p>
                    {/*
                      所要時間を出す。「次におすすめ」だけでは、
                      いま始めてよいものか決められない。
                      「あと7分なら」と判断できる材料をここに置く。
                    */}
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
