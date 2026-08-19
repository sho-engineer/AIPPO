/**
 * 「できた」の印。
 *
 * 手応えが要るのは、**押した直後**であって完了画面ではない。
 * 1本のレッスンは19歩あるので、最後にだけ祝っても、途中の18歩は
 * 手応えの無いまま過ぎる。小さく何度も返すほうが、最後まで行く。
 *
 * 大きくしない
 * ------------
 * 大人が仕事の合間に使う画面なので、跳ねる・光る・音が鳴るは合わない。
 * チェックが一度だけ弾んで、短い文が付くくらいで足りる。
 * 出したまま残さないのも大事——次の操作の邪魔になる。
 *
 * 読み上げには出す。色と動きだけで伝えると、見えない人には
 * 何も起きていないのと同じになる。
 */

import { useEffect, useState } from "react";

import { IconCheck } from "../Icons";
import { EASING, MOTION } from "../../course/motion";

export interface StepDoneProps {
  /** 出す文。「できた！」など短く。 */
  label: string;
  /**
   * これが変わったら、もう一度出す。
   *
   * 同じステップに留まっている間に出し直さないための目印。
   * AI の実行回数などを渡す。
   */
  trigger: string | number;
}

/** 出しっぱなしにしない。次の操作の邪魔になる。 */
const VISIBLE_MS = 1800;

export function StepDone({ label, trigger }: StepDoneProps) {
  const [shown, setShown] = useState(false);
  const [popped, setPopped] = useState(false);

  useEffect(() => {
    setShown(true);
    setPopped(false);
    const raf = window.requestAnimationFrame(() => setPopped(true));
    const timer = window.setTimeout(() => setShown(false), VISIBLE_MS);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [trigger]);

  if (!shown) return null;

  return (
    <p
      role="status"
      data-testid="step-done"
      className="mb-4 flex items-center gap-2 text-sm font-bold text-brand"
      style={{
        opacity: popped ? 1 : 0,
        transition: `opacity ${MOTION.fast}ms ${EASING}`,
      }}
    >
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-white"
        style={{
          transform: popped ? "scale(1)" : "scale(0)",
          transition: `transform ${MOTION.normal}ms ${EASING}`,
        }}
      >
        <IconCheck className="h-3.5 w-3.5" />
      </span>
      {label}
    </p>
  );
}
