/**
 * レッスンの絵。**出し方をここ1か所に閉じ込める。**
 *
 * 画面ごとに `img` を書くと、縦横比も角丸も少しずつずれて、
 * 並べたときにカードの高さが揃わなくなる。出す場所が増えても
 * 見え方が変わらないよう、ここを通す。
 *
 * 守っていること
 * --------------
 * - 縦横比は必ず 4:3。絵そのものが 4:3 なので、`object-cover` でも
 *   切り取られない（＝ポーが欠けない）。引き伸ばしも起きない
 * - `width`/`height` を必ず渡す。読み込みの前後で高さが変わらないので、
 *   読み込み終わりに他の要素が飛ばない（CLS を出さない）
 * - 角丸は既存のカードと同じ `rounded-card`
 * - 読み上げには渡さない（`alt=""`）。題はすぐ隣に文字で出ているので、
 *   同じことを二度読ませない
 *
 * 絵が無いレッスンでは、呼び出し側が**この部品ごと出さない**。
 * 枠だけ残すと、読み込みに失敗しているように見える。
 */

import {
  LESSON_THUMBNAIL_HEIGHT,
  LESSON_THUMBNAIL_WIDTH,
} from "../../course/lessonThumbnail";

export interface LessonThumbnailProps {
  src: string;
  /**
   * 出し方。
   *   banner … カードの上に横いっぱい
   *   side   … カードの左に、横幅の 38% ほど
   *   thumb  … 行の左に小さく
   */
  variant?: LessonThumbnailVariant;
  className?: string;
  /** 近日公開の教材では、本文と同じだけ薄くする。 */
  dimmed?: boolean;
}

export type LessonThumbnailVariant = "banner" | "side" | "thumb";

/**
 * 大きさは3段だけ。呼び出し側で幅を書かない。
 *
 * side は「今日のレッスン」専用。横いっぱいの絵にすると、390px の画面で
 * カード1枚が1画面の大半を占めてしまう（実際にそうなっていた）。
 * 38% にすると、隣に題・ねらい・所要時間を置いてもまだ読める。
 * 上限を付けてあるのは、広い画面で絵だけが伸び続けないようにするため。
 */
const SIZE: Record<LessonThumbnailVariant, string> = {
  banner: "w-full",
  side: "w-[38%] max-w-[10rem] shrink-0",
  thumb: "w-20 shrink-0 sm:w-24",
};

export function LessonThumbnail({
  src,
  variant = "banner",
  className = "",
  dimmed = false,
}: LessonThumbnailProps) {
  const size = SIZE[variant];

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={LESSON_THUMBNAIL_WIDTH}
      height={LESSON_THUMBNAIL_HEIGHT}
      /*
        横いっぱいの絵は、たいてい画面を開いた時点で見えている場所に出る
        （ホームの「今日はここから」）。あとから読むと、開いた直後だけ
        そこが空いて見える。大きいほうは先に読み、一覧に何件も並ぶ
        小さいほうは、見えるところまで来てから読む。

        どちらも `width`/`height` を渡してあるので、読み込みの前後で
        高さは変わらない（あとから他の要素が飛ばない）。
      */
      loading={variant === "thumb" ? "lazy" : "eager"}
      decoding="async"
      data-testid="lesson-thumbnail"
      className={`aspect-[4/3] ${size} rounded-card object-cover
                  ${dimmed ? "opacity-55" : ""} ${className}`}
    />
  );
}

/**
 * 絵がまだ無いレッスンの、同じ大きさの場所。
 *
 * なぜ空けずに置くか
 * ------------------
 * 一覧では、絵のある行と無い行が混ざる（用意できている絵が
 * 全レッスンぶんではないため）。何も置かないと、そこだけ題の
 * 始まる位置が左にずれて、列がガタガタに見える。**作りかけに見えるのは、
 * 絵が無いことそのものではなく、揃っていないこと**のほう。
 *
 * 代わりに別のレッスンの絵を持ってくることはしない。中身と違う絵は、
 * 分かりやすくするどころか、そのレッスンを誤って覚えさせる。
 * ここに置くのは、その教材がもともと持っている線画だけにする。
 */
export function LessonThumbnailPlaceholder({
  icon: Icon,
  variant = "thumb",
  className = "",
}: {
  icon: (props: { className?: string }) => JSX.Element;
  variant?: LessonThumbnailVariant;
  className?: string;
}) {
  const size = SIZE[variant];

  return (
    <span
      aria-hidden="true"
      data-testid="lesson-thumbnail-placeholder"
      className={`flex aspect-[4/3] ${size} items-center justify-center
                  rounded-card bg-brand-soft text-brand ${className}`}
    >
      <Icon className="h-6 w-6" />
    </span>
  );
}
