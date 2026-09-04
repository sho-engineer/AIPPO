/**
 * スタンプ台紙を閉じる。
 *
 * 技を受け取る回で「覚えた」を押すと、進む前に台紙が1枚挟まる
 * （`SkillStampCard`）。その日の何個目かを見せるだけの一枚なので、
 * 後ろの画面を見に行きたい検査は、ここを閉じて通り抜ける。
 *
 * 出ていたら閉じる、という形にしてある——どのレッスンのどの回に技が
 * 付いているかは教材データの都合で変わるので、決め打ちにすると
 * 教材を1つ足すたびにここを直すことになる。
 */

import { screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

type User = ReturnType<typeof userEvent.setup>;

/** いま台紙が出ているなら、閉じて次へ進める。 */
export async function passSkillStamp(user: User): Promise<boolean> {
  if (!screen.queryByTestId("skill-stamp-sheet")) return false;

  await user.click(screen.getByTestId("skill-stamp-continue"));
  return true;
}
