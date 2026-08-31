/**
 * コースの見取り図。
 *
 * コースの画面が答えるのは3つだけ。
 *
 *     いまどこ / 次はこれ / あとこれだけ
 *
 * そのために要るのは「順番に並んだレッスン」ではなく、
 * **STEP で束ねた道のり**。8本を平らに並べると、8回ぶんの一本道に
 * 見えて、どこまでが1つのまとまりなのかが読めない。
 *
 * 束はサーバーが決める
 * --------------------
 * `Course.stages` が来ていればそのまま使う。ここで並べ替えない
 * ——画面が独自に束ね直すと、管理画面で並びを直しても画面が従わない。
 *
 * 来ていないときは、束にせず1つの塊として出す（古い応答・
 * これから増えるコース）。**束が無いことと壊れていることは違う。**
 *
 * 現在地チェックは Day ではない
 * ------------------------------
 * 診断は「始める前に自分の位置を見るもの」で、コースの1日目ではない。
 * 受けなくても Day1 から始められる。Day として数に入れると、
 * 受けなかった人の進み具合が最初から欠ける。
 *
 * 分母は「いま始められる Day」だけ
 * --------------------------------
 * 準備中のものを分母に混ぜると、**始めようのないもので割る**ことになり、
 * どれだけ進めても 100% にならない。準備中があることは別に一言で伝える。
 */

import { isComingSoon } from "./availability";
import type { Course, CourseStage, Lesson } from "./types";

/** 束ねられていないレッスンを入れる、名前のない STEP の印。 */
const LOOSE = "";

/** 現在地チェックの束。Day として数えない。 */
export const ORIENTATION = "orientation";

export interface OutlineStep {
  key: string;
  title: string;
  /** 「STEP 1」の 1。現在地チェックには付かないので null。 */
  number: number | null;
  lessons: Lesson[];
}

export interface CourseOutline {
  /** 始める前の現在地チェック。無いコースもある。 */
  orientation: Lesson[];
  /** STEP 1, 2, 3…。束の無いコースでは、名前のない1つだけになる。 */
  steps: OutlineStep[];
  /** Day として数えるレッスン（現在地チェックを除く全部）。 */
  days: Lesson[];
  /** そのうち、いま始められるもの。進み具合の分母。 */
  startableDays: Lesson[];
  /** まだ始められない Day の数。0 なら触れない。 */
  comingSoonDays: number;
}

/**
 * 束が来ていないときの並び。
 *
 * レッスンを1つの名前のない STEP に入れる。束ねられないことと、
 * 出せないことは別。
 */
function withoutStages(lessons: Lesson[]): CourseStage[] {
  return lessons.length === 0
    ? []
    : [{ key: LOOSE, title: "", lessonIds: lessons.map((lesson) => lesson.id) }];
}

export function courseOutline(course: Course): CourseOutline {
  const byId = new Map(course.lessons.map((lesson) => [lesson.id, lesson]));
  const stages =
    course.stages && course.stages.length > 0
      ? course.stages
      : withoutStages(course.lessons);

  const orientation: Lesson[] = [];
  const steps: OutlineStep[] = [];

  for (const stage of stages) {
    /*
      束が指しているのに手元に無いレッスンは飛ばす。

      近日公開の教材が一覧から外れている、といった食い違いは起こりうる。
      そこで空の行を作ると、押しても何も無い場所が道のりに残る。
    */
    const lessons = stage.lessonIds
      .map((id) => byId.get(id))
      .filter((lesson): lesson is Lesson => lesson !== undefined);
    if (lessons.length === 0) continue;

    if (stage.key === ORIENTATION) {
      orientation.push(...lessons);
      continue;
    }
    steps.push({
      key: stage.key,
      title: stage.title,
      // 番号は現在地チェックを飛ばして数える
      number: steps.length + 1,
      lessons,
    });
  }

  const days = steps.flatMap((step) => step.lessons);
  const startableDays = days.filter((lesson) => !isComingSoon(lesson));

  return {
    orientation,
    steps,
    days,
    startableDays,
    comingSoonDays: days.length - startableDays.length,
  };
}

/**
 * 次に進む1本。
 *
 * 現在地チェックがまだなら、それが最初。終えていれば、始められる
 * Day のうち終えていない最初の1本。全部終えていれば null。
 *
 * **1本だけ返す。** 複数を「次」として示すと、どれから始めれば
 * よいのかが結局分からない。
 */
export function nextLesson(outline: CourseOutline, completed: string[]): Lesson | null {
  const done = new Set(completed);
  const check = outline.orientation.find(
    (lesson) => !done.has(lesson.id) && !isComingSoon(lesson),
  );
  if (check) return check;
  return outline.startableDays.find((lesson) => !done.has(lesson.id)) ?? null;
}
