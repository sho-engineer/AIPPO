/**
 * コース1本ぶんの進み具合。
 *
 * 一覧（学習中のカード）と、コースの中の画面で同じ数を出す。
 * 別々に数えると、片方が「2 / 9」でもう片方が「3 / 9」になる日が来る。
 * どちらが正しいかは利用者には分からないので、数える場所は1つにする。
 *
 * 数えるのは「いま始められる」レッスンだけ
 * ----------------------------------------
 * 近日公開の分を分母に入れると、全部終えた人がいつまでも
 * 「7 / 9」のままになる。分母は、その日に終わらせられる本数にする。
 */

import { startableLessons } from "./availability";
import type { Course, Lesson } from "./types";

export interface CourseProgress {
  /** 終えた本数。 */
  done: number;
  /** 数えている本数（いま始められる分だけ）。 */
  total: number;
  /** 0〜1。進捗の帯に使う。 */
  ratio: number;
  /**
   * つぎに開く1本。
   *
   * まだ終えていない中で、いちばん前のもの。全部終えていたら null。
   */
  next: Lesson | null;
  /** 1本も終えていない。誘い方を変える（「はじめる」か「つづきから」か）。 */
  fresh: boolean;
}

export function courseProgress(
  course: Course,
  completedIds: string[],
): CourseProgress {
  const open = startableLessons(course.lessons);
  const done = open.filter((lesson) => completedIds.includes(lesson.id)).length;
  const next = open.find((lesson) => !completedIds.includes(lesson.id)) ?? null;

  return {
    done,
    total: open.length,
    ratio: open.length === 0 ? 0 : done / open.length,
    next,
    fresh: done === 0,
  };
}
