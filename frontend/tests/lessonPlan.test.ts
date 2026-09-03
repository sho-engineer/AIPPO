/**
 * 「今日やること」の図が、教材データとずれていないこと。
 *
 * なぜ機械に見張らせるか
 * ----------------------
 * 図の材料は教材データと**別の場所**にある（`course/lessonPlan.ts`）。
 * 教材の本文を書き替えたときに図を直し忘れても、図はそれらしく描けて
 * しまうので**目では気づけない**。気づくのは、図で見た言葉が本編に
 * 出てこなくて探す学習者になる。
 *
 * 見るのは4つ。
 *
 *   1. 足す条件が、本編で実際に選べる選択肢にあること
 *   2. 言いかえ前の言葉が、元の文章の中に本当にあること
 *   3. 言いかえ後の言葉が、できあがりの文の中に本当にあること
 *   4. 図が「短くする」を教えていないこと（Day2 の役目）
 *
 * 3 がこの回のいちばんの勘どころ。Day1 のねらいは
 * **意味は同じまま、言い方だけ変わる**ことなので、元の用語が
 * できあがりのどこへ行ったのかをたどれなければ、AIが別の説明を
 * 書き下ろしたのと見分けが付かない。
 */

import { describe, expect, it } from "vitest";

import { getLesson } from "../src/course/catalog";
import {
  LESSON_PLANS,
  firstSentence,
  lessonPlan,
  openingClause,
} from "../src/course/lessonPlan";

/**
 * 元の文章に出てくる、そのままでは読めない言葉。
 *
 * できあがりの文にも、言いかえ先にも残っていてはいけない。
 * 残っているということは、そこが言いかえられていないということ。
 */
const JARGON = [
  "Query",
  "Key",
  "Softmax",
  "Value",
  "Attention",
  "トークン",
  "自己注意機構",
  "内積",
  "スケーリング",
  "部分空間",
];

describe("今日やることの図", () => {
  it("図を持つ教材は、実在する", () => {
    for (const lessonId of Object.keys(LESSON_PLANS)) {
      expect(getLesson(lessonId), `${lessonId} という教材が無い`).toBeTruthy();
    }
  });

  it("足す条件は、本編で実際に選べる", () => {
    /*
      図では「AI初心者向け」と縮めたくなるが、縮めると**図で見た言葉が
      本編に出てこない**。探して見つからないほうが、2文字ぶんの
      読みやすさより高くつく。
    */
    for (const [lessonId, plan] of Object.entries(LESSON_PLANS)) {
      const lesson = getLesson(lessonId)!;
      const labels = new Set(
        lesson.steps.flatMap((step) => (step.options ?? []).map((o) => o.label)),
      );
      for (const add of plan.additions) {
        expect(
          labels.has(add.value),
          `${lessonId}: 図の「${add.value}」が、どの画面の選択肢にも無い`,
        ).toBe(true);
      }
    }
  });

  it("言いかえ前の言葉は、元の文章の中にある", () => {
    for (const [lessonId, plan] of Object.entries(LESSON_PLANS)) {
      const before = getLesson(lessonId)!.beforeExample ?? "";
      for (const swap of plan.swaps) {
        expect(
          before.includes(swap.from),
          `${lessonId}: 「${swap.from}」が元の文章に無い`,
        ).toBe(true);
      }
    }
  });

  it("言いかえ後に、むずかしい言葉が残っていない", () => {
    /*
      前はここで「できあがりの文にそのまま出てくるか」を見ていた。
      表と本文はずれなくなるが、**そのために本文が「専門用語を1つずつ
      訳しただけ」の形に引きずられていた**——用語は消えても、
      言っていることの難しさは変わらない。

      見るものを変える。言いかえたのに元の用語が残っていたら、
      それは言いかえられていない。ここが Day1 のねらいそのもの。
    */
    for (const [lessonId, plan] of Object.entries(LESSON_PLANS)) {
      for (const swap of plan.swaps) {
        for (const term of JARGON) {
          expect(
            swap.to.includes(term),
            `${lessonId}: 言いかえ先「${swap.to}」に「${term}」が残っている`,
          ).toBe(false);
        }
      }
    }
  });

  it("できあがりの文に、内部の計算の話が残っていない", () => {
    /*
      Day1 は Transformer を教える回ではない。**難しい文章を読める
      ようにする**回なので、Query や Softmax の説明は要らない。
      残っていると、元の文章とほとんど同じ難しさのまま出てしまう
      （実際そうなっていた）。
    */
    const after = getLesson("rewrite_text")!.afterExample ?? "";

    for (const term of JARGON) {
      expect(after.includes(term), `できあがりの文に「${term}」が残っている`).toBe(
        false,
      );
    }
  });

  it("Day1 は「短くする」を教えていない", () => {
    /*
      Day1 は「難しい → 分かる」。「長い → 短い」は Day2 の要約が持つ。
      役が被ると、Day2 に来た人が「昨日やった」と思って飛ばす。

      見るのは**学習者の目に入る言葉**——画面の題と選択肢。ここに
      「短く」「要約」が出た時点で、本文が何を言っていても
      「短くするレッスン」として読まれる。

      AIへ既定で長さを渡していないことも見る。黙って「3行くらい」と
      頼むと、専門文が切り詰められて、分かりやすくなったのか
      削られただけなのか見分けが付かない。
    */
    const day1 = getLesson("rewrite_text")!;
    const shown = day1.steps.flatMap((step) => [
      step.title ?? "",
      step.instruction ?? "",
      ...(step.options ?? []).map((o) => o.label),
    ]);

    for (const text of shown) {
      expect(text, `Day1 の画面に「${text}」がある`).not.toMatch(/短く|要約|まとめて/);
    }

    const quick = day1.steps.find((step) => step.type === "quick_try");
    const defaults = (quick?.meta as { defaults?: Record<string, string> })?.defaults;
    expect(defaults?.length, "黙って長さを頼んでいる").toBeUndefined();
  });

  it("完成イメージの Before は、最初のひと区切りだけ", () => {
    /*
      Day1 の題材は 202字の専門文。丸ごと置くと、**始めるかどうかを
      決める前に、いちばん難しい文章を読み下す**ことになる。
      最初のひと区切りで「難しい」は伝わる。
    */
    const before = getLesson("rewrite_text")!.beforeExample!;
    const shown = openingClause(before);

    expect(shown).toBe("Transformer型言語モデルにおける自己注意機構では…");
    expect(shown.length).toBeLessThan(before.length / 3);
    // 元の文の頭から取る。書き下ろした別の文にしない
    expect(before.startsWith(shown.replace("…", ""))).toBe(true);
  });

  it("完成イメージの After は、ひと文まるごと", () => {
    /*
      こちらは途中で切らない。**ひと文で意味が通る**ことが、
      そのまま「分かりやすくなった」の証拠になる。
    */
    const after = getLesson("rewrite_text")!.afterExample!;
    const shown = firstSentence(after);

    expect(shown.endsWith("。")).toBe(true);
    expect(shown).not.toContain("…");
    expect(after.startsWith(shown)).toBe(true);
  });

  it("区切りの無い短い文は、そのまま出す", () => {
    // 切るものが無いのに「…」を付けない
    expect(openingClause("みじかい")).toBe("みじかい");
    expect(firstSentence("みじかい")).toBe("みじかい");
  });

  it("区切りが遠い長文は、それでも切る", () => {
    // 読点が来ないまま何百字も続く文で、枠を埋め尽くさない
    const long = "あ".repeat(200);
    expect(openingClause(long)).toHaveLength(47);
    expect(openingClause(long).endsWith("…")).toBe(true);
  });

  it("図を持たない教材では、図を出さない", () => {
    // 材料の無いところに空の枠だけを置かない
    expect(lessonPlan("no_such_lesson")).toBeNull();
  });
});
