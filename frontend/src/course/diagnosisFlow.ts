/**
 * 診断を答え終わってからの、4つの画面。
 *
 * なぜ1画面を4つに割ったか
 * ------------------------
 * 前は結果が1画面だった。図・できていること・次の一歩・おすすめが
 * 同時に出て、しかも下のボタンが「ここから始める」。**読む前に
 * 次へ行く道が目に入る**ので、結果は読まれずに押された。
 *
 * 分けたのは、順番そのものが意味を持つから。
 *
 *     分析  … 何を見て判断したのかを見せる
 *     現在地 … 5段階のどこにいるか。まだ Lesson の話はしない
 *     4つの力 … 強み／次に伸ばす力／次に覚えること
 *     おすすめ … 上の3つを受けた1本。ここで初めて Lesson が出る
 *
 * 1画面＝1アクションの形に戻っただけで、増えているのは押す回数
 * （2回）と 1.8 秒だけ。
 *
 * なぜ教材データのステップにしないか
 * ----------------------------------
 * ステップを増やすと、3層（同梱・seed・配信）すべてに同じものが要り、
 * 採点も進み具合の分母も動く。ここで変わるのは**結果の見せ方**だけで
 * 教材の中身ではないので、`completion` の1ステップの中の状態にする。
 * 進み具合の帯も「5問」のまま動かない——4画面は問いではない。
 *
 * 文言をここに置く理由
 * --------------------
 * 見出しと CTA は `LessonRunner` が下の帯に出し、中身は
 * `DiagnosisResult` が出す。**2つのファイルにまたがる**ので、
 * 片方だけ直すと画面の上と下で言うことがずれる。1か所に持つ。
 */

export const DIAGNOSIS_PHASES = ["analyzing", "stage", "axes", "lesson"] as const;

export type DiagnosisPhase = (typeof DIAGNOSIS_PHASES)[number];

export interface PhaseCopy {
  /** 見出しの上の小さな肩書き。分析中だけ無い（まだ結果ではない）。 */
  eyebrow?: string;
  title: string;
  instruction?: string;
  /** 下の帯の主ボタン。おすすめだけは Day 番号で作るので空。 */
  primary: string;
  /** 主ボタンの下の、細い1行。 */
  secondary?: string;
  /** そのときポーが言うこと。 */
  po: string;
}

export const PHASE_COPY: Record<DiagnosisPhase, PhaseCopy> = {
  analyzing: {
    /*
      「AIが解析しています」とは書かない。この診断は AI を呼ばない
      （`course/diagnosisScore.ts`）。書くのは実際にしていること。
    */
    title: "回答を分析しています",
    instruction: "4つの観点から、今のAIの使い方を確認しています。",
    /*
      押せないボタンを、**場所だけ同じにして置く。**

      ここだけボタンを消すと、次の画面でボタンが生えて中身が上へ
      跳ねる。押す場所は4画面とも同じ高さにしておく。
    */
    primary: "分析しています",
    po: "答えを読んでいるところ",
  },
  stage: {
    eyebrow: "診断結果",
    title: "あなたの現在地",
    primary: "使い方のバランスを見る",
    po: "いまはここ！",
  },
  axes: {
    eyebrow: "診断結果",
    title: "4つの力のバランス",
    primary: "おすすめLessonを見る",
    secondary: "現在地に戻る",
    po: "得意なところと、これからのところ",
  },
  lesson: {
    eyebrow: "診断結果",
    title: "今のあなたにおすすめ",
    /* 主ボタンは `Day n をはじめる`。番号は結果で変わるので空にする */
    primary: "",
    secondary: "診断結果をもう一度見る",
    po: "ここから始めよう！",
  },
};

export function nextPhase(phase: DiagnosisPhase): DiagnosisPhase | null {
  const at = DIAGNOSIS_PHASES.indexOf(phase);
  return DIAGNOSIS_PHASES[at + 1] ?? null;
}

/**
 * 1つ前へ。**分析中へは戻さない。**
 *
 * 戻ったところで同じ 1.8 秒をもう一度待つだけで、戻る先として
 * 意味を持たない。現在地から「戻る」を押した人が行きたいのは
 * 最後の質問（＝答えを直せる場所）なので、そこは呼び出し側が
 * `null` を受けて教材のほうを1歩戻す。
 */
export function prevPhase(phase: DiagnosisPhase): DiagnosisPhase | null {
  const at = DIAGNOSIS_PHASES.indexOf(phase);
  const back = DIAGNOSIS_PHASES[at - 1];
  return back && back !== "analyzing" ? back : null;
}
