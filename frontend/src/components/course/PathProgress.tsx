/**
 * 学習の道のりの進み具合。**上に小さく置くための1かたまり。**
 *
 * 中身はスタンプの列と、次の節目までの予告だけ。ホームでは
 * 「道のりを見る」を添えて、コースの詳細（縦の道のり）へ渡す。
 * 道のりの画面自体では、ボタンを渡さずに見出しとして使う——
 * すでにその画面にいる人に、同じ画面への入口は要らない。
 *
 * 大きくしない
 * ------------
 * ここは扉の絵ではない。スタンプは集める楽しさのためにあるが、
 * 今日の1本より背が高くなった時点で、目的と手段が入れ替わる。
 * 見出し1行・丸の列1行・予告1行に収める。
 *
 * 数字はここでは言わない
 * ----------------------
 * 「n / m」はホーム上部の1行（HomeStats）が持っている。同じ数を
 * 2か所に出すと、片方を直したときにもう片方がずれる。
 */

import { IconChevronRight } from "../Icons";
import { CourseStampRow, NextMilestoneHint } from "./CourseStamps";
import type { Course } from "../../course/types";

export interface PathProgressProps {
  course: Course;
  /** 終えた数。分母は「始められるもの」だけ（近日公開を混ぜない）。 */
  done: number;
  total: number;
  /** 見出し。道のりの画面では「スタンプ」のように言い換える。 */
  heading?: string;
  /**
   * 右上にコース名を出すか。
   *
   * ホームでは「どのコースの道のりか」が分からないので出す。
   * 道のりの画面では、すぐ上に大きく題が出ているので出さない
   * （同じ言葉を1画面に二度書かない）。
   */
  showCourseTitle?: boolean;
  /** 道のりの画面へ。渡さなければボタンは出ない。 */
  onOpenPath?: () => void;
  /**
   * 面で囲うか。
   *
   * ホームでは囲わない。1画面で囲ってよいのは「今日の1本」だけで、
   * 白い面が2つ3つと浮くと、どれが本題かが分からなくなる。
   * 道のりの画面ではそこが本題なので、囲ったままにする。
   */
  framed?: boolean;
}

export function PathProgress({
  course,
  done,
  total,
  heading = "学習の道のり",
  showCourseTitle = false,
  onOpenPath,
  framed = true,
}: PathProgressProps) {
  return (
    <section
      aria-labelledby="path-progress-heading"
      data-testid="path-progress"
      className={
        framed
          ? "rounded-panel border border-line bg-surface px-4 py-3.5 shadow-card"
          : ""
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="path-progress-heading" className="text-sm font-bold">
          {heading}
        </h2>
        {/* どのコースの道のりかは、題で言う。切り詰めても行を折らない */}
        {showCourseTitle && (
          <span className="min-w-0 truncate text-xs text-ink-muted">
            {course.title}
          </span>
        )}
      </div>

      <div className="mt-2">
        <CourseStampRow course={course} done={done} total={total} />
        <NextMilestoneHint course={course} done={done} />
      </div>

      {onOpenPath && (
        <button
          type="button"
          onClick={onOpenPath}
          data-testid="open-path"
          className="row-tap mt-2 flex w-full items-center justify-center gap-1
                     rounded-cta border border-brand-line px-4 py-2.5 text-sm
                     font-bold text-brand transition hover:border-brand"
        >
          道のりを見る
          <IconChevronRight className="h-4 w-4 shrink-0" />
        </button>
      )}
    </section>
  );
}
