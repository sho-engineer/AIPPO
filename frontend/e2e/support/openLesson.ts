/**
 * 指定の1本を、最初の画面まで開く。
 *
 * 第1リリースで開いているのは診断と Day1 だけなので、Day2 以降を見たい
 * 検査は、検査のあいだだけ全部開ける（`serveOpenCatalog`）。公開状態
 * そのものは `e2e/releaseGate.spec.ts` が別に見ている。
 *
 * **`stubApi` のあとに呼ぶこと。** 教材の差し替えは、あとから登録した
 * 経路が先に当たり、しかも教材は起動時に1回しか聞かない
 * （`support/openLessons.ts`）。
 */

import { expect, type Page } from "@playwright/test";

import { dismissLessonIntro } from "./lessonIntro";
import { serveOpenCatalog, type SnapshotLesson } from "./openLessons";

export async function openLessonById(
  page: Page,
  lessonId: string,
  /** 配る前に教材へ手を入れる（`serveOpenCatalog`）。 */
  edit?: (lesson: SnapshotLesson) => SnapshotLesson,
): Promise<void> {
  await serveOpenCatalog(page, edit);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId(`lesson-${lessonId}`).click();
  await dismissLessonIntro(page);
  await expect(page.getByTestId("lesson-header")).toBeVisible();
}
