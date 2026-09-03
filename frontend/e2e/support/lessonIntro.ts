/**
 * レッスンを開いたときの、教材が始まるまで。
 *
 * 開くと、まず段の頭の章扉が1枚出て（絵だけの画面）、通り抜けると
 * 導入の一枚が中央に浮かぶ。後ろの画面を見たい検査は、先にこの2つを
 * 片づける。閉じないまま下のボタンを押そうとすると、背景（閉じるための面）
 * が受け取ってしまう。
 *
 * 「押す先が1つ」を確かめる検査だけは、閉じずにそのまま見ること。
 */

import { expect, type Page } from "@playwright/test";

/**
 * いま章扉にいるなら、1枚ぶん進める。
 *
 * 見えているかどうかで判断する。「Day1 は必ず章扉から始まる」と
 * 決め打ちにしない——章扉の枚数や置き場所は教材データの都合で変わる
 * ので、**出ていたら押す**形にしておけば、並びが変わってもここは
 * 直さずに済む。
 */
export async function passSectionCover(page: Page): Promise<boolean> {
  const cover = page.getByTestId("section-transition");
  if ((await cover.count()) === 0) return false;

  await page.getByTestId("primary-action").first().click();
  await expect(cover).toHaveCount(0);
  return true;
}

/**
 * 教材が始まるところまで進める。
 *
 * 章扉が出ていれば通り抜け、導入の一枚が出ていれば閉じる。
 * どちらも出ていなければ何もしない。
 */
export async function dismissLessonIntro(page: Page): Promise<void> {
  await passSectionCover(page);

  const sheet = page.getByTestId("lesson-intro-sheet");
  if ((await sheet.count()) === 0) return;
  await page.getByTestId("lesson-intro-close").click();
  await expect(sheet).toHaveCount(0);
}
