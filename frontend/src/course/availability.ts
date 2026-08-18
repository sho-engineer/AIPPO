/**
 * 教材を始めてよいかの判定。画面側でも**1か所**に閉じる。
 *
 * `lesson.availability === "coming_soon"` を画面のあちこちに書くと、
 * 必ずどれかが古くなる。押せるボタンが1つ残るだけで、
 * 始められないはずの教材が始まる。
 *
 * 最後の砦はサーバー（apps/catalog/access.py）。ここは
 * 「押させない・見せ方を変える」ためのもので、守りの本体ではない。
 */

import type { Lesson } from "./types";

export function isComingSoon(lesson: Lesson): boolean {
  // 省略は available とみなす。同梱データで動かすときに
  // 全部が近日公開になると、何も始められなくなる
  return lesson.availability === "coming_soon";
}

export function isStartable(lesson: Lesson): boolean {
  return !isComingSoon(lesson);
}

/** 近日公開の教材に添える一言。日付は決まっているときだけ出す。 */
export function comingSoonNote(lesson: Lesson): string {
  if (lesson.comingSoonMessage) return lesson.comingSoonMessage;
  if (lesson.plannedReleaseDate) {
    const date = new Date(lesson.plannedReleaseDate);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日ごろ公開予定です。`;
    }
  }
  return "近日公開です。もうしばらくお待ちください。";
}

/**
 * 添える一言が、中身のある知らせかどうか。
 *
 * 公開日も個別の文も無いときの `comingSoonNote` は
 * 「近日公開です。もうしばらくお待ちください。」という決まり文句になる。
 * 近日公開の教材が7本並ぶと、同じ一文が7回続くことになり、
 * 画面が「作り置き」に見える。中身があるときだけ出すために使う。
 */
export function hasComingSoonDetail(lesson: Lesson): boolean {
  if (lesson.comingSoonMessage) return true;
  if (!lesson.plannedReleaseDate) return false;
  return !Number.isNaN(new Date(lesson.plannedReleaseDate).getTime());
}

/** 始められる教材だけ。進捗の分母や「次におすすめ」に使う。 */
export function startableLessons(lessons: Lesson[]): Lesson[] {
  return lessons.filter(isStartable);
}
