/**
 * ポーの大きさ。**画面ごとに幅を書かない。**
 *
 * 何が起きていたか
 * ----------------
 * 画面ごとに違う部品が、その場で決めた幅を直書きしていた。390px で
 * 実際に測ると、こうなっていた（見えている背丈）。
 *
 *     コース一覧    35px
 *     ホーム        46px
 *     レッスン     104px   ← コース一覧の 3倍
 *     同じレッスン   81px   ← 進むだけで 22% 縮む
 *
 * 最後の1行がいちばん厄介だった。`StepShell` が
 * `compact={!eyebrow}` と書いていて、**小さな前置き（Lesson 1 など）が
 * 有るか無いかという、ポーとは何の関係もない条件**で背丈が変わっていた。
 * 同じレッスンを進んでいるだけでポーが縮むので、「同じ子がいる」より
 * 「画面ごとに別の画像を置いている」ように見える。
 *
 * 枠ではなく、見えている背丈で決める
 * ----------------------------------
 * 絵の台紙（512×512）には透明の余白が入っていて、**枠の大きさと
 * 見えるポーの大きさは一致しない**。neutral の絵は台紙の 72.3% の
 * 高さしか使っていないので、144px の枠に入れても背丈は 104px になる。
 *
 * だからここは「見えてほしい背丈」で決め、枠は割り戻して出す。
 * 絵を差し替えて余白が変わっても、ここの数字の意味は変わらない。
 *
 * 幅を渡す口を残さない
 * --------------------
 * `size` しか受け取らない形にする。`className` で幅を上書きできると、
 * 急いでいる日に1画面だけ直書きが戻り、また揃わなくなる。
 */

import { PO_REFERENCE } from "./assets";

/**
 * 大きさの段。**役割で選ぶ。画面で選ばない。**
 *
 *     sm          一覧の行、狭い案内。文字の隣に寄り添う大きさ
 *     md          レッスンの反応・質問。ポーが話しかける大きさ
 *     lg          レッスンの入り、大事な場面
 *     celebration Day を終えたとき。ここだけ特別
 */
export type PoSize = "sm" | "md" | "lg" | "celebration";

/** 見えてほしい背丈（px）。 */
const VISIBLE_HEIGHT: Record<PoSize, number> = {
  sm: 56,
  md: 96,
  lg: 112,
  celebration: 132,
};

/**
 * 見えている背丈から、枠の一辺を出す。
 *
 * 枠は正方形（台紙が 512×512 なので）。中の絵は `poTransform()` が
 * neutral の位置と大きさへ合わせるので、**どの表情でも同じ背丈**になる。
 * だから割り戻しに使うのは neutral の高さ1つでよい。
 */
export function poFrame(size: PoSize): number {
  return Math.round(VISIBLE_HEIGHT[size] / (PO_REFERENCE.height / 100));
}

/** 見えている背丈（px）。検査が「揃っているか」を測るのに使う。 */
export function poVisibleHeight(size: PoSize): number {
  return VISIBLE_HEIGHT[size];
}

/**
 * そのまま style へ渡せる形。
 *
 * Tailwind の `w-36` のような刻みでは、割り戻した数（78 / 132 / 156 /
 * 182px）をちょうど表せない。刻みに寄せると背丈がまた 4〜8px ずれるので、
 * ここは実寸で渡す。
 */
export function poFrameStyle(size: PoSize): { width: string } {
  return { width: `${poFrame(size)}px` };
}
