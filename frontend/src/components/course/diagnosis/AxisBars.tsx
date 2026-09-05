/**
 * 4つの力を、横棒で。
 *
 * なぜここに出すのか
 * ------------------
 * 前はこれを「理由を見る」の中へ隠していた。数字を表に出すと点数を
 * 上げる遊びに見える、という理由だったが、隠した結果**結果画面から
 * 図が1つも無くなり**、文字だけが縦に並ぶ画面になった。
 *
 * 段は5つに刻んであって、68点・82点のような細かい数は出さない。
 * 5問から出した数字にその精度は無い。刻みが粗いままなら、点取りには
 * 見えず「どこが埋まっていて、どこが空いているか」だけが伝わる。
 *
 * 順番を並べ替えない
 * ------------------
 * 高い順に並べたくなるが、**積み上げの順**（頼む → 条件 → 目的 →
 * 流れ）で固定する。並べ替えると、次にやることが毎回ちがう場所に
 * 出てきて、2回目に診断した人が前回と比べられない。
 */

import { useEffect, useState } from "react";

import { AXES, AXIS_LABELS, type Axis } from "../../../course/diagnosisScore";

const STEPS = [1, 2, 3, 4, 5];

export interface AxisBarsProps {
  axes: Record<Axis, number>;
  /** 次に伸ばすところ。1つだけ印を付ける。 */
  focus?: Axis;
}

export function AxisBars({ axes, focus }: AxisBarsProps) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <ul className="space-y-1" role="list" data-testid="axis-bars">
      {AXES.map((axis, row) => (
        <li
          key={axis}
          className="flex items-center gap-2.5"
          data-testid="axis-bar"
          data-axis={axis}
          data-value={axes[axis]}
        >
          <span
            className={`w-[6.5rem] shrink-0 text-xs leading-4 ${
              axis === focus ? "font-bold text-brand-dark" : "text-ink-muted"
            }`}
          >
            {AXIS_LABELS[axis]}
          </span>
          <span
            className="flex flex-1 gap-1"
            aria-label={`${AXIS_LABELS[axis]} 5段階のうち ${axes[axis]}`}
          >
            {STEPS.map((step) => {
              const on = step <= axes[axis];
              return (
                <span
                  key={step}
                  aria-hidden="true"
                  className={`h-2 flex-1 rounded-full transition duration-300 ease-out ${
                    on ? "bg-brand" : "bg-brand-line"
                  }`}
                  /*
                    左から順に埋まっていく。行ごとにも少しずらす——
                    4行が同時に伸びると、増えたのか最初からそうだったのか
                    が分からない。
                  */
                  style={{
                    opacity: drawn || !on ? 1 : 0,
                    transform: drawn || !on ? "none" : "scaleX(0.2)",
                    transformOrigin: "left",
                    transitionDelay: `${row * 70 + step * 45}ms`,
                  }}
                />
              );
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}
