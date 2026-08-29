/**
 * コースの道のり。**この画面の主役。**
 *
 *     現在地チェック
 *       ↓
 *     STEP 1  AIに頼んでみる     Day1 / Day2 / Day3
 *       ↓
 *     Checkpoint
 *       ↓
 *     STEP 2  AIと考える         Day4 / Day5 / Day6
 *       ↓
 *     Checkpoint
 *       ↓
 *     STEP 3  AIで作る           Day7 / Day8
 *       ↓
 *     コース修了
 *
 * なぜ束ねるか
 * ------------
 * 8本を平らに並べると、8回ぶんの一本道に見える。始めた人が最初に
 * 思うのは「あと7回も押すのか」で、これは実際より長く感じる。
 * 3つに束ねて名前を付ければ、いま何をしている最中かが言葉で分かり、
 * 「あと2本でひと区切り」も読める。
 *
 * 現在地チェックは Day ではない
 * ------------------------------
 * 診断は始める前に自分の位置を見るもので、コースの1日目ではない。
 * 受けなくても Day1 から始められるので、Day の数にも入れない。
 * 左の列には Day 番号ではなく「はじめに」と出す。
 *
 * ここに説明を積まない
 * --------------------
 * 1本ずつの Goal・完成イメージ・覚えるAI技・使いどころは、
 * **レッスンを開いた最初の画面**（完成イメージ）が持つ。ここに
 * 全部並べると、始める前に8本ぶんを読み下すことになる。
 * ここに出すのは題と一言だけ。
 *
 * Checkpoint は飾りではない
 * -------------------------
 * 通り過ぎた節目は「ここまでで何ができるようになったか」を持っている
 * （完了画面の CourseCheckpoint と同じ考え方）。まだのものは、
 * 何本先かだけを静かに出す。
 */

import { LessonTimeline } from "../lessons/LessonTimeline";
import { IconCheck, IconMedal } from "../Icons";
import { isComingSoon } from "../../course/availability";
import type { CourseOutline as Outline, OutlineStep } from "../../course/outline";
import type { Lesson } from "../../course/types";

export interface CourseOutlineProps {
  outline: Outline;
  /** 終えたレッスンの id。 */
  completed: string[];
  /** いま進む1本。無ければ null。 */
  currentId: string | null;
  bookmarked: (lessonId: string) => boolean;
  onToggleBookmark?: (lessonId: string) => void;
  onSelect: (lessonId: string) => void;
}

export function CourseOutline({
  outline,
  completed,
  currentId,
  bookmarked,
  onToggleBookmark,
  onSelect,
}: CourseOutlineProps) {
  const done = new Set(completed);
  const allDaysDone =
    outline.startableDays.length > 0 &&
    outline.startableDays.every((lesson) => done.has(lesson.id));

  return (
    <div data-testid="course-outline">
      {outline.orientation.length > 0 && (
        <section aria-labelledby="outline-orientation">
          <StageHeading id="outline-orientation" eyebrow={null} title="現在地チェック" />
          <LessonTimeline
            lessons={outline.orientation}
            completed={completed}
            currentId={currentId}
            bookmarked={bookmarked}
            onSelect={onSelect}
            // Day として数えない。番号を出すと1日目に見える
            label={() => "はじめに"}
            testId="outline-timeline-orientation"
          />
        </section>
      )}

      {outline.steps.map((step, index) => (
        <section
          key={step.key || index}
          aria-labelledby={`outline-step-${index}`}
          data-testid={`outline-step-${step.key || index}`}
        >
          <StageHeading
            id={`outline-step-${index}`}
            eyebrow={step.number === null ? null : `STEP ${step.number}`}
            title={step.title}
          />
          <LessonTimeline
            lessons={step.lessons}
            completed={completed}
            currentId={currentId}
            bookmarked={bookmarked}
            onToggleBookmark={onToggleBookmark}
            onSelect={onSelect}
            testId={`outline-timeline-${step.key || index}`}
          />
          {/*
            最後の STEP のあとは Checkpoint ではなく修了。
            節目を置いてから修了を置くと、同じことを2回言うことになる。
          */}
          {index < outline.steps.length - 1 && (
            <Checkpoint step={step} completed={done} />
          )}
        </section>
      ))}

      <CourseComplete reached={allDaysDone} />
    </div>
  );
}

// ------------------------------------------------------------------ 見出し

/**
 * STEP の見出し。
 *
 * カードで囲わない。3つを同じ形の箱で積むと、中身ではなく
 * 「箱の列」が目に入る。左の線1本で束を示す。
 */
function StageHeading({
  id,
  eyebrow,
  title,
}: {
  id: string;
  eyebrow: string | null;
  title: string;
}) {
  return (
    <div className="mt-7 border-l-2 border-brand pl-3 first:mt-0">
      {eyebrow && (
        <p className="text-[0.6875rem] font-bold leading-5 tracking-wide text-brand">
          {eyebrow}
        </p>
      )}
      <h3 id={id} className="text-sm font-bold leading-6">
        {title}
      </h3>
    </div>
  );
}

// -------------------------------------------------------------- Checkpoint

/**
 * 節目。
 *
 * 通り過ぎたかどうかで言うことを変える。まだのものに
 * 「おめでとう」を先に置かない（憲章 原則 I：無いものを見せない）。
 */
function Checkpoint({ step, completed }: { step: OutlineStep; completed: Set<string> }) {
  const startable = step.lessons.filter((lesson) => !isComingSoon(lesson));
  const left = startable.filter((lesson) => !completed.has(lesson.id)).length;
  const reached = startable.length > 0 && left === 0;

  return (
    <div
      data-testid="outline-checkpoint"
      data-reached={reached}
      className={`mt-3 flex items-center gap-2 rounded-card px-3 py-2 text-xs leading-6
                  ${reached ? "bg-brand-soft text-brand-dark" : "text-ink-muted"}`}
    >
      {reached ? (
        <IconCheck className="h-4 w-4 shrink-0" />
      ) : (
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-line" />
      )}
      <span>
        <span className="font-bold">チェックポイント</span>
        {reached ? "・ここまで終わりました" : `・あと${left}本`}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ 修了

function CourseComplete({ reached }: { reached: boolean }) {
  return (
    <div
      data-testid="outline-complete"
      data-reached={reached}
      className={`mt-4 flex items-center gap-2 rounded-card px-3 py-2.5 text-xs leading-6
                  ${reached ? "bg-brand-soft text-brand-dark" : "text-ink-muted"}`}
    >
      <IconMedal className={`h-4 w-4 shrink-0 ${reached ? "" : "opacity-40"}`} />
      <span className="font-bold">コース修了</span>
    </div>
  );
}

/** 現在地チェックを終えているか。ホームなどからも使えるように外へ出す。 */
export function orientationDone(orientation: Lesson[], completed: string[]): boolean {
  const done = new Set(completed);
  return orientation.length > 0 && orientation.every((lesson) => done.has(lesson.id));
}
