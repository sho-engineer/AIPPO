/**
 * レッスンのサムネイル。**ここが唯一の出どころ。**
 *
 * 画面ごとに別の絵を指定しない。同じレッスンが、ホームでも一覧でも
 * 完了画面でも同じ絵で出るようにする——場所によって絵が違うと、
 * 同じものだと気づけない。
 *
 * 決め方は2段
 * -----------
 *   1. 教材データが `thumbnail` を持っていれば、それを使う
 *      （管理画面から差し替えられるようにするための入口）
 *   2. 無ければ、レッスンの id で下の表を引く
 *
 * 2段にしてあるのは、サーバーから届く教材データがまだ `thumbnail` を
 * 持っていないため。表があれば、サーバー側を触らなくても絵が出る。
 * あとで教材データが持つようになれば、そちらが自然に優先される。
 *
 * 絵が無いレッスンもある
 * ----------------------
 * 全レッスンぶんは揃っていない。`lessonThumbnail()` は null を返し、
 * 画面側は**絵の場所ごと出さない**。無いものを枠だけ見せると、
 * 読み込みに失敗しているようにも見える（憲章 原則 I）。
 *
 * 絵の作り方
 * ----------
 * `public/assets/lessons/*.webp`。1枚の一覧画像から切り出したもので、
 * どれも 768×576（4:3）にそろえてある。足りないぶんは端の画素を
 * 伸ばして埋めてあるので、**切り取られたポーはいない**。
 * 縦横比が同じなので、画面側で引き伸ばす必要もない。
 */

import type { Lesson } from "./types";

/** すべてのサムネイルの縦横比。画面側はこの比のまま出す。 */
export const LESSON_THUMBNAIL_RATIO = "4 / 3";

/** 実寸。`width`/`height` に渡して、読み込み前後で位置がずれないようにする。 */
export const LESSON_THUMBNAIL_WIDTH = 768;
export const LESSON_THUMBNAIL_HEIGHT = 576;

/**
 * レッスンの id → 絵。
 *
 * ここに無いレッスンには絵を出さない。「近日公開かどうか」とは関係が無い
 * ——公開状態は教材データの `availability` が決める（course/availability.ts）。
 * 絵があるからといって始められるわけではないし、その逆でもない。
 */
const BY_LESSON_ID: Record<string, string> = {
  // AIスタートコース
  improve_answer: "/assets/final-thumbnails/practical_01.webp",
  rewrite_text: "/assets/final-thumbnails/start_01.webp",
  summarize_text: "/assets/final-thumbnails/start_02.webp",
  explain_topic: "/assets/final-thumbnails/start_03.webp",
  brainstorm_ideas: "/assets/final-thumbnails/start_04.webp",
  compare_options: "/assets/final-thumbnails/start_05.webp",
  organize_information: "/assets/final-thumbnails/start_06.webp",
  make_plan: "/assets/final-thumbnails/start_12.webp",

  // AI活用コース
  organize_meeting: "/assets/final-thumbnails/practical_03.webp",
  work_email_chat: "/assets/final-thumbnails/practical_02.webp",
  extract_needed_info: "/assets/final-thumbnails/practical_04.webp",
  organize_research: "/assets/final-thumbnails/practical_05.webp",
  make_document_outline: "/assets/final-thumbnails/practical_10.webp",
  transcription_use: "/assets/final-thumbnails/start_09.webp",
  combine_ai_skills: "/assets/final-thumbnails/practical_12.webp",
  practical_recipe: "/assets/final-thumbnails/practical_01.webp",
  image_generation: "/assets/final-thumbnails/practical_09.webp",

  // これから増えるコースのぶん（近日公開。絵だけ先にある）
  ideas_ten: "/assets/final-thumbnails/start_04.webp",
  summarize_categorize: "/assets/lessons/summarize_categorize.webp",
  summarize_three_lines: "/assets/lessons/summarize_three_lines.webp",
  image_first: "/assets/final-thumbnails/start_07.webp",
  image_style: "/assets/lessons/image_style.webp",
};

/** このレッスンの絵。無ければ null（画面側は絵の場所ごと出さない）。 */
export function lessonThumbnail(lesson: Lesson): string | null {
  return lesson.thumbnail ?? BY_LESSON_ID[lesson.id] ?? null;
}

/** id だけ分かっているとき用。教材データを引けない場所から使う。 */
export function lessonThumbnailById(lessonId: string): string | null {
  return BY_LESSON_ID[lessonId] ?? null;
}
