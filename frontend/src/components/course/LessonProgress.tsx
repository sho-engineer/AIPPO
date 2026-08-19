/**
 * レッスンの進み具合。
 *
 * 細い帯と「3 / 19」だけ。
 *
 * 前は3つの部品で同じことを言っていた——区切りの帯（4段）、丸の列
 * （最大7つ）、そして数字。同じ情報を3段で出すと、どれを見れば
 * 「あと何回か」が分かるのかが決められず、結局どれも読まれない。
 * 画面の上のほうが説明で埋まって、本文が下へ押し出される問題もあった。
 *
 * 残したのは「あとどれくらいか」と「いまどこか」だけ。
 * この2つは、進むたびに変わるので、変化そのものが手応えになる。
 *
 * 伸びる動き
 * ----------
 * 帯は幅を transition で伸ばす。瞬間で変わると、進んだことに
 * 気づかない。動きを止めている人には幅の値だけが残るが、
 * 数字も並べてあるので意味は落ちない。
 */

import { EASING, MOTION } from "../../course/motion";

export interface LessonProgressProps {
  current: number;
  total: number;
}

export function LessonProgress({ current, total }: LessonProgressProps) {
  const safeTotal = Math.max(1, total);
  const ratio = Math.min(1, Math.max(0, current / safeTotal));

  return (
    <div
      role="progressbar"
      aria-label="レッスンの進み具合"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={safeTotal}
      aria-valuetext={`${safeTotal}歩のうち${current}歩目`}
      data-testid="lesson-progress"
      className="flex items-center gap-3"
    >
      {/* 帯そのもの。高さは 3px。太くすると、それだけで画面の主役になる */}
      <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-brand-line">
        <div
          className="h-full rounded-full bg-brand"
          style={{
            width: `${ratio * 100}%`,
            transition: `width ${MOTION.normal}ms ${EASING}`,
          }}
        />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-ink-muted">
        {current} / {safeTotal}
      </span>
    </div>
  );
}
