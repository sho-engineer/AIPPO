/**
 * レッスンを開いた最初の画面に出す絵。
 *
 * これは**教材として作った1枚**で、アプリの画面を写したものではない。
 * 「今日これをやる」が、読まなくても分かることだけを担う。
 * 表そのものは `teachingImages.ts`（教材の絵を1か所にまとめてある）。
 *
 * 無いときは、一覧と同じ絵で代える
 * --------------------------------
 * 専用の1枚がまだ無いレッスンのほうが多い。そのときは一覧の
 * サムネイルを使う。**絵の場所を空けて待たない**——空の枠は、
 * 読み込みに失敗したのと見分けが付かない。
 *
 * 代わりの絵は 4:3 を切り取って出す（`LessonThumbnail`）が、
 * 専用の1枚は**切り取ってはいけない**（1枚で説明が完結している）。
 * 呼ぶ側がどちらなのかを見分けられるよう、2つに分けて返す。
 */

import { teachingImage, type TeachingImageEntry } from "./teachingImages";
import { lessonThumbnail } from "./lessonThumbnail";
import type { Lesson } from "./types";

/** 最初の画面に出るステップの id。骨格が付ける名前。 */
const OVERVIEW_STEP = "outcome_preview";

/**
 * 専用の1枚。無ければ null。
 *
 * ある場合は `TeachingImage` で、切り取らずに丸ごと出すこと。
 */
export function lessonOverview(lesson: Lesson): TeachingImageEntry | null {
  return teachingImage(lesson.id, OVERVIEW_STEP);
}

/** 代わりに使う一覧の絵。専用の1枚があるときは使わない。 */
export function lessonOverviewFallback(lesson: Lesson): string | null {
  return lessonOverview(lesson) ? null : lessonThumbnail(lesson);
}
