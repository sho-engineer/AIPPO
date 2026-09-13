/**
 * 検査のあいだだけ、教材を開ける。
 *
 * なぜ要るか
 * ----------
 * 第1リリースで開いているのは診断と Day1 だけ。そのぶん、**2本以上
 * 開いていないと成り立たない画面**が誰にも見られなくなった。
 *
 *     次の1本のカード（`next-up`）
 *     節目のまとめ（3本終えたところ）
 *     診断の「ほかの候補」
 *     応用例から別の教材へ入る道
 *
 * これらを全部飛ばすと、公開範囲を広げた日に**まとめて壊れているのが
 * 分かる**ことになる。検査の中でだけ開けて、見続ける。
 *
 * どう開けるか
 * ------------
 * 画面は起動時に `GET /api/v1/catalog/` を1回聞き、届いたものへ
 * 差し替える（`src/course/live.ts`）。`stubApi` は既定で空を返して
 * 同梱データのままにしているので、ここでは**同梱データを写して
 * `availability` だけ書き換えたもの**を返す。
 *
 * 写しの元は `frontend/catalog-snapshot.json`——`node dump-catalog.mjs`
 * が `catalog.ts` から作るファイル。古いままだと検査が実物と違うものを
 * 見ることになるので、**新しいかどうかを `npm run validate:lessons`
 * が見張る**。
 *
 * これは公開状態の検査ではない
 * ----------------------------
 * 「準備中の教材が始められないこと」は `e2e/releaseGate.spec.ts` が
 * 別に見る。こちらを使う検査は、公開範囲とは別のことを見ている。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = join(HERE, "../../catalog-snapshot.json");

interface SnapshotLesson {
  id: string;
  availability?: string;
  [key: string]: unknown;
}

/**
 * 同梱の教材を、全部開いた形でサーバーから配る。
 *
 * 呼ぶ場所は2つとも守ること。
 *
 *   1. `stubApi` の**あと**——あとから登録した経路が先に当たる
 *      （Playwright は**最後に登録したものから**照合する）ので、
 *      先に呼ぶと `stubApi` の空の教材に上書きされる
 *   2. 画面を開く**前**——教材は起動時に1回だけ聞くので、開いたあとに
 *      差し替えても届かない
 */
export async function serveOpenCatalog(page: Page): Promise<void> {
  const course = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as {
    lessons: SnapshotLesson[];
  };

  const opened = {
    ...course,
    lessons: course.lessons.map((lesson) => ({
      ...lesson,
      availability: "available",
    })),
  };

  await page.route("**/api/v1/catalog/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ courses: [opened] }),
    });
  });
}

/** 同梱データにある教材の id。並びは `catalog.ts` と同じ。 */
export function snapshotLessonIds(): string[] {
  const course = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as {
    lessons: SnapshotLesson[];
  };
  return course.lessons.map((lesson) => lesson.id);
}
