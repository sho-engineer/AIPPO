/**
 * 1本終えたときの、ごく短い祝い。
 *
 * 大人が仕事の合間に使う画面なので、花火も光も要らない。
 * ただ、19歩かけて終えたことが**何も起きずに終わる**と、
 * 終えた実感が残らない。ほんの少しだけ動かす。
 *
 * 量の決め方
 * ----------
 * 紙は12片。これ以上増やすと、祝いではなく演出そのものが目的に見える。
 * 0.8秒で消える。残ると、次に何をすればよいかの邪魔になる。
 *
 * 動きを減らす設定のとき
 * ----------------------
 * **何も出さない。** これは飾りで、意味は一切載せていない
 * （終えたことは見出しと項目が伝える）。CSS で秒数を0にすると、
 * 紙が散らばったまま画面に残ってしまうので、出す前に判断する。
 */

import { useEffect, useState } from "react";

import { prefersReducedMotion } from "../../course/motion";

/** 紙の数。少ないほうが品よく収まる。 */
const PIECES = 12;

/** 出ている時間。仕様どおり 500〜800ms の範囲に収める。 */
const DURATION_MS = 800;

/** 決め打ちの散り方。乱数だと、毎回違う出方になって落ち着かない。 */
const SPREAD = [-38, -30, -22, -14, -6, 2, 10, 18, 26, 34, 42, 48];

export function LessonCelebration() {
  const [alive, setAlive] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    setAlive(true);
    const timer = window.setTimeout(() => setAlive(false), DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!alive) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="lesson-celebration"
      className="pointer-events-none absolute inset-x-0 top-0 h-32 overflow-hidden"
    >
      {SPREAD.slice(0, PIECES).map((offset, index) => (
        <span
          key={offset}
          className="absolute left-1/2 top-4 block h-1.5 w-1.5 rounded-[1px] bg-brand"
          style={{
            // 色は2色だけ。増やすと子ども向けの画面に見える
            backgroundColor: index % 3 === 0 ? "var(--joy, #f0b429)" : undefined,
            animation: `confetti ${DURATION_MS}ms ease-out forwards`,
            animationDelay: `${index * 18}ms`,
            // 散る向きは1片ずつ決めておく
            ["--confetti-x" as string]: `${offset * 3}px`,
          }}
        />
      ))}
    </div>
  );
}
