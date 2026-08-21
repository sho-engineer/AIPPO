/**
 * 学習パス（Learning Path）を、コースの中身の画面から読む。
 *
 * なぜ画面を1つ増やさないか
 * --------------------------
 * 学習パスは「複数レッスンを目的別に束ねたもの」で、いまの
 *
 *     コース一覧 → コースの中身 → レッスン
 *
 * と同じ形をしている。同じ形の入り口を2つ並べると、利用者は
 * どちらから入ればよいのか分からなくなる（そして中身はほぼ同じ）。
 *
 * いまコースと学習パスは1対1で、slug も同じ（apps/rewards/seeding.py）。
 * そこで**新しい画面を作らず**、いまのコースの中身の画面に、
 * 学習パスだけが持っている情報——レシピと、サーバーが数えたスタンプ——を
 * 足す形にする。
 *
 * 分かれる日が来たら
 * ------------------
 * 1つのレッスンが複数のパスに属し、コースと1対1でなくなったときに、
 * 初めてパス専用の一覧が要る。そのときは `fetchLearningPaths` が
 * すでに全部返しているので、画面を足すだけで足りる。
 *
 * 届かなくても画面は出す
 * ----------------------
 * サーバーが落ちていても、コースの中身そのものは同梱データで出せる。
 * ここが返せないときは**その節だけを出さない**。読み込めなかったと
 * 大きく出すと、実際には学べる状態なのに壊れて見える。
 */

import { useEffect, useState } from "react";

import { fetchLearningPaths, type LearningPathSummary } from "../api/rewards";

/**
 * この id のコースに対応する学習パス。
 *
 * 見つからない・届かないときは null。画面側はそのときに
 * 節ごと出さない（憲章 原則 I：無いものを枠だけ見せない）。
 */
export function useLearningPath(courseId: string): LearningPathSummary | null {
  const [path, setPath] = useState<LearningPathSummary | null>(null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    fetchLearningPaths(controller.signal)
      .then((body) => {
        if (!alive) return;
        setPath(body.paths.find((entry) => entry.id === courseId) ?? null);
      })
      .catch(() => {
        // 届かなかった。コースの中身そのものは同梱データで出せる
        if (alive) setPath(null);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [courseId]);

  return path;
}
