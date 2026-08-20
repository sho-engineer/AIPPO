/**
 * 教材一覧の1行。
 *
 * 左に2桁の番号、右に所要時間。あいだに題とねらい。
 * 番号を桁でそろえるのは飾りではなく、並んだ何件かの順番を
 * 一目で追えるようにするため。
 *
 * 一覧（CoursePage）と「保存したもの」（SavedPage）の両方が使う。
 * 同じ教材の見え方が場所によって違うと、同じものだと気づけない。
 */

import { IconBookmark, IconCheck } from "../Icons";
import { IconMark } from "../AppShell";
import { lookOf } from "../../course/presentation";
import {
  comingSoonNote,
  hasComingSoonDetail,
  isComingSoon,
} from "../../course/availability";
import type { Lesson } from "../../course/types";

export function LessonRow({
  lesson,
  done,
  firstUp,
  bookmarked,
  onToggleBookmark,
  testIdPrefix,
  onSelect,
}: {
  lesson: Lesson;
  done: boolean;
  /** 最初にやる1本。先頭に置いたうえで、ここだけ短く添える。 */
  firstUp: boolean;
  bookmarked: boolean;
  /** 近日公開の教材では渡さない。始められないものは取っておけない。 */
  onToggleBookmark?: () => void;
  /**
   * 目印の一覧に出すときの前置き。
   *
   * 同じ教材が「あとで見る」と下の一覧の両方に出る。`data-testid` が
   * 二重になると、テストもE2Eも「どちらの行か」を指せなくなる。
   * 既存の id（`lesson-…`）は下の一覧のまま変えない。
   */
  testIdPrefix?: string;
  onSelect: () => void;
}) {
  const soon = isComingSoon(lesson);
  const prefix = testIdPrefix ?? "";
  const look = lookOf(lesson.id);

  const meta = [
    lesson.estimatedMinutes !== undefined ? `${lesson.estimatedMinutes}分` : null,
    lesson.usesAi ? null : "AIは使いません",
  ].filter((part): part is string => part !== null);

  return (
    /*
      目印のボタンは、行のボタンの**中**には置けない（button の入れ子は
      不正で、読み上げも押下も壊れる）。並べて置き、行のほうを伸ばす。
    */
    <li className="flex items-stretch">
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
        data-testid={`${prefix}lesson-${lesson.id}`}
        data-availability={soon ? "coming_soon" : "available"}
        className={`row row-tap items-baseline disabled:cursor-not-allowed
                    ${soon ? "opacity-55" : ""}`}
      >
        {/*
          用途の印。番号だけの行が9つ並ぶと、どれも同じ重さに見えて
          「文字の一覧」になる。小さな線画を1つ置くだけで、
          縦に流し読みするときの手がかりになる（大きな絵は置かない）。
        */}
        <span
          aria-hidden="true"
          className="flex w-8 shrink-0 items-center gap-1.5 self-center"
        >
          <span className="text-[0.6875rem] tabular-nums text-ink-muted">
            {String(lesson.number).padStart(2, "0")}
          </span>
          <IconMark
            icon={look.icon}
            tone={look.tone === "plain" ? "brand" : look.tone}
            className="h-4 w-4"
          />
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
                {/*
                  色だけで「付いている」を表さない。印の色が見えない人にも、
                  ここの文字で分かるようにする
                */}
                {bookmarked && <>{(meta.length > 0 || firstUp) && "・"}あとで見る</>}
              </>
            )}
          </span>
        </span>
      </button>

      {/*
        取っておく。始められる教材にだけ出す——近日公開のものを
        取っておけても、開ける日まで何も起きない。
      */}
      {onToggleBookmark && (
        <button
          type="button"
          onClick={onToggleBookmark}
          aria-pressed={bookmarked}
          aria-label={
            bookmarked ? `${lesson.title}をあとで見るから外す` : `${lesson.title}をあとで見る`
          }
          data-testid={`${prefix}bookmark-${lesson.id}`}
          className="row-tap flex shrink-0 items-center border-b border-line px-2
                     text-ink-muted aria-pressed:text-brand"
        >
          <IconBookmark className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}
