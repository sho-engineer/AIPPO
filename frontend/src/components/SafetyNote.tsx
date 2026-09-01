/**
 * 安全上の注意（AIPPO 開発概要 §15）。
 *
 * 出す場所は2種類ある。
 *
 * - `input`  … 自由に文章を書く場所。入れてはいけないものを先に伝える
 * - `output` … AIの回答を読む場所。そのまま信じてはいけないことを伝える
 *
 * 固定文なので AI には作らせない（§17）。
 * 目立たせすぎると本題の邪魔になるので、控えめに、ただし必ず出す。
 */

import { SAFETY } from "../content/ui";

export type SafetyNoteProps = {
  /** 入力の直前か、AIの回答の直後か。 */
  placement: "input" | "output";
};

export function SafetyNote({ placement }: SafetyNoteProps) {
  const notes =
    placement === "input"
      ? [SAFETY.beforeInput]
      : [SAFETY.checkFacts, SAFETY.expertAdvice];

  // 注意書きだと一目で分かる色にする。
  // 本文やチェック項目と同じ色にすると、読み飛ばされる。
  return (
    /*
      詰めて置く。**消さずに、小さくする。**

      1画面＝1アクションに収めるとき、この注意書きは 106px あって
      比べる面を潰す一番の重しだった（Pixel 5 で実測）。消すのは
      要件 §15 に反するので、余白と行間を詰めて 2行に収める。
      色（注意の地色）は変えない——読み飛ばされたら意味が無い。
    */
    <div
      data-testid={`safety-${placement}`}
      className="mt-2 rounded-card border border-caution/20 bg-caution-soft px-3 py-2"
    >
      {/*
        1件ずつ改行しない。

        箇条書きにすると、短い2文でも**必ず2行ずつ**になる（1行に
        入り切っても次の項目は改行される）。1つの段落として流すと
        同じ文字数が 4行 → 2行 に収まり、44px 返ってくる。
        文そのものは変えない——安全の言葉は削らない。
      */}
      <p className="text-[0.6875rem] leading-4 text-ink-muted">
        {notes.join(" ")}
      </p>
    </div>
  );
}
