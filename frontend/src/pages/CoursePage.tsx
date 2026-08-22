/**
 * コース一覧（下タブの「コース」）。
 *
 * ここは**コースを選ぶ**場所。1つのコースの中身は出さない。
 *
 * 前はこの画面が、いきなり9本のレッスンを並べていた。名前は
 * 「コース一覧」でも、見せていたのは1つのコースの中身で、
 * コースが7つに増えた時点で名前と中身が食い違っていた。
 * 「どのコースにするか」を決めたい人には、決めるための材料が
 * どこにも無かった。
 *
 * 3階層にする
 * -----------
 *     コース一覧（ここ） → コースの中身 → レッスン
 *
 * 1段目で選び、2段目で道のり（Day 0 / Day 1 …）を見て、
 * 3段目で学ぶ。段を飛ばすと、どこにいるのか分からなくなる。
 *
 * 先頭は「学習中」
 * ----------------
 * この画面を開く人がいちばん多く求めているのは、探すことではなく
 * **続きに戻る**こと。7つを同じ形で並べると、続きに戻るのに毎回
 * 自分の1本を探し直すことになる。続きの1本だけは形を変えて上に置く。
 *
 * 下は同じ形でそろえる
 * --------------------
 * 「すべてのコース」は、高さも中身の順番も同じカードで積む。
 * 揃っていないと、比べているのが中身ではなくカードの形になる。
 * 出すのは 絵 → 題 → ひとこと → 本数 → 進み具合か近日公開、の順。
 */

import { AppHeader } from "../components/AppShell";
import { CourseCard } from "../components/course/CourseCard";
import { CurrentCourseCard } from "../components/course/CurrentCourseCard";
import { PoAvatar } from "../po/PoAvatar";
import { useCourse, useCourses } from "../course/live";
import { isCourseComingSoon } from "../course/availability";
import { useCompletedLessons } from "../course/progress";

export interface CoursePageProps {
  /** コースの中身へ入る。 */
  onOpenCourse: (courseId: string) => void;
  /** 続きの1本を直接ひらく。 */
  onSelectLesson: (lessonId: string) => void;
}

export function CoursePage({ onOpenCourse, onSelectLesson }: CoursePageProps) {
  const current = useCourse();
  const courses = useCourses();
  const completed = useCompletedLessons();

  /*
    下の一覧からは、学習中のコースを外す。

    同じ題が1画面に2回出ると、上と下が別のものに見える
    （実際、並べてみるとそう見えた）。上に出ているものは
    上で完結させて、下は「まだ手を付けていないもの」にする。
  */
  const others = courses.filter((entry) => entry.id !== current.id);

  return (
    <>
      <AppHeader />

      <main className="page">
        <h1 className="text-xl font-bold">コース</h1>

        {/* 案内役として小さく。ここの主役はコースのほう */}
        <div className="mt-3">
          <PoAvatar
            po={{
              message: "できることを、ひとつずつ増やそう。",
              emotion: "talking",
              action: "wait",
            }}
            compact
          />
        </div>

        <section className="mt-6" aria-labelledby="current-heading">
          <h2 id="current-heading" className="section-title">
            学習中
          </h2>
          <div className="mt-2">
            <CurrentCourseCard
              course={current}
              completedIds={completed}
              onOpen={() => onOpenCourse(current.id)}
              onContinue={onSelectLesson}
            />
          </div>
        </section>

        {/* 学習中の1本しか無い日は、この節ごと出さない */}
        {others.length > 0 && (
          <section className="mt-7" aria-labelledby="all-heading">
            <h2 id="all-heading" className="section-title">
              すべてのコース
            </h2>

            <ul className="mt-2 space-y-3" role="list" data-testid="all-courses">
              {others.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  completedIds={completed}
                  /*
                    近日公開のコースには渡さない。押せるのに何も
                    起きないものを作らない（CourseCard が自分で薄くする）。
                  */
                  onOpen={
                    isCourseComingSoon(course)
                      ? undefined
                      : () => onOpenCourse(course.id)
                  }
                />
              ))}
            </ul>

            <p className="mt-3 text-xs leading-6 text-ink-muted">
              近日公開のものは、いま作っています。できたものから開いていきます。
            </p>
          </section>
        )}
      </main>
    </>
  );
}
