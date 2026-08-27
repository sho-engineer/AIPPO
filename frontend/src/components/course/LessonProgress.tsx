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
 * 区切り（ミッション）
 * --------------------
 * 帯を4つに割り、いまいる区切りの名前を左に出す。
 *
 * 分数を2つにしない。前に3段で同じことを言って読まれなくなった件と
 * 同じ轍で、「2 / 4」と「3 / 19」が並ぶと、どちらを見ればよいのか
 * 決められなくなる。**割れ目は形で、名前は言葉で**出し、数字は
 * いままでどおり1つだけにしてある。
 *
 * なぜ割るか
 * ----------
 * 19歩の一本道に見えると、始めた人はまず「あと16回も押すのか」と
 * 思う。実際の中身は4つのまとまりで、どれも数歩で終わる。
 * その形が画面に出ていなかった。
 *
 * 伸びる動き
 * ----------
 * 帯は幅を transition で伸ばす。瞬間で変わると、進んだことに
 * 気づかない。動きを止めている人には幅の値だけが残るが、
 * 数字も並べてあるので意味は落ちない。
 */

import { EASING, MOTION } from "../../course/motion";
import type { Mission } from "../../course/missions";

export interface LessonProgressProps {
  current: number;
  total: number;
  /** 区切り（ミッション）。無ければ帯を割らない。 */
  missions?: Mission[];
  /** いま何番目の区切りか。1始まり。 */
  currentMission?: number;
}

export function LessonProgress({
  current,
  total,
  missions = [],
  currentMission = 0,
}: LessonProgressProps) {
  const safeTotal = Math.max(1, total);
  const ratio = Math.min(1, Math.max(0, current / safeTotal));
  const here = missions[currentMission - 1];

  return (
    <div
      role="progressbar"
      aria-label="レッスンの進み具合"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={safeTotal}
      aria-valuetext={
        here
          ? `${safeTotal}歩のうち${current}歩目。いまは「${here.label}」`
          : `${safeTotal}歩のうち${current}歩目`
      }
      data-testid="lesson-progress"
    >
      {/*
        帯そのもの。高さは 3px。太くすると、それだけで画面の主役になる。

        割れ目は帯の**上に重ねる**。区切りごとに要素を分けて並べると、
        伸びる動きが区切りの端で止まって見える（1本の帯が伸びるのと、
        4本が順に埋まるのとでは、進んでいる感じが違う）。
      */}
      <div className="relative h-[3px] overflow-hidden rounded-full bg-brand-line">
        <div
          className="h-full rounded-full bg-brand"
          style={{
            width: `${ratio * 100}%`,
            transition: `width ${MOTION.normal}ms ${EASING}`,
          }}
        />
        {missions.length > 1 &&
          missions.slice(0, -1).map((mission, index) => {
            const upTo = missions
              .slice(0, index + 1)
              .reduce((sum, item) => sum + item.steps, 0);
            return (
              <span
                key={mission.key}
                aria-hidden="true"
                className="absolute top-0 h-full w-0.5 bg-surface"
                style={{ left: `${(upTo / safeTotal) * 100}%` }}
              />
            );
          })}
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        {/*
          いまどの区切りにいるか。名前だけを出す。
          分数を2つ並べると、どちらを見ればよいのか決められなくなる。
        */}
        <span
          className="min-w-0 truncate text-xs text-ink-muted"
          data-testid="lesson-mission"
        >
          {here?.label ?? ""}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-ink-muted">
          {current} / {safeTotal}
        </span>
      </div>
    </div>
  );
}
