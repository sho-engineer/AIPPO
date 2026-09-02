/**
 * レッスンを開くと、まず導入の一枚が中央に浮かぶ。
 *
 * 後ろの画面を見たい検査は、先にこれを閉じる。閉じないまま下の
 * ボタンを押そうとすると、背景（閉じるための面）が受け取ってしまう。
 *
 * 「押す先が1つ」を確かめる検査だけは、閉じずにそのまま見ること。
 */

import { expect, type Page } from "@playwright/test";

/** 導入の一枚が出ていれば閉じる。出ていなければ何もしない。 */
export async function dismissLessonIntro(page: Page): Promise<void> {
  const sheet = page.getByTestId("lesson-intro-sheet");
  if ((await sheet.count()) === 0) return;
  await page.getByTestId("lesson-intro-close").click();
  await expect(sheet).toHaveCount(0);
}
