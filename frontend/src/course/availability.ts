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

import type { Course, Lesson } from "./types";

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

/**
 * コースが始められるか。
 *
 * 教材と同じ考え方で、省略は「始められる」とみなす。同梱データで
 * 動かすとき（サーバーに届かないとき）に全部が近日公開になると、
 * 何も始められない画面になる。
 */
export function isCourseComingSoon(course: Course): boolean {
  return course.availability === "coming_soon";
}

/** 近日公開のコースに添える一言。 */
export function courseComingSoonNote(course: Course): string {
  return course.comingSoonMessage || "いま教材を作っています。";
}

/** 始められる教材だけ。進捗の分母や「次におすすめ」に使う。 */
export function startableLessons(lessons: Lesson[]): Lesson[] {
  return lessons.filter(isStartable);
}

/**
 * このレッスンの次に勧める教材。
 *
 * **始められるものだけ**にする。近日公開のものを勧めると、押した先で
 * 止まる。終わった直後の「次はこれ」で行き止まりに当たるのは、
 * 何も勧めないより悪い。
 *
 * 完了画面（「次におすすめ」）と Day 完了の画面（「次のレッスンへ」）が
 * 同じ答えを使う。別々に絞ると、片方だけが近日公開の教材を勧める日が
 * 来る——2つは同じ流れの上に並んでいるので、食い違いはその場で見える。
 */
export function nextLessons(
  lessons: Lesson[],
  current: string,
  completedIds: string[],
): Lesson[] {
  return startableLessons(lessons)
    .filter(
      (entry) =>
        entry.id !== current && entry.usesAi && !completedIds.includes(entry.id),
    )
    .slice(0, 2);
}
