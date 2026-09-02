/**
 * 完了画面の「このレッスンの記録」をひらく。
 *
 * なぜ要るか
 * ----------
 * 完了画面は1画面＝1アクションに収めた。画面に残すのは
 * **できるようになったこと・覚えたAI技・今回の成果物**の3つだけで、
 * 進み具合・節目・XP・登録の誘い・アンケート・応用例・次におすすめは
 * 押したら開く一枚（`MoreSheet`）へ移してある
 * （`src/components/course/steps/Completion.tsx` の冒頭）。
 *
 * **消してはいない**ので、完了画面から先を触る検査は、その一手ぶん
 * だけ手順が増えた。
 *
 * 1か所に置く理由
 * ---------------
 * 完了画面まで進む道は、いま6つの検査がそれぞれ自前で持っている。
 * 開く一手をそこへ書き足すと、次に置き場所を変えたときに6か所を
 * 直すことになる。ここに置いて、呼ぶだけにする。
 *
 * 出ていなければ何もしない
 * ------------------------
 * 診断のように成果物を持たない回では、この画面そのものが違う形で出る。
 * 「あるはず」を前提にすると、そこで落ちる。
 */

import type { Page } from "@playwright/test";

export async function openRecord(page: Page): Promise<void> {
  const more = page.getByTestId("completion-more");
  if (!(await more.isVisible().catch(() => false))) return;

  await more.click();
  // 開き切るまで待つ。滑って出るあいだは中のボタンを押せない
  await page.getByTestId("more-sheet").waitFor();
}
