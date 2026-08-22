import { comingSoonNote, isComingSoon } from "../../course/availability";
import { lessonThumbnail } from "../../course/lessonThumbnail";
import type { Lesson } from "../../course/types";
import { lookOf } from "../../course/presentation";
import { LessonThumbnail, LessonThumbnailPlaceholder } from "./LessonThumbnail";

/** 探す場面専用。絵を読める大きさで見せ、道のりの行とは役割を分ける。 */
export function LessonDiscoveryCard({
  lesson,
  onSelect,
}: {
  lesson: Lesson;
  onSelect: () => void;
}) {
  const soon = isComingSoon(lesson);
  const thumbnail = lessonThumbnail(lesson);
  const look = lookOf(lesson.id);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        disabled={soon}
        data-testid={`lesson-${lesson.id}`}
        className={`h-full w-full overflow-hidden rounded-panel border border-line bg-surface
                    text-left shadow-card transition hover:border-brand disabled:cursor-not-allowed
                    ${soon ? "opacity-60" : ""}`}
      >
        {thumbnail ? (
          <LessonThumbnail src={thumbnail} variant="banner" className="rounded-none" dimmed={soon} />
        ) : (
          <LessonThumbnailPlaceholder
            icon={look.icon}
            variant="banner"
            className="rounded-none"
          />
        )}
        <span className="block p-4">
          <span className="block text-base font-bold leading-7">{lesson.title}</span>
          <span className="mt-1 block text-sm leading-6 text-ink-muted">{lesson.goal}</span>
          <span className="mt-2 block text-xs font-bold text-brand-dark">
            {soon
              ? comingSoonNote(lesson)
              : lesson.estimatedMinutes !== undefined
                ? `約${lesson.estimatedMinutes}分`
                : "始める"}
          </span>
        </span>
      </button>
    </li>
  );
}
