/**
 * Day完了の重ね画面を、出ていれば閉じる。
 *
 * なぜ要るか
 * ----------
 * 初めてレッスンを終えると、完了画面の上に「Day1 終了！」が重なる
 * （`components/course/DayComplete.tsx`）。重ねている以上、下の
 * 完了画面のボタンは押せない——**それが狙いどおりの動き**で、
 * 触る人も一度閉じてから続きを触る。
 *
 * 完了画面から先へ進む検査（成果物を取っておく・くわしい説明へ移る・
 * 次のコースへ）は、その一手ぶんだけ手順が増えた。24件が
 * `locator.click: Test timeout` で落ちて気づいた。
 *
 * 1か所に置く理由
 * ---------------
 * 完了画面まで進む道は、いま6つの検査がそれぞれ自前で持っている。
 * 閉じる一手をそこへ書き足すと、次に重ね画面を触ったときに
 * 6か所を直すことになる。ここに置いて、呼ぶだけにする。
 *
 * 出ていなければ何もしない
 * ------------------------
 * やり直した回は出ない（初回だけ祝う）。「出ているはず」を前提に
 * すると、2周目を通す検査がここで落ちる。
 */

import type { Page } from "@playwright/test";

export async function dismissDayComplete(page: Page): Promise<void> {
  const close = page.getByTestId("day-complete-close");
  if (!(await close.isVisible().catch(() => false))) return;

  await close.click();
  // 消えるまで待つ。消える前に下を押すと、また同じ待ちで落ちる
  await page.getByTestId("day-complete").waitFor({ state: "detached" });
}
