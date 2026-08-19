/**
 * 教材一覧（下タブの「教材一覧」）。
 *
 * ホームが「今日どこから始めるか」を見せる場所なのに対し、
 * ここは全体を並べて見渡す場所。
 *
 * 並べ方は**縦一列の目次**にする。1件ずつを白い角丸カードで囲わない。
 * 9件を同じ形のカードで積むと、内容ではなく「カードの列」が目に入り、
 * どれも同じ重さに見える。番号・題・ねらい・時間を桁でそろえた行に
 * すれば、視線がまっすぐ下へ流れ、比べるのも探すのも速い。
 *
 * やめたもの
 * ----------
 * - 淡色の角丸四角＋線画アイコン（IconBadge lg） … 全件に付くと、
 *   絵のほうが題より強くなる
 * - 「おすすめ」pill … 最初にやる1本は、一覧の先頭に置いて
 *   「まずはここから」と書けば伝わる
 * - 「近日公開」の青い pill ＋ 錠前 … 押せないものほど静かに置く。
 *   薄い文字と opacity と cursor で伝える
 * - 「初級」pill … 全件が初級なので、1件ずつに書く意味が無い
 *
 * ここに出すのは**自分のこと**だけ。
 * 順位も、他の人との比較も出さない。
 * 比べさせると、遅い人ほど続かなくなる。
 */

import { useEffect, useState } from "react";

import { AppHeader } from "../components/AppShell";
import { IconCheck } from "../components/Icons";
import { PoAvatar } from "../po/PoAvatar";
import { lookupLesson, useCourse } from "../course/live";
import {
  comingSoonNote,
  hasComingSoonDetail,
  isComingSoon,
  startableLessons,
} from "../course/availability";
import { loadRecommendations } from "../course/recommend";
import { useCompletedLessons } from "../course/progress";
import type { Lesson } from "../course/types";

export interface CoursePageProps {
  onSelectLesson: (lessonId: string) => void;
}

/**
 * 一覧の1行。
 *
 * 左に2桁の番号、右に所要時間。あいだに題とねらい。
 * 番号を桁でそろえるのは飾りではなく、9件の順番を
 * 一目で追えるようにするため。
 */
function LessonRow({
  lesson,
  done,
  firstUp,
  onSelect,
}: {
  lesson: Lesson;
  done: boolean;
  /** 最初にやる1本。先頭に置いたうえで、ここだけ短く添える。 */
  firstUp: boolean;
  onSelect: () => void;
}) {
  const soon = isComingSoon(lesson);

  const meta = [
    lesson.estimatedMinutes !== undefined ? `${lesson.estimatedMinutes}分` : null,
    lesson.usesAi ? null : "AIは使いません",
  ].filter((part): part is string => part !== null);

  return (
    <li>
      {/*
        近日公開の教材も一覧には出す。何が来るのか分かるほうが、
        いま1本しか無いことの説明にもなる。ただし押せなくする。
        押せることと見えることを、見た目でも読み上げでも分ける。
      */}
      <button
        type="button"
        onClick={onSelect}
        disabled={soon}
        aria-disabled={soon}
        data-testid={`lesson-${lesson.id}`}
        data-availability={soon ? "coming_soon" : "available"}
        className={`row row-tap items-baseline disabled:cursor-not-allowed
                    ${soon ? "opacity-55" : ""}`}
      >
        <span
          aria-hidden="true"
          className="w-6 shrink-0 text-xs tabular-nums text-ink-muted"
        >
          {String(lesson.number).padStart(2, "0")}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 text-sm font-bold leading-6">
              {lesson.title}
            </span>
            {/* 状態を色だけで表さない。必ず文字か印を添える */}
            {done && (
              <IconCheck
                className="h-4 w-4 shrink-0 self-center text-brand"
                aria-label="おわった"
              />
            )}
          </span>

          <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
            {lesson.goal}
          </span>

          {/*
            補足は1行にまとめる。1つずつ囲うと添え物が主役になる。

            中黒は要素のあいだにだけ入れる。頭に付けると
            「・AIは使いません」のように、何かが抜け落ちて見える
            （所要時間の無い診断で実際にそうなった）。
          */}
          <span className="mt-1 block text-xs text-ink-muted">
            {soon ? (
              hasComingSoonDetail(lesson) ? comingSoonNote(lesson) : "近日公開"
            ) : (
              <>
                {meta.join("・")}
                {firstUp && (
                  <span className="font-bold text-brand-dark">
                    {meta.length > 0 && "・"}まずはここから
                  </span>
                )}
              </>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

export function CoursePage({ onSelectLesson }: CoursePageProps) {
  const course = useCourse();
  const completed = useCompletedLessons();
  const [recommended, setRecommended] = useState<string[]>([]);

  useEffect(() => {
    setRecommended(loadRecommendations());
  }, []);

  // 進捗の分母は「始められる教材」だけ。近日公開を混ぜると
  // 始めようのないもので割ることになり、いつまでも終わらない
  const startable = startableLessons(course.lessons);

  /*
    「まずはここから」を付ける1本。

    診断のおすすめのうち、まだ終わっていないもの。無ければ
    始められる教材の最初。付けるのは1本だけ——複数に付けると、
    どれから始めればよいかが結局分からない。
  */
  const firstUpId =
    startable.find(
      (lesson) => recommended.includes(lesson.id) && !completed.includes(lesson.id),
    )?.id ?? startable.find((lesson) => !completed.includes(lesson.id))?.id;

  const skills = completed
    .map((id) => lookupLesson(id))
    .filter((lesson): lesson is Lesson => lesson !== null)
    .flatMap((lesson) => lesson.outcomes);

  return (
    <>
      <AppHeader />

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-4">
        <h1 className="text-xl font-bold">{course.title}</h1>
        <p className="mt-1.5 text-sm leading-7 text-ink-muted">{course.description}</p>

        {/*
          できるようになったこと。

          以前は白いカードの中に丸いチップを並べていた。ここは
          押せないので、チップにする理由が無い。中黒でつないだ
          1本の文にすれば、読むだけで済む。
        */}
        {skills.length > 0 && (
          <section className="mt-5 border-l-2 border-brand pl-3" aria-labelledby="skills-heading">
            <h2 id="skills-heading" className="section-title">
              できるようになったこと
            </h2>
            <p className="mt-1 text-sm leading-7 text-ink-muted">
              {[...new Set(skills)].join("・")}
            </p>
          </section>
        )}

        <section className="mt-7" aria-labelledby="lessons-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="lessons-heading" className="section-title">
              レッスン
            </h2>
            <span className="text-xs text-ink-muted">
              いま {startable.length} / {course.lessons.length} 本
            </span>
          </div>

          <ul className="mt-2" role="list">
            {course.lessons.map((lesson) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                done={completed.includes(lesson.id)}
                firstUp={lesson.id === firstUpId}
                onSelect={() => onSelectLesson(lesson.id)}
              />
            ))}
          </ul>

          <p className="mt-3 text-xs leading-6 text-ink-muted">
            残りは順次公開します。
          </p>
        </section>

        <div className="mt-8">
          <PoAvatar
            po={{
              message:
                completed.length === 0
                  ? "まずは診断から。3つ答えるだけで、合いそうなものが分かります。"
                  : "続けていますね。1日ひとつで十分です。",
              emotion: completed.length === 0 ? "question" : "celebrate",
              action: "wait",
            }}
            compact
          />
        </div>
      </main>
    </>
  );
}
