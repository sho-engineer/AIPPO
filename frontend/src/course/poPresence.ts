/**
 * ポーを出す場面を決める。
 *
 * なぜ要るか
 * ----------
 * 前は、レッスンの**全19画面**にポーが居た。居るのが当たり前になると、
 * 居ること自体が何も言わなくなる。「またポーだ」で目が滑り、本当に
 * 伝えたい場面——考え中、失敗、比べたあと——でも同じ顔に見える。
 *
 * 飾りとして毎画面に置くのをやめて、**学びの状態を伝える役**にする。
 * ポーが出てきたら、それだけで「いま何かある」と分かる状態にする。
 *
 * 出る場面
 * --------
 *     はじまり     これから何をするかを案内する
 *     考え中       AIへ送っている最中。待たせている理由を持つ
 *     追加の質問    条件を足す回。何を聞かれているかを言う
 *     ヒント       つまずいた人にだけ出る
 *     比べたあと    「どこが変わった？」と問いかける
 *     失敗         何が起きたかと、次にどうするか
 *     おわり       ねぎらう
 *
 * 出ない場面
 * ----------
 * 入力欄・選択肢・解説カード・結果の読みなど、**画面の中身そのものが
 * 用件を持っている**ところ。ここでポーが喋ると、読む場所が2つに増える。
 * 解説カードはとくに、本文とポーの台詞が同じ文字を持っていた。
 *
 * 一覧で持つ理由
 * --------------
 * `Record<StepType, …>` にしてある。ステップの種類を増やしたときに
 * **決めないと型が通らない**。既定を「出す」にしておくと、増やすたび
 * 黙って1画面ずつポーが増えていって、元の状態へ戻る。
 */

import type { StepType } from "./types";

/**
 * ポーが出ている理由。
 *
 * 画面には `data-po-scene` として出す。どの理由で出ているのかを、
 * 検査からも見えるようにしておく。
 */
export type PoScene =
  | "start"
  | "thinking"
  | "question"
  | "hint"
  | "compare"
  | "warning"
  | "celebrate";

export interface PoAppearance {
  scene: PoScene;
  /**
   * 吹き出しを出すか。
   *
   * 失敗のときだけ **顔は出すが黙る**。失敗の文（`AiRequestError.detail`）は
   * 吹き出しと下のエラー欄に**同じ文字**が入る。同じ文が2か所にあると、
   * 2つ別のことが起きたのかと読んでしまう。失敗の説明は、押すボタンの
   * そばに1度だけ置く。顔だけは warning にして、様子がおかしいことは伝える。
   */
  speaks: boolean;
}

export interface PoSituation {
  stepType: StepType;
  /** AIへ送っている最中か。 */
  busy?: boolean;
  /** 失敗しているか。 */
  failed?: boolean;
  /** ヒントを出しているか。 */
  hinting?: boolean;
}

/**
 * ステップの種類だけで決まるぶん。
 *
 * `null` は「その画面ではポーを出さない」。
 */
const BY_STEP: Record<StepType, PoScene | null> = {
  // これから何をするか。ここだけは案内役が要る
  intro: "start",
  outcome_preview: "start",

  // 聞かれていることは画面の中身が言う。横から同じことを言わない
  quick_try: null,
  single_choice: null,
  multi_choice: null,
  text_input: null,
  template_builder: null,
  prompt_preview: null,
  // 送っている最中は busy 側で出る。押す前の画面では出さない
  ai_generate: null,

  // 「どこが変わったと思いますか」。問いかけるのはポーの仕事
  observation: "compare",
  result_compare: "compare",

  /*
    解説カード。本文とポーの台詞が同じ文字を持っている（教材データが
    同じ文を両方に入れている）。2回言うと、2つ別のことが書いてあるのかと
    読んでしまう。
  */
  concept_card: null,

  // 条件を1つ足す回。AIへの「追加の質問」を、聞き手として案内する
  condition_choice: "question",

  // 出てきたものを読む場所。読んでいる横で喋らない
  result_review: null,
  improvement_choice: null,
  safety_check: null,
  real_task: null,
  reflection: null,

  // おわり。ここは大きくねぎらう
  completion: "celebrate",
};

/**
 * いまポーを出すか。出すなら、その理由と、喋るかどうか。
 *
 * 状態（失敗・考え中・ヒント）はステップの種類より強い。
 * 失敗を最優先にするのは、失敗したのに「考えています」の顔のままだと、
 * まだ待てば終わると読めてしまうため。
 */
export function poAppearance(where: PoSituation): PoAppearance | null {
  if (where.failed) return { scene: "warning", speaks: false };
  if (where.busy) return { scene: "thinking", speaks: true };
  if (where.hinting) return { scene: "hint", speaks: true };

  const scene = BY_STEP[where.stepType];
  return scene ? { scene, speaks: true } : null;
}
