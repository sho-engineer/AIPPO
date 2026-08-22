/**
 * コースの道のり。**縦に1本の線でつなぐ。**
 *
 * ここは「教材を探す場所」ではなく、「順番に進む場所」。
 * 見たいのは *どこまで来て、次はどれか* の1点だけなので、
 * 1件ずつの絵は置かない——小さく並べた絵は中身が読めないうえ、
 * 題が絵の中にも外にも出て、同じ言葉を二度読ませることになる。
 *
 * 絵を消したわけではない
 * ----------------------
 * 絵は「発見する」ための道具として、ホームの今日の1本・検索結果・
 * あとで見る・完了画面の「次におすすめ」が持っている。
 * 同じレッスンには、どこでも同じ絵が出る（course/lessonThumbnail.ts）。
 *
 * 桁をそろえる
 * ------------
 * 3列の格子で組む。
 *
 *     56px      … Day n（幅を固定する）
 *     24px      … 節と、上下をつなぐ線
 *     残り全部  … 題・状態・（いまの1本だけ）ボタン
 *
 * 幅を固定しないと、題の長さで Day の位置が動き、9行を縦に
 * 読み下せなくなる。**題の始まる位置が全行でそろう**ことが、
 * この画面のいちばん大事な性質。
 *
 * 状態は4つだけ
 * -------------
 *   完了      … チェックの入った丸
 *   いま      … 塗りつぶした丸（AIPPO の青）＋淡い輪
 *   これから  … 輪郭だけの丸
 *   準備中    … 灰色の点と錠前。押せない
 *
 * 状態は**教材データ**が決める（availability）。絵の有無では決めない。
 * 絵だけ先に用意してあるレッスンが、それだけで始められると
 * 読めてしまってはいけない。
 *
 * ゲームにしない
 * --------------
 * 道のりの形は参考にしているが、見た目は静かに保つ。光らせない、
 * 曲げない、跳ねさせない。進んだ実感はスタンプが持っている。
 *
 * 押せる場所は「いま」だけ
 * ------------------------
 * ボタンの形にするのは、いま進む1本だけ。他の始められる回は
 * 行そのものを押せばよい。押せる面が縦に9つ並ぶと、どれが次なのかが
 * 形からは分からなくなる。
 */

import { IconBookmark, IconCheck, IconChevronRight, IconLock } from "../Icons";
import {
  comingSoonNote,
  hasComingSoonDetail,
  isComingSoon,
} from "../../course/availability";
import type { Lesson } from "../../course/types";

/** 状態。教材データと進捗から決まる。 */
export type LessonStepStatus = "completed" | "current" | "available" | "coming_soon";

export interface LessonTimelineProps {
  lessons: Lesson[];
  /** 終えた教材の id。 */
  completed: string[];
  /** いま進む1本。無ければ null（全部終えた、など）。 */
  currentId: string | null;
  /** 目印の付いている教材。 */
  bookmarked: (lessonId: string) => boolean;
  /** 目印を付け外しできないとき（ゲスト・近日公開）は渡さない。 */
  onToggleBookmark?: (lessonId: string) => void;
  onSelect: (lessonId: string) => void;
}

export function statusOf(
  lesson: Lesson,
  completed: string[],
  currentId: string | null,
): LessonStepStatus {
  /*
    順番が大事。近日公開かどうかを先に見ない。

    終えた教材があとから近日公開に戻ることがある（管理画面で
    公開範囲を絞った）。そのときは「準備中」ではなく「完了」を出す
    ——やったことを、あとから無かったことにしない。
  */
  if (completed.includes(lesson.id)) return "completed";
  if (isComingSoon(lesson)) return "coming_soon";
  if (lesson.id === currentId) return "current";
  return "available";
}

export function LessonTimeline({
  lessons,
  completed,
  currentId,
  bookmarked,
  onToggleBookmark,
  onSelect,
}: LessonTimelineProps) {
  return (
    <ol className="mt-2" role="list" data-testid="lesson-timeline">
      {lessons.map((lesson, index) => (
        <LessonStep
          key={lesson.id}
          lesson={lesson}
          status={statusOf(lesson, completed, currentId)}
          first={index === 0}
          last={index === lessons.length - 1}
          bookmarked={bookmarked(lesson.id)}
          onToggleBookmark={
            onToggleBookmark && !isComingSoon(lesson)
              ? () => onToggleBookmark(lesson.id)
              : undefined
          }
          onSelect={() => onSelect(lesson.id)}
        />
      ))}
    </ol>
  );
}

// ------------------------------------------------------------------- 1行

function LessonStep({
  lesson,
  status,
  first,
  last,
  bookmarked,
  onToggleBookmark,
  onSelect,
}: {
  lesson: Lesson;
  status: LessonStepStatus;
  first: boolean;
  last: boolean;
  bookmarked: boolean;
  onToggleBookmark?: () => void;
  onSelect: () => void;
}) {
  /*
    押せるかどうかは、見た目の状態ではなく**教材データ**で決める。

    終えた教材があとから近日公開に戻ることがある。そのとき状態は
    「完了」と出すが（やったことを消さない）、押した先は開けない。
    見た目の状態でボタンを開けてしまうと、押した先が行き止まりになる。
    最後の砦はサーバー（apps/catalog/access.py）。
  */
  const soon = isComingSoon(lesson);
  const current = status === "current";

  const meta = [
    lesson.estimatedMinutes !== undefined ? `${lesson.estimatedMinutes}分` : null,
    lesson.usesAi ? null : "AIは使いません",
    bookmarked ? "あとで見る" : null,
  ].filter((part): part is string => part !== null);

  return (
    /*
      目印のボタンは、行のボタンの**中**には置けない（button の入れ子は
      不正で、読み上げも押下も壊れる）。並べて置き、行のほうを伸ばす。
    */
    <li className="flex items-stretch">
      <button
        type="button"
        onClick={onSelect}
        disabled={soon}
        aria-disabled={soon}
        data-testid={`lesson-${lesson.id}`}
        data-availability={soon ? "coming_soon" : "available"}
        data-status={status}
        aria-current={current ? "step" : undefined}
        /*
          いまの1本だけ、ごく薄く地を敷く。

          色を強くしない。9行のうち1行だけ淡く沈んでいれば、
          縦に流し読みしたときに目が止まる。囲ったり光らせたりすると、
          道のりではなく「カードの列」に戻ってしまう。

          動かすのは**文字の側だけ**（下の min-w-0 の列）。行ごと
          動かすと、節も一緒に 8px ずれて、上下をつなぐ線が
          その間だけ切れる。道のりそのものは動かさない。
        */
        className={`grid w-full grid-cols-[3.5rem_1.5rem_minmax(0,1fr)] items-start
                    gap-x-3 rounded-card px-1 py-3 text-left transition
                    disabled:cursor-not-allowed
                    ${current ? "bg-brand-soft/50" : ""}
                    ${soon ? "" : "enabled:hover:bg-brand-soft/40 enabled:active:bg-brand-soft/70"}`}
      >
        {/*
          Day の列。幅を固定する。
          「Day 1」と書くのは、数字だけだと通し番号なのか日数なのかが
          この行だけでは決められないため。
        */}
        <span
          className={`pt-0.5 text-[0.6875rem] leading-6 tabular-nums
                      ${current ? "font-bold text-brand-dark" : "text-ink-muted"}
                      ${soon ? "opacity-70" : ""}`}
        >
          Day {lesson.number}
        </span>

        {/* 節と、上下をつなぐ線 */}
        <StepNode status={status} first={first} last={last} />

        {/*
          いまの1本だけ、開いたときに 8px ぶんだけ下から入れる（0.28 秒）。
          「ここが自分の位置」を、一度だけ目で示す。動かすのは文字だけで、
          場所は取らない（transform なので、節も線も動かない）。
          動きが苦手な人の設定では一瞬で終わる（index.css）。
        */}
        <span className={`min-w-0 ${current ? "animate-fade-up" : ""}`}>
          <span
            className={`block text-sm font-bold leading-6
                        ${status === "completed" || soon ? "text-ink-muted" : ""}`}
          >
            {lesson.title}
          </span>

          {/*
            状態は、色だけでなく必ず文字で言う。
            終わった回に日付は出さない——いつやったかは、ここで
            確かめたいことではない（記録の画面が持っている）。
          */}
          <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
            {status === "completed" ? (
              "完了"
            ) : soon ? (
              hasComingSoonDetail(lesson) ? comingSoonNote(lesson) : "近日公開"
            ) : (
              meta.join("・")
            )}
          </span>

          {/*
            いまの1本だけ、ねらいと進む口を出す。

            ボタンの形をしているが、押せるのは行そのもの（この span は
            行の中にある）。button を入れ子にはできないので、
            見た目だけを借りている。
          */}
          {current && (
            <>
              <span className="mt-1 block text-xs leading-6 text-ink-muted">
                {lesson.goal}
              </span>
              <span
                className="mt-2 inline-flex items-center gap-1 rounded-cta bg-brand
                           px-4 py-2 text-sm font-bold text-white shadow-cta"
              >
                はじめる
                <IconChevronRight className="h-4 w-4 shrink-0" />
              </span>
            </>
          )}
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
            bookmarked
              ? `${lesson.title}をあとで見るから外す`
              : `${lesson.title}をあとで見る`
          }
          data-testid={`bookmark-${lesson.id}`}
          className="row-tap flex shrink-0 items-start px-2 pt-4 text-ink-muted
                     aria-pressed:text-brand"
        >
          <IconBookmark className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

// ------------------------------------------------------------------ 節と線

/**
 * 丸と、上下へ伸びる線。
 *
 * 線は行の余白（py-3 ＝ 12px）ぶんまで伸ばして、隣の行の線と
 * つなぐ。1行ずつ内側で閉じると、行の切れ目で線が途切れて
 * 「1本の道」に見えなくなる。
 *
 * 先頭の行には上の線を、最後の行には下の線を引かない。
 * 引くと、上や下にまだ続きがあるように読める。
 */
function StepNode({
  status,
  first,
  last,
}: {
  status: LessonStepStatus;
  first: boolean;
  last: boolean;
}) {
  const done = status === "completed";
  const current = status === "current";

  return (
    <span className="relative block h-full w-6" aria-hidden="true">
      {!first && (
        <span className="absolute -top-3 left-1/2 h-3 w-px -translate-x-1/2 bg-line" />
      )}
      {!last && (
        <span className="absolute -bottom-3 left-1/2 top-6 w-px -translate-x-1/2 bg-line" />
      )}

      <span
        className={`relative flex h-6 w-6 items-center justify-center rounded-full
                    transition-colors
                    ${
                      done
                        ? "bg-brand text-white"
                        : current
                          ? "bg-brand text-white ring-4 ring-brand-soft"
                          : status === "coming_soon"
                            ? "border border-line bg-canvas text-ink-muted"
                            : "border-2 border-brand-line bg-surface"
                    }`}
      >
        {done ? (
          /*
            埋まった瞬間だけ、小さく現れる。
            すでに埋まっている回にも同じ動きが乗るが、0.55 秒で終わり、
            動きが苦手な人の設定では一瞬で終わる（index.css）。
          */
          <IconCheck className="h-3.5 w-3.5 animate-pop-in" />
        ) : status === "coming_soon" ? (
          <IconLock className="h-3 w-3" />
        ) : current ? (
          <span className="h-2 w-2 rounded-full bg-white" />
        ) : null}
      </span>
    </span>
  );
}
