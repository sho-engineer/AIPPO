/**
 * 診断を答え終わってからの、3つの画面。
 *
 * なぜ1画面を3つに割ったか
 * ------------------------
 * 前は結果が1画面だった。図・できていること・次の一歩・おすすめが
 * 同時に出て、しかも下のボタンが「ここから始める」。**読む前に
 * 次へ行く道が目に入る**ので、結果は読まれずに押された。
 *
 * 分けたのは、順番そのものが意味を持つから。
 *
 *     現在地 … 5段階のどこにいるか。まだ Lesson の話はしない
 *     4つの力 … ひし形と、強み／次に伸ばす力／次に覚えること
 *     おすすめ … 上の2つを受けた1本。ここで初めて Lesson が出る
 *
 * 1画面＝1アクションの形に戻っただけで、増えているのは押す回数2回。
 *
 * 「分析しています」は無い
 * ------------------------
 * 前はここに4画面目——4つの観点が順に点く 1.8 秒——があった。消した
 * 理由は2つある。
 *
 * 1つ目。**採点は同期で終わる**（`course/diagnosisScore.ts` は計算
 * だけで、AIもサーバーも呼ばない）。待つものが無いのに待たせるのは、
 * 診断らしさの演出でしかない。
 *
 * 2つ目のほうが重い。あの画面は4つの観点を**白い角丸カードに丸い印**
 * を付けて縦に並べ、順に青くしていた。直前まで答えていた選択肢と
 * 見分けが付かないので、**自分が押していない項目に勝手にチェックが
 * 付いていく**ように見えていた。診断を信じてもらうための画面が、
 * 逆のことをしていた。
 *
 * 診断らしさは、待ち時間ではなく結果の中身で出す——答えと判定の
 * つながり（「この結果になった理由」）、現在地、ひし形、強み、
 * 次に伸ばす力、おすすめの根拠。
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

export const DIAGNOSIS_PHASES = ["stage", "axes", "lesson"] as const;

export type DiagnosisPhase = (typeof DIAGNOSIS_PHASES)[number];

export interface PhaseCopy {
  /** 見出しの上の小さな肩書き。 */
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
 * 1つ前へ。
 *
 * 現在地（先頭）から「戻る」を押した人が行きたいのは最後の質問
 * ——＝答えを直せる場所——なので、そこは `null` を返し、呼び出し側が
 * 教材のほうを1歩戻す。
 */
export function prevPhase(phase: DiagnosisPhase): DiagnosisPhase | null {
  const at = DIAGNOSIS_PHASES.indexOf(phase);
  return DIAGNOSIS_PHASES[at - 1] ?? null;
}
