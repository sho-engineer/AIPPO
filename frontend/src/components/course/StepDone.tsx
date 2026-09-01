/**
 * 「できた」の印。
 *
 * 手応えが要るのは、**押した直後**であって完了画面ではない。
 * 1本のレッスンは19歩あるので、最後にだけ祝っても、途中の18歩は
 * 手応えの無いまま過ぎる。小さく何度も返すほうが、最後まで行く。
 *
 * 大きくしない
 * ------------
 * 大人が仕事の合間に使う画面なので、跳ねる・光るは合わない。
 * チェックが一度だけ弾んで、短い文が付くくらいで足りる。
 * 出したまま残さないのも大事——次の操作の邪魔になる。
 *
 * 音も同じ考えで、**既定では鳴らさない**。設定（設定 → 音）で入れた人にだけ、
 * ここで短い音を出す。鳴らない人にも、できたことは下の文で届く。
 *
 * 読み上げには出す。色と動きだけで伝えると、見えない人には
 * 何も起きていないのと同じになる。
 */

import { useEffect, useState } from "react";

import { IconCheck } from "../Icons";
import { EASING, MOTION } from "../../course/motion";
import { playSuccessSound } from "../../course/sound";

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
  /**
   * 目に見える印を出さず、音と読み上げだけにする。
   *
   * 結果の画面で使う。あそこは見出し（「こんなに変わった」）と
   * ポーの一言（「変わった！」）が**同じことを既に言っている**ので、
   * 3つ目の「AIが書き直しました」は繰り返しになる。
   *
   * それだけなら見た目の話だが、実害が出た。この印は 1.8 秒で
   * 自分から消えるので、**その 1.8 秒だけ下の中身が 43px 押し縮められ、
   * 比べる面が潰れて枠の外へ描かれていた**（画面を見て気づいた）。
   * 出したり消えたりするものを、1画面に収める柱の中へ積まない。
   *
   * 音（AIの返事が届いた）と読み上げへの通知は、こちらでも同じ。
   */
  subtle?: boolean;
}

/** 出しっぱなしにしない。次の操作の邪魔になる。 */
const VISIBLE_MS = 1800;

export function StepDone({ label, trigger, subtle = false }: StepDoneProps) {
  const [shown, setShown] = useState(false);
  const [popped, setPopped] = useState(false);

  useEffect(() => {
    setShown(true);
    setPopped(false);
    // 設定で入れていなければ、この呼び出しは何もしない
    playSuccessSound();
    const raf = window.requestAnimationFrame(() => setPopped(true));
    const timer = window.setTimeout(() => setShown(false), VISIBLE_MS);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [trigger]);

  if (!shown) return null;

  /*
    音と読み上げだけ。場所は取らない（`sr-only` は 1px の箱なので、
    柱の高さを動かさない）。
  */
  if (subtle) {
    return (
      <p role="status" data-testid="step-done" className="sr-only">
        {label}
      </p>
    );
  }

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
