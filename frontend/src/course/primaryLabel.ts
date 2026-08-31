/**
 * 画面の下に出す、次にやることの文言。
 *
 * なぜ1か所に出したか
 * -------------------
 * 前は `LessonRunner` の中に、**ステップの種類ごと**の表を置いていた。
 * 種類は19しかないので、同じ種類の画面はどこでも同じ文言になる。
 * その結果、Day1 の19画面のうち8画面が「次へ」で、しかも4連続する
 * ところがあった。押す前に何が起きるのかが分からない。
 *
 * それだけなら見た目の問題だが、**実害も出た**。技の解説を比べたあとへ
 * 移したとき、観察の画面の「解説を見る」だけが取り残された。押した先に
 * 出るのは「条件を一つ足してみましょう」で、約束と行き先が違っていた。
 * 4本の教材すべてで同じことが起きていて、種類ごとの表では気づけない
 * ——**次に何が来るかは、教材の並びが決めている**からだ。
 *
 * だからここへ出して、教材の並びと突き合わせられるようにする
 * （`tests/primaryLabel.test.ts`）。
 *
 * 決め方
 * ------
 *   1. その画面が自分で持っている文言（`step.primaryLabel`）
 *   2. 無ければ種類ごとの既定
 *   3. それも無ければ「次へ」
 *
 * 教材データが持てるようにしてあるのは、同じ種類でも場面で言うことが
 * 変わるため。Day1 の `real_audience` と `real_tone` はどちらも
 * `single_choice` だが、片方は「誰向けか決めた」、もう片方は
 * 「この言い方で書く」になる。
 *
 * 書き方
 * ------
 * **押すと何が起きるかを書く。** 「次へ」は何も言っていない。
 * 学習行動そのものを書けるならそれがいちばんよい
 * （「AIに分かりやすくしてもらう」「何が変わった？」）。
 */

import type { LessonStep, StepType } from "./types";

/**
 * 種類ごとの既定。
 *
 * 教材が自分で持っていないときの控え。ここを厚くしていくのではなく、
 * **場面ごとの文言は教材データが持つ**のが本筋。
 */
export const LABEL_BY_TYPE: Record<StepType, string> = {
  intro: "はじめる",
  outcome_preview: "さっそく試す",
  quick_try: "AIに送ってみる",
  /*
    ここは「解説を見る」だった。技の解説を比べたあとへ移したのに
    文言だけが残り、押した先に解説が無かった。
  */
  observation: "条件を足してみる",
  concept_card: "覚えた",
  condition_choice: "この条件で試す",
  single_choice: "決めた",
  multi_choice: "決めた",
  text_input: "書けた",
  template_builder: "できた",
  prompt_preview: "この内容でAIに送る",
  ai_generate: "AIに送る",
  result_review: "次へ進む",
  result_compare: "何が変わった？",
  improvement_choice: "もう一度AIに送る",
  safety_check: "この中から選ぶ",
  /*
    ここは行き先を約束しない。自分の文章のあとに何が来るかは教材次第で、
    Day1 では送る内容の確認だが、まだ並べ替えていない教材では
    条件を選ぶ回や解説が続く。そちらは骨格が場面ごとに書く。
  */
  real_task: "この文章で進む",
  reflection: "今日の成果を見る",
  completion: "次のレッスンへ",
};

/** その画面のCTA。 */
export function primaryLabel(step: LessonStep): string {
  return step.primaryLabel || LABEL_BY_TYPE[step.type] || "次へ";
}
