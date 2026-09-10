/**
 * うまくいかなかったときに、次にできることを決める。
 *
 * なぜ要るか
 * ----------
 * 前は「もう一度おくる」1本だけだった。回線が落ちただけならそれで
 * 直る。だが**同じ頼み方ではまた同じになる**とき——AI が元の文章を
 * そのまま返した、頼んだ長さを無視した——押し直しても、同じところへ
 * 戻ってくる。3回押して同じ画面を見た人は、そこでやめる。
 *
 * 失敗ではなく、頼み方の話にする
 * ------------------------------
 * 起きたのは AI の出力のばらつきで、**書いた人のせいではない**。
 * だから「入力が正しくありません」とは言わない。言うのは
 * 「別の方法で試してみましょう」で、示すのは**次に押すもの**。
 *
 * 学習者を評価しない
 * ------------------
 * 「不正解」「失敗しました」「適切ではありません」は使わない。
 * 評価されたと感じた人は、次から自由入力を避けて例文だけを押す
 * ようになる——自分の仕事で使えるようになる、という目的から
 * いちばん遠いところへ行く。
 */

import type { AiRequestError } from "../api/ai";
import type { LessonStep } from "./types";

/** 次にできること1つ分。押した先が必ずあること。 */
export interface RescuePath {
  /** 画面で使う目印。E2E もこれで押す。 */
  id: "sample" | "adjust" | "hint" | "retry";
  label: string;
}

export interface RescueSituation {
  /** どう駄目だったか。`out_of_credits` はここへ来ない（別画面）。 */
  kind: AiRequestError["kind"];
  /** いまいる回。例文を持っているか、ヒントを持っているかで変わる。 */
  step: LessonStep;
  /** この回で使える例文。無ければ「例文で試す」は出さない。 */
  sampleText?: string;
  /** まだ見ていないヒントの数。 */
  hintsLeft: number;
  /** 書き直せる欄があるか。無い回で「整える」を出しても押せない。 */
  editable: boolean;
}

/**
 * 出す道を決める。
 *
 * **押せない道は出さない。** 例文を持たない回に「例文で試す」を
 * 出すと、押しても何も起きない。行き止まりを1つ増やすだけになる。
 *
 * 並びは「手数の少ない順」。いちばん確実に成功へ着くのが例文なので、
 * 詰まっている人にはそれを先に見せる。
 */
export function rescuePaths(where: RescueSituation): RescuePath[] {
  const paths: RescuePath[] = [];

  /*
    届かなかっただけなら、まず押し直し。
    同じ頼み方で直る見込みがあるのは、こちらだけ。
  */
  if (where.kind !== "unusable") {
    paths.push({ id: "retry", label: "もう一度おくる" });
  }

  if (where.sampleText) {
    paths.push({ id: "sample", label: "用意された例文で試す" });
  }
  if (where.editable) {
    paths.push({ id: "adjust", label: "書き方を少し変える" });
  }
  if (where.hintsLeft > 0) {
    paths.push({ id: "hint", label: "ヒントを見る" });
  }

  /*
    どれも出せないときは、押し直しだけでも置く。
    **何も無い画面にはしない。**
  */
  if (paths.length === 0) {
    paths.push({ id: "retry", label: "もう一度おくる" });
  }
  return paths;
}

/**
 * 見出しの言葉。
 *
 * どちらも、起きたことだけを言う。誰が悪いかは言わない。
 */
export function rescueTitle(kind: AiRequestError["kind"]): string {
  if (kind === "unusable") return "うまく変わりませんでした";
  /*
    混み合っているのは、**その人のせいでも、失敗でもない。**

    ここは前まで「今日の練習はここまで！🎉」の画面へ送っていた。
    けれど混み合いは時間をおけば直るもので、祝って行き止まりに
    するものではない（`api/ai.ts` の `limit`）。起きたことをそのまま
    言って、押し直せる道を出す。
  */
  if (kind === "limit") return "いま混み合っています";
  return "うまく届きませんでした";
}

/**
 * 見出しの下の1行。
 *
 * 混み合っているときだけ言い方を変える。ほかの失敗は「別の方法」が
 * 効くが、混み合いに効くのは**待つこと**なので、別の方法を勧めると
 * 効かない道を勧めることになる。
 */
export function rescueLead(kind: AiRequestError["kind"]): string {
  return kind === "limit"
    ? "少し待ってから、もう一度おくってみましょう。"
    : RESCUE_LEAD;
}

export const RESCUE_LEAD = "大丈夫です。別の方法で試してみましょう。";
