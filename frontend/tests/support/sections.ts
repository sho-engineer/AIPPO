/**
 * 章扉を通り越す。
 *
 * Day1 は4つの段に分かれていて、段の頭に**絵1枚だけの画面**が入る
 * （`section_transition`）。教材の中身は載っていないので、後ろの画面を
 * 見に行きたい検査は、ここを1回押して通り抜ける。
 *
 * 見えているかどうかで判断する
 * ----------------------------
 * 「Day1 は必ず章扉から始まる」と決め打ちにしない。章扉の枚数や
 * 置き場所は教材データの都合で変わるので、**出ていたら押す**という
 * 形にしておけば、並びが変わってもここは直さずに済む。
 */

import { screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

type User = ReturnType<typeof userEvent.setup>;

/** いま章扉にいるなら、1枚ぶん進める。 */
export async function passSection(user: User): Promise<boolean> {
  const cover = screen.queryByTestId("section-transition");
  if (!cover) return false;

  await user.click(screen.getByTestId("primary-action"));
  return true;
}

/**
 * 章扉が続くあいだ、通り抜ける。
 *
 * 上限を置いてある。押しても画面が変わらない不具合が入ったときに、
 * 検査が固まる代わりに落ちるようにするため。
 */
export async function passSections(user: User): Promise<void> {
  for (let guard = 0; guard < 6; guard += 1) {
    if (!(await passSection(user))) return;
  }
  throw new Error("章扉から抜けられない");
}
