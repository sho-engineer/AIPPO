/**
 * 診断の答えから、おすすめのレッスンを3つ選ぶ（要件 §9）。
 *
 * **AI を使わない。** ルールで決める。
 * ここで AI を呼ぶと、最初の1画面で待たせることになるうえ、
 * 費用もかかる。診断の精度は使ってもらった後でないと検証できないので、
 * 先に作り込まない。
 *
 * 選び方は単純にしてある。
 *   1. 「いま面倒なこと」に直結するレッスンを先頭に置く
 *   2. 「仕事の種類」で相性のよいものを足す
 *   3. 足りなければ、番号順に埋める
 *
 * 最後は必ず3つ返す。0件や1件だと、選ぶ画面が成り立たない。
 */

import { COURSE } from "./catalog";

/** 「いま面倒なこと」→ まず試すレッスン。 */
const BY_PAIN: Record<string, string[]> = {
  writing: ["rewrite_text", "improve_answer"],
  summarizing: ["summarize_text", "rewrite_text"],
  explaining: ["explain_topic", "summarize_text"],
  comparing: ["compare_options", "explain_topic"],
  planning: ["make_plan", "compare_options"],
};

/** 「仕事の種類」→ 相性のよいレッスン。 */
const BY_WORK: Record<string, string[]> = {
  writing: ["rewrite_text", "improve_answer"],
  reading: ["summarize_text", "explain_topic"],
  researching: ["explain_topic", "compare_options"],
  ideas: ["improve_answer", "make_plan"],
  comparing: ["compare_options", "make_plan"],
  planning: ["make_plan", "summarize_text"],
  organizing: ["make_plan", "summarize_text"],
};

/** 診断を飛ばした人にも出す既定。最初の一歩として無難な順。 */
const DEFAULTS = ["rewrite_text", "summarize_text", "explain_topic"];

export const RECOMMENDATION_COUNT = 3;

export function recommendLessons(answers: Record<string, string>): string[] {
  const chosen: string[] = [];

  const push = (ids: string[]) => {
    for (const id of ids) {
      if (chosen.length >= RECOMMENDATION_COUNT) return;
      if (!chosen.includes(id)) chosen.push(id);
    }
  };

  push(BY_PAIN[answers.pain_point ?? ""] ?? []);
  push(BY_WORK[answers.work_kind ?? ""] ?? []);
  push(DEFAULTS);
  // ここまでで埋まらない設定ミスに備えて、番号順で埋める
  push(COURSE.lessons.filter((lesson) => lesson.usesAi).map((lesson) => lesson.id));

  return chosen.slice(0, RECOMMENDATION_COUNT);
}

const STORAGE_KEY = "aippo:recommended";

export function saveRecommendations(ids: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // 保存できなくても、その場の表示は動く
  }
}

export function loadRecommendations(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * 診断がまだでも、必ず3つ返す。
 *
 * ホームの「おすすめ」は空にできない。初めて来た人にこそ出す必要が
 * あるのに、そこだけ節が丸ごと消えると、何から始めればよいか
 * 分からない画面になる。
 *
 * 一覧の「おすすめ」印にはこれを使わない。あちらは本人が診断で選んだ
 * 結果にだけ付ける。既定値にまで印を付けると、自分で選んだのか
 * 最初からそうだったのかが区別できなくなる。
 */
export function recommendationsForHome(): string[] {
  const saved = loadRecommendations();
  return saved.length > 0 ? saved : recommendLessons({});
}
