/**
 * レッスンを開いた最初の画面に出す絵。
 *
 * これは**教材として作った1枚**で、アプリの画面を写したものではない。
 * 「今日これをやる」が、読まなくても分かることだけを担う。
 *
 * 無いときは、一覧と同じ絵で代える
 * --------------------------------
 * 専用の1枚がまだ無いレッスンのほうが多い（20枚ぶんの制作が要る。
 * docs/image-lesson-assets.md）。そのときは一覧のサムネイルを使う。
 * **絵の場所を空けて待たない**——空の枠は、読み込みに失敗したのと
 * 見分けが付かない。
 *
 * どちらも無ければ null。呼ぶ側は絵の場所ごと出さない。
 *
 * 置き場所
 * --------
 *     public/assets/lesson-overview/<レッスンの id>.webp
 *
 * 1枚できるたびに、下の表へ1行足す。表に無いものは自動では拾わない
 * ——`public/` に置いただけのファイルを画面が指すと、消したときに
 * 気づけないまま壊れた絵が出る。
 */

import { lessonThumbnail } from "./lessonThumbnail";
import type { Lesson } from "./types";

/**
 * 専用の1枚がある教材。id → 道筋。
 *
 * いまは空。制作でき次第ここへ足す。空でも画面は成り立つ
 * （下のサムネイルで代わる）ので、絵が揃うのを待たずに形を作れる。
 */
const BY_LESSON_ID: Record<string, string> = {};

export function lessonOverviewImage(lesson: Lesson): string | null {
  return BY_LESSON_ID[lesson.id] ?? lessonThumbnail(lesson);
}

/** 専用の1枚かどうか。代わりの絵とは見せ方を変えたいときに使う。 */
export function hasDedicatedOverview(lesson: Lesson): boolean {
  return lesson.id in BY_LESSON_ID;
}
