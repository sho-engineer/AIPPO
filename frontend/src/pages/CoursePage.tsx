/**
 * コース一覧（下タブの「コース」）。
 *
 * ホームが「今日どこから始めるか」を見せる場所なのに対し、
 * ここは全体を並べて見渡す場所。役割を分けたので、ホームに
 * 一覧を積み上げる必要が無くなった。
 *
 * ここに出すのは**自分のこと**だけ。
 * 順位も、他の人との比較も出さない。
 * 比べさせると、遅い人ほど続かなくなる。
 */

import { useEffect, useState } from "react";

import { AppHeader, IconBadge, MetaPill } from "../components/AppShell";
import {
  IconBars,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconLock,
} from "../components/Icons";
import { PoAvatar } from "../po/PoAvatar";
import { lookupLesson, useCourse } from "../course/live";
import { comingSoonNote, isComingSoon, startableLessons } from "../course/availability";
import { lookOf } from "../course/presentation";
import { loadRecommendations } from "../course/recommend";
import { useCompletedLessons } from "../course/progress";
import type { Lesson } from "../course/types";

export interface CoursePageProps {
  onSelectLesson: (lessonId: string) => void;
}

function LessonCard({
  lesson,
  done,
  recommended,
  onSelect,
}: {
  lesson: Lesson;
  done: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  const look = lookOf(lesson.id);
  const soon = isComingSoon(lesson);

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
        className={`flex w-full gap-4 rounded-panel bg-surface p-4 text-left shadow-card
                    transition
                    enabled:hover:-translate-y-0.5 enabled:hover:shadow-panel
                    enabled:active:translate-y-0 enabled:active:scale-[0.99]
                    disabled:cursor-not-allowed
                    ${recommended && !soon ? "ring-2 ring-brand" : ""}`}
      >
        <div className="relative shrink-0">
          <IconBadge icon={look.icon} tone={done ? "brand" : look.tone} size="lg" />
          {/* 番号は絵の隅に小さく添える。絵と番号で二重に見分けられる */}
          <span
            aria-hidden="true"
            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center
                       rounded-full bg-surface text-[0.625rem] font-bold text-ink-muted
                       shadow-card"
          >
            {lesson.number}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 text-sm font-bold leading-6">{lesson.title}</h3>
            {/* 状態を色だけで表さない。必ず文字を添える */}
            {soon && (
              <span
                className="flex shrink-0 items-center gap-1 rounded-full bg-brand-soft
                           px-2.5 py-1 text-[0.6875rem] font-bold text-brand-dark"
              >
                <IconLock className="h-3 w-3" />
                近日公開
              </span>
            )}
            {!soon && done && (
              <span className="flex shrink-0 items-center gap-1 text-xs text-brand">
                <IconCheckCircle className="h-3.5 w-3.5" />
                おわった
              </span>
            )}
            {!soon && !done && recommended && (
              <span className="shrink-0 text-xs font-bold text-brand">おすすめ</span>
            )}
          </div>

          <p className="mt-1.5 text-xs leading-6 text-ink-muted">{lesson.goal}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-4">
            {lesson.estimatedMinutes !== undefined && (
              <MetaPill icon={IconClock} value={`${lesson.estimatedMinutes}分`} />
            )}
            <MetaPill icon={IconBars} value="初級" />
            {!lesson.usesAi && (
              <span className="text-xs text-ink-muted">AIは使いません</span>
            )}
          </div>

          {soon && (
            <p className="mt-2 text-xs leading-6 text-ink-muted">
              {comingSoonNote(lesson)}
            </p>
          )}
        </div>
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

  const skills = completed
    .map((id) => lookupLesson(id))
    .filter((lesson): lesson is Lesson => lesson !== null)
    .flatMap((lesson) => lesson.outcomes);

  return (
    <>
      <AppHeader />

      <main className="mx-auto max-w-2xl px-5 pb-28">
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">{course.title}</h1>
        <p className="mt-2 text-sm leading-7 text-ink-muted">{course.description}</p>

        {skills.length > 0 && (
          <section className="mt-6 rounded-panel bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold">できるようになったこと</h2>
            <ul className="mt-3 flex flex-wrap gap-2" role="list">
              {[...new Set(skills)].map((skill) => (
                <li
                  key={skill}
                  className="flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5
                             text-xs text-brand-dark"
                >
                  <IconCheck className="h-3.5 w-3.5 shrink-0" />
                  {skill}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-base font-bold">レッスン</h2>
          <p className="mt-1 text-xs text-ink-muted">
            いま始められるのは {startable.length} 本です。
            残りは順次公開します。
          </p>
          <ul className="mt-4 space-y-3" role="list">
            {course.lessons.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                done={completed.includes(lesson.id)}
                recommended={recommended.includes(lesson.id)}
                onSelect={() => onSelectLesson(lesson.id)}
              />
            ))}
          </ul>
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
