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
    <div
      data-testid={`safety-${placement}`}
      className="mt-3 rounded-xl border border-caution/20 bg-caution-soft px-3.5 py-2.5"
    >
      <ul className="space-y-1">
        {notes.map((note) => (
          <li key={note} className="text-xs leading-5 text-ink-muted">
            {note}
          </li>
        ))}
      </ul>
    </div>
  );
}
