/**
 * ポーのまわりに散る、紙とキラキラ。
 *
 * どこで使うか
 * ------------
 * 技を受け取る回だけ（`course/poPresence.ts` の `burst`）。完了画面は
 * 同じ `celebrate` の場面だが、あちらは `LessonCelebration` が別に紙を
 * 撒く。2つ重ねると、祝いではなく演出そのものが目的に見える。
 *
 * 量の決め方
 * ----------
 * 紙10片とキラキラ4つ。`LessonCelebration`（12片）より少なくする
 * ——あちらはレッスンを1本終えたときで、こちらは途中の1つ。
 * **途中の祝いが、終わりの祝いより派手にならない**ようにする。
 *
 * 散る先は決め打ちにする。乱数だと、同じ技を取り直すたびに違う出方に
 * なり、落ち着かない（`LessonCelebration` と同じ考え方）。
 *
 * ポーの上に紙を置かない
 * ----------------------
 * 顔にかかると、表情が読めなくなる。散らすのは**体の外側**だけ
 * ——箱より一回り広い範囲に置き、内側へは入れない。
 *
 * 動きを減らす設定のとき
 * ----------------------
 * **何も出さない。** これは飾りで、意味は一切載せていない（技を
 * 取ったことは「AI技 GET」の札と名前が文字で伝える）。CSS で秒数を
 * 0 にすると、紙が散らばったまま画面に残る。
 */

import { useEffect, useState } from "react";

import { prefersReducedMotion } from "../course/motion";

/**
 * 1片ぶんの散り方。
 *
 *     x … 中心からの左右のずれ（%）。0 は真上
 *     y … 出はじめの高さ（%）。0 が箱の上端
 *     d … 出はじめを遅らせる時間（ms）
 */
const PAPER = [
  { x: -46, y: 18, d: 0 },
  { x: -34, y: 4, d: 60 },
  { x: -22, y: 26, d: 30 },
  { x: -12, y: 0, d: 110 },
  { x: 12, y: 2, d: 20 },
  { x: 22, y: 22, d: 90 },
  { x: 34, y: 6, d: 50 },
  { x: 46, y: 20, d: 130 },
  { x: -52, y: 40, d: 150 },
  { x: 52, y: 38, d: 80 },
];

/** キラキラ。紙より少なく、角に置く。 */
const SPARKS = [
  { x: -58, y: 8 },
  { x: 58, y: 12 },
  { x: -50, y: 62 },
  { x: 50, y: 58 },
];

/** 出ている時間。`animate-confetti` と同じ長さにしておくこと。 */
const DURATION_MS = 800;

export function PoBurst() {
  const [alive, setAlive] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    setAlive(true);
    const timer = window.setTimeout(() => setAlive(false), DURATION_MS + 200);
    return () => window.clearTimeout(timer);
  }, []);

  if (!alive) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="po-burst"
      /*
        ポーの箱より一回り広く取る。内側（顔と体）には置かないので、
        はみ出したぶんが散り場所になる。押せるものは何も無い。
      */
      className="pointer-events-none absolute -inset-x-8 -top-4 bottom-0"
    >
      {PAPER.map((piece) => (
        <span
          key={`p${piece.x}-${piece.y}`}
          className="animate-confetti absolute block h-1.5 w-1.5 rounded-[1px] bg-brand"
          style={{
            left: `${50 + piece.x}%`,
            top: `${piece.y}%`,
            // 色は2色だけ。増やすと子ども向けの画面に見える
            backgroundColor: piece.d % 3 === 0 ? "#F0B429" : undefined,
            animationDelay: `${piece.d}ms`,
            // 散る向きは1片ずつ決めておく。外へ向かって開く
            ["--confetti-x" as string]: `${piece.x * 0.5}px`,
          }}
        />
      ))}
      {SPARKS.map((spark) => (
        <span
          key={`s${spark.x}-${spark.y}`}
          className="animate-twinkle absolute block h-2 w-2 rounded-full bg-brand-bright"
          style={{
            left: `${50 + spark.x}%`,
            top: `${spark.y}%`,
            animationDelay: `${(spark.x + 60) * 3}ms`,
          }}
        />
      ))}
    </div>
  );
}
