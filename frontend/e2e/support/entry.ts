/**
 * 入口（タイトル → 診断の案内）を通ったことにする。
 *
 * なぜ要るか
 * ----------
 * `/` を開いた先は、いつもホームとは限らない。入口を通っていない人には
 * まずタイトルが出て、「はじめる」のあとに診断の案内が1枚入る
 * （`app/entry.ts`）。どちらにも下タブが無い。
 *
 * 検査はどれも `localStorage.clear()` から始めるので、**毎回この入口から**
 * になる。ホームを前提に書いた道具（`getByTestId("tab-bar")` を待つもの）は
 * そこで 30 秒待って落ちる。
 *
 * 本物のバックエンドに当てる検査で、これが起きた
 * ----------------------------------------------
 * `stubApi` を使う検査は、同じことを内側でやっていた（`showEntry` が
 * 偽のとき）。だから**スタブを使わない検査だけ**が落ちた
 * ——`authGuestFirst` `exploratory` `header`。CI の
 * 「E2E and smoke (real backend)」でしか動かないので、手元の通し確認では
 * 飛ばされて（`backendIsUp` が偽）見えていなかった。
 *
 * 入口そのものは、これで飛ばさない
 * --------------------------------
 * タイトルと案内の1枚が正しく出るかは `e2e/entryFlow.spec.ts` が見る。
 * ここを使う検査は入口を見ていない——ゲストのまま試せること、通しで
 * 完走できること、上の帯のこと。**見ていないものを毎回通らせない。**
 */

import type { Page } from "@playwright/test";

/**
 * 入口を通ったことを覚えておく2つ。
 *
 *   `aippo:guest`           … ゲストで始めた（`lib/draft.ts`）
 *   `aippo:diagnosis-nudge` … 診断の案内を見た（`course/diagnosisNudge.ts`）
 *
 * 両方あると、開いた先はホームになる（`app/entry.ts`）。
 */
export const ENTRY_KEYS = ["aippo:guest", "aippo:diagnosis-nudge"];

/**
 * 読み込みのたびに、アプリより先に立てる。
 *
 * 1回書くだけでは足りない——検査は `localStorage.clear()` してから
 * 読み込み直すので、そこで消える。`addInitScript` はどの読み込みでも
 * 先に走るので、消されても次の読み込みで立ち直る。
 *
 * 画面を開く**前**に呼ぶこと。
 */
export async function skipEntry(page: Page): Promise<void> {
  await page.addInitScript((keys) => {
    try {
      for (const key of keys) window.localStorage.setItem(key, "1");
    } catch {
      /* 保存が使えない環境。そこでは入口が出るが、検査では使わない */
    }
  }, ENTRY_KEYS);
}
