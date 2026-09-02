/**
 * 絵に焼いた数字と、教材データが同じであること。
 *
 * なぜ要るか
 * ----------
 * 全体図には「学習時間の目安」が焼き込まれている。焼き込みなので
 * あとから読めず、**教材データを直しても絵は変わらない**。
 *
 * 実際そうなっていた。Day1 の絵は「約3分」、`estimatedMinutes` は 8。
 * コース一覧・レッスン行・再開カード・ホームのカードはデータを読むので
 * 「8分」と出て、同じレッスンに2つの数字が出ていた。画面側は
 * 「絵が時間を言っているなら黙る」（`showsMinutes`）で見た目の衝突は
 * 避けていたが、**値が違うことは誰も見張っていなかった**。
 *
 * 絵が何と言っているかを `scripts/teaching-images/overviews.json` へ
 * 書き写してある。ここで突き合わせる。
 *
 * 見るのは2つだけ
 * ---------------
 * 時間と題。どちらも**同じものが2か所に出る**もので、食い違うと
 * 読む人が混乱する。
 *
 * 箇条書き（できるようになること）は突き合わせない。絵の中では短く
 * 言い換える必要があり、一字一句そろえると絵が作れなくなる。
 * 控えには残してあるので、人が読んで確かめられる。
 */

import { describe, expect, it } from "vitest";

import overviews from "../scripts/teaching-images/overviews.json";
import { ALL_TEACHING_IMAGES } from "../src/course/teachingImages";
import { getLesson } from "../src/course/catalog";

interface Fact {
  lessonId: string;
  source: "template" | "supplied";
  minutes: number;
  titleLines: string[];
}

const FACTS = overviews.images as unknown as Record<string, Fact>;

/**
 * まだ絵と教材の中身を決めていないレッスン。
 *
 * 決めたら `overviews.json` へ足して、ここから消す。
 * **どちらかを必ず通る**ようにしてあるので、黙って忘れることはできない。
 */
const UNDECIDED = [
  "summarize_text",
  "explain_topic",
  "brainstorm_ideas",
  "compare_options",
  "organize_information",
  "image_generation",
  "image_edit",
];

describe("絵に焼いた事実と、教材データ", () => {
  it("学習時間が同じ", () => {
    for (const [name, fact] of Object.entries(FACTS)) {
      const lesson = getLesson(fact.lessonId);
      expect(lesson, `${name} の lessonId が教材に無い`).toBeTruthy();
      expect(
        lesson!.estimatedMinutes,
        `${name} の絵は「約${fact.minutes}分」。教材データと合わせるか、絵を作り直す`,
      ).toBe(fact.minutes);
    }
  });

  it("題が同じ", () => {
    for (const [name, fact] of Object.entries(FACTS)) {
      const lesson = getLesson(fact.lessonId)!;
      expect(fact.titleLines.join(""), `${name} の絵の見出し`).toBe(lesson.title);
    }
  });

  it("時間を焼いた絵は、控えを持っているか、まだ決めていないと書いてある", () => {
    /*
      1枚でも抜けると、その日だけ数字がずれても気づけない。
      新しい全体図を足したときに、ここで必ず手が止まるようにしておく。
    */
    const withMinutes = ALL_TEACHING_IMAGES.filter(
      (entry) => entry.visualType === "lesson_overview" && entry.showsMinutes,
    );
    expect(withMinutes.length).toBeGreaterThan(0);

    const recorded = new Set(Object.values(FACTS).map((fact) => fact.lessonId));
    const undecided = new Set(UNDECIDED);

    for (const entry of withMinutes) {
      const known = recorded.has(entry.lessonId) || undecided.has(entry.lessonId);
      expect(
        known,
        `${entry.lessonId} の全体図が時間を焼いている。` +
          "overviews.json へ書き写すか、UNDECIDED へ入れる",
      ).toBe(true);
    }
  });
});
