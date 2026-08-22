/**
 * いま学んでいるコース。一覧のいちばん上に1件だけ。
 *
 * 一覧を開く人がいちばん多く求めているのは「探す」ことではなく
 * 「**続きに戻る**」こと。7つのコースを同じ形で並べると、
 * 続きに戻るのに、毎回どれが自分の1本かを探し直すことになる。
 * だから、続きの1本だけは形を変えて先頭に置く。
 *
 * 出すのは4つ
 * -----------
 *   1. コース名
 *   2. どこまで来たか（帯と 2 / 9）
 *   3. つぎに開く1本の名前と、かかる時間
 *   4. そこへ入るボタン
 *
 * 3 が要る。「つづきから」とだけ書いてあるボタンは、押すまで
 * 何が始まるか分からない。次にやることが見えていれば、
 * 「いまは8分あるか」を押す前に決められる。
 *
 * 大きくしすぎない
 * ----------------
 * 目立たせたいのは事実だが、画面いっぱいの絵にすると、
 * その下の「すべてのコース」が1件も見えなくなる。
 * ここは目次の一部で、入口そのものではない（入口はホーム）。
 */

import { IconChevronRight, IconClock } from "../Icons";
import { courseIcon } from "../../course/courseVisual";
import { courseProgress } from "../../course/courseProgress";
import { courseBanner } from "../../course/courseBanner";
import type { Course } from "../../course/types";

export interface CurrentCourseCardProps {
  course: Course;
  completedIds: string[];
  /** カードを押したとき。コースの中身へ入る。 */
  onOpen: () => void;
  /** 「つづきから」を押したとき。次の1本を直接ひらく。 */
  onContinue: (lessonId: string) => void;
}

export function CurrentCourseCard({
  course,
  completedIds,
  onOpen,
  onContinue,
}: CurrentCourseCardProps) {
  const progress = courseProgress(course, completedIds);
  const Icon = courseIcon(course.id);
  const banner = courseBanner(course.id);

  return (
    <section
      className="overflow-hidden rounded-panel border border-brand-line bg-surface shadow-card"
      aria-labelledby="current-course-title"
      data-testid={`current-course-${course.id}`}
    >
      {/*
        題そのものを押せるようにする。カード全体を1つのボタンにすると、
        中の「つづきから」が入れ子のボタンになって押せなくなる。
      */}
      {banner && (
        <button type="button" onClick={onOpen} className="block w-full">
          <img
            src={banner}
            alt=""
            aria-hidden="true"
            width={1258}
            height={410}
            loading="eager"
            decoding="async"
            className="block h-auto w-full border-b border-brand-line object-cover"
            data-testid="course-banner"
          />
        </button>
      )}

      <div className="p-4">
        <button
          type="button"
          onClick={onOpen}
          data-testid="current-course-open"
          className="flex w-full items-start gap-3 text-left"
        >
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center
                       rounded-card bg-brand-soft text-brand"
          >
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span id="current-course-title" className="block text-base font-bold leading-6">
              {course.title}
            </span>
          </span>
          <IconChevronRight className="mt-1 h-5 w-5 shrink-0 text-ink-muted" />
        </button>

      {/* どこまで来たか。帯と数字を並べる（片方だけだと読み取りにくい） */}
        <div className="mt-3 flex items-center gap-3">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-brand-line"
          role="progressbar"
          aria-valuenow={progress.done}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-label={`${course.title}の進み具合`}
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300"
            style={{ width: `${progress.ratio * 100}%` }}
          />
        </div>
        <span
          className="shrink-0 text-xs font-bold tabular-nums text-ink-muted"
          data-testid="current-course-count"
        >
          {progress.done} / {progress.total}
        </span>
        </div>

        {progress.next ? (
        <>
          <p className="mt-3 text-sm leading-6">
            <span className="text-ink-muted">次：</span>
            <span className="font-bold">{progress.next.title}</span>
          </p>

          <div className="mt-3 flex items-center justify-between gap-3">
            {progress.next.estimatedMinutes !== undefined ? (
              <span className="flex items-center gap-1 text-xs text-ink-muted">
                <IconClock className="h-3.5 w-3.5 shrink-0" />約
                {progress.next.estimatedMinutes}分
              </span>
            ) : (
              <span />
            )}

            <button
              type="button"
              onClick={() => onContinue(progress.next!.id)}
              data-testid="current-course-continue"
              className="min-h-[2.75rem] rounded-cta bg-brand px-5 py-2 text-sm
                         font-bold text-white shadow-cta transition
                         hover:brightness-110 active:scale-[0.98]"
            >
              {progress.fresh ? "はじめる" : "つづきから"}
            </button>
          </div>
        </>
        ) : (
        /*
          全部終えている。ここで「つづきから」を出すと、押した先が無い。
          終えたことを言って、コースの中（見返し）へ行けるようにする。
        */
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          このコースは全部終えました。見返すこともできます。
        </p>
        )}
      </div>
    </section>
  );
}
