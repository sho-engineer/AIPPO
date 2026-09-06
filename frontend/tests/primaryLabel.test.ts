/**
 * 画面の下のボタンの文言。
 *
 * 見張るのは3つ。
 *
 *   1. 押した先に、書いてあるものが本当に来ること
 *   2. 「次へ」だけのボタンが続かないこと
 *   3. 押すと何が起きるかを言っていること
 *
 * 1つ目は見た目の話ではない。技の解説を比べたあとへ移したとき、
 * 観察の画面の「解説を見る」だけが取り残され、押した先に解説が
 * 無かった。教材4本すべてで同じことが起きていて、**種類ごとの表を
 * 読んでも気づけない**——次に何が来るかは教材の並びが決めている。
 */

import { describe, expect, it } from "vitest";

import { COURSE } from "../src/course/catalog";
import { LABEL_BY_TYPE, primaryLabel } from "../src/course/primaryLabel";
import { STEP_TYPES, type Lesson } from "../src/course/types";

const DAY1 = COURSE.lessons.find((one) => one.id === "rewrite_text")!;

/**
 * 文言が「次はこれが来る」と言っているときの、来るべき画面。
 *
 * 全部を縛るのではなく、**行き先を名指ししている言葉だけ**を見る。
 * 「決めた」「書けた」のように、いま終えたことを言うものは対象外。
 */
const PROMISES: { word: string; nextType: string[] }[] = [
  { word: "解説", nextType: ["concept_card"] },
  // 「内容を**確認する**」は、送る前に中身を出す画面のこと
  { word: "内容を確認する", nextType: ["prompt_preview"] },
  /*
    「この内容で整える」は「この内容でAIに送る」だった。文言から
    「AI」を落としたが、**押した先はいまも送信の回**なので、行き先の
    約束としてはそのまま見張る。ここを外すと、送る手前の確認画面から
    送信以外の場所へ繋いでも誰も気づかない。
  */
  { word: "この内容で整える", nextType: ["ai_generate"] },
  { word: "この条件で試す", nextType: ["ai_generate"] },
  { word: "条件を足", nextType: ["condition_choice"] },
];

function steps(lesson: Lesson) {
  return lesson.steps.map((step, index) => ({
    step,
    next: lesson.steps[index + 1] ?? null,
    label: primaryLabel(step),
  }));
}

describe("押した先に、書いてあるものが来る", () => {
  it("行き先を名指しした文言は、そのとおりの画面へ進む", () => {
    const broken: string[] = [];

    for (const lesson of COURSE.lessons) {
      for (const { step, next, label } of steps(lesson)) {
        if (!next) continue;
        /*
          送信の回は見ない。ここのボタンは「次へ行く」ためのものではなく、
          いま送っている最中であることを表している（押せない）。
          送る先はこの画面自身で、次の画面はその結果になる。
        */
        if (step.type === "ai_generate") continue;
        for (const promise of PROMISES) {
          if (!label.includes(promise.word)) continue;
          if (promise.nextType.includes(next.type)) continue;
          broken.push(
            `${lesson.id}/${step.id}: 「${label}」と書いてあるのに、` +
              `次は ${next.id}（${next.type}）`,
          );
        }
      }
    }

    expect(broken, `行き先の違うボタン:\n${broken.join("\n")}`).toEqual([]);
  });
});

/**
 * 「次へ」を名乗ってよい回。
 *
 * どちらも**結果を読む回**で、画面の中に「変わったところを見る」
 * という別の押し先を自分で持っている。下の帯にも行き先を名指しした
 * 文言を置くと、違うものが開く2つのボタンが同じ言葉で並ぶ。
 *
 * `observation` は、既定の「条件を足してみる」のままだと Day1 では
 * 嘘になる（次に来るのは「プロンプト」の解説で、条件を足す画面ではない）。
 * 行き先を言えないなら、**言わないほうを選ぶ**。
 */
const MAY_SAY_NEXT = new Set(["observation", "result_compare"]);

describe("「次へ」を続けない", () => {
  it("Day1 で「次へ」と言ってよいのは、結果を読み終える回だけ", () => {
    /*
      「次へ」は何も言っていない。押す前に何が起きるか分からないまま
      押させると、進んでいるのか読み流しているのかが自分でも分からなくなる。

      だから既定では置かない。ただし上の `MAY_SAY_NEXT` の2種類だけは、
      名指しするほうが害になる——同じ言葉のボタンが画面の中に既にあり、
      押した先が違う。この2つ以外に「次へ」が増えたらここで止める。
    */
    const vague = steps(DAY1)
      .filter(({ label }) => label === "次へ" || label === "つぎへ")
      .filter(({ step }) => !MAY_SAY_NEXT.has(step.type))
      .map(({ step }) => step.id);

    expect(vague, `行き先を言っていないボタン: ${vague.join(", ")}`).toEqual([]);
  });

  it("同じ文言が3回以上続かない", () => {
    /*
      連続して同じ文字が出ると、画面が変わったことに気づかない。
      2回までは許す——「AIに送る」の回は自動で送るので、
      前の画面と一続きに見えてよい。

      現在地チェック（diagnosis）は見ない。あれは3問に答えるだけの
      **問診票**で、同じ動作が3回続くのが正しい姿。レッスンの
      「読む／選ぶ／送る／比べる」が入れ替わるのとは別のもの。
    */
    for (const lesson of COURSE.lessons.filter((one) => one.number > 0)) {
      const labels = lesson.steps.map((step) => primaryLabel(step));
      let run = 1;
      for (let i = 1; i < labels.length; i += 1) {
        run = labels[i] === labels[i - 1] ? run + 1 : 1;
        expect(
          run,
          `${lesson.id}: 「${labels[i]}」が ${lesson.steps[i - run + 1].id} から ${run} 回続く`,
        ).toBeLessThan(3);
      }
    }
  });
});

describe("決め方", () => {
  it("教材が持っている文言が、種類ごとの既定より強い", () => {
    expect(
      primaryLabel({
        id: "x",
        type: "single_choice",
        title: "",
        poMessage: "",
        poEmotion: "neutral",
        primaryLabel: "この言い方で書く",
      }),
    ).toBe("この言い方で書く");
  });

  it("種類のどれにも既定がある", () => {
    // 抜けていると「次へ」へ落ちる。落ちたことに気づけない
    for (const type of STEP_TYPES) {
      expect(LABEL_BY_TYPE[type], `${type} の既定`).toBeTruthy();
    }
  });

  it("「次へ」を既定に持つのは、結果を読み終える回だけ", () => {
    /*
      既定が空だと `primaryLabel` は最後の控えの「次へ」を返すので、
      **書き忘れと、選んで置いた「次へ」が見分けられない**。上の
      「既定がある」だけでは、書き忘れた種類が「次へ」に化けたことに
      気づけない——だから、どの種類が「次へ」を名乗ってよいかを
      ここに書き出しておく。

      いま名乗ってよいのは `result_compare` だけ。下の帯は進むボタンで、
      画面の中にある「変わったところを見る」と押した先が違う
      （`MAY_SAY_NEXT` と同じ理由）。`observation` の「次へ」は種類の
      既定ではなく、教材（Day1）が自分で持っている。
    */
    const saysNext = STEP_TYPES.filter((type) => LABEL_BY_TYPE[type] === "次へ");

    expect(saysNext).toEqual(["result_compare"]);
  });
});
