/**
 * コース1つぶんのカード。
 *
 * 出すのは4つだけ——題・ひとこと・本数・むずかしさ。
 * それに、始めた人には進み具合。
 *
 * 大きなカードを並べない
 * ----------------------
 * コースは7つある。1つずつを絵入りの大きなカードにすると、
 * 画面が「カードの列」になって、どれも同じ重さに見える。
 * ここは「何ができるようになるか」を読み比べる場所なので、
 * 文字が主役で足りる。
 *
 * 近日公開のときは押させない
 * --------------------------
 * 押せるのに何も起きないものを作らない。押せないことを、
 * 見た目（薄く・矢印を出さない）と読み上げ（disabled）の両方で伝え、
 * 理由をその行に書く。黙って無反応にはしない。
 */

import { IconBars, IconChevronRight, IconClock } from "../Icons";
import { IconMark } from "../AppShell";
import { courseComingSoonNote, isCourseComingSoon } from "../../course/availability";
import type { Course } from "../../course/types";

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: "初級",
  intermediate: "中級",
  advanced: "上級",
};

export interface CourseCardProps {
  course: Course;
  /** 終えたレッスンの id。進み具合の分子に使う。 */
  completedIds: string[];
  /** 押したとき。近日公開のコースでは渡さない。 */
  onOpen?: () => void;
}

export function CourseCard({ course, completedIds, onOpen }: CourseCardProps) {
  const soon = isCourseComingSoon(course);
  const total = course.lessons.length;
  const done = course.lessons.filter((lesson) =>
    completedIds.includes(lesson.id),
  ).length;

  const meta = [
    `全${total}レッスン`,
    DIFFICULTY_LABEL[course.difficulty ?? "beginner"] ?? "初級",
  ];

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        disabled={soon || !onOpen}
        aria-disabled={soon || !onOpen}
        data-testid={`course-${course.id}`}
        data-availability={soon ? "coming_soon" : "available"}
        className={`flex w-full items-start gap-3 rounded-panel border border-line
                    bg-surface p-4 text-left shadow-card transition
                    enabled:hover:border-brand-line enabled:active:scale-[0.995]
                    disabled:cursor-not-allowed ${soon ? "opacity-60" : ""}`}
      >
        <IconMark icon={IconBars} className="mt-0.5 h-5 w-5" />

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold leading-6">{course.title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-ink-muted">
            {course.description}
          </span>

          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span className="flex items-center gap-1">
              <IconClock className="h-3.5 w-3.5 shrink-0" />
              {meta.join("・")}
            </span>
            {/* 始めた人にだけ、どこまで来たかを添える */}
            {done > 0 && (
              <span className="font-bold tabular-nums text-brand-dark">
                {done} / {total} 完了
              </span>
            )}
          </span>

          {/*
            押せない理由は、その行に書く。
            「準備中」とだけ書くより、何を待っているのかが分かる。
          */}
          {soon && (
            <span className="mt-1.5 block text-xs leading-5 text-ink-muted">
              {courseComingSoonNote(course)}
            </span>
          )}
        </span>

        {!soon && onOpen && (
          <IconChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" />
        )}
      </button>
    </li>
  );
}
