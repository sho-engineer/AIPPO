/**
 * ポーの表示（要件 §5 / §6.7）。
 *
 * 動きの決まり:
 * - ふだんは3〜4秒周期の小さな上下だけ
 * - 5〜8秒ごとに1回まばたき（blink の絵へ一瞬だけ切り替える）
 * - 状態が変わるときは短いフェード
 * - thinking のときだけアンテナが淡く光る
 * - celebrate は**一度だけ**跳ねる。跳ね続けると鬱陶しい
 * - prefers-reduced-motion では止める（index.css で一括）
 *
 * 画像が無いときは壊れた画像を出さず、丸いプレースホルダーへ倒す。
 *
 * ポー自身は押す対象ではない。画面に重ねる以上、
 * 下のボタンのタップを奪わないよう pointer-events を切る。
 */

import { useEffect, useRef, useState } from "react";

import type { PoEmotion, PoMessage } from "../course/types";
import { PO_ALT, PO_FALLBACK, PO_PLACEHOLDER, poAssets } from "./assets";

/** まばたきの間隔。5〜8秒でばらつかせる（等間隔だと機械に見える）。 */
const BLINK_MIN_MS = 5000;
const BLINK_MAX_MS = 8000;
const BLINK_DURATION_MS = 140;

export type PoAvatarProps = {
  po: PoMessage;
  /** 入力中は小さくする／たためる（要件 §6.11）。 */
  compact?: boolean;
  isVisible?: boolean;
};

function useBlink(emotion: PoEmotion): boolean {
  const [blinking, setBlinking] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    // 考えている間・喜んでいる間はまばたきさせない。
    // 表情の意味が伝わらなくなる。
    if (emotion === "thinking" || emotion === "celebrate") {
      setBlinking(false);
      return;
    }

    let cancelled = false;

    const schedule = () => {
      const wait = BLINK_MIN_MS + Math.random() * (BLINK_MAX_MS - BLINK_MIN_MS);
      timer.current = window.setTimeout(() => {
        if (cancelled) return;
        setBlinking(true);
        window.setTimeout(() => {
          if (!cancelled) setBlinking(false);
          schedule();
        }, BLINK_DURATION_MS);
      }, wait);
    };

    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, [emotion]);

  return blinking;
}

function PoImage({ emotion, className }: { emotion: PoEmotion; className: string }) {
  /**
   * 絵の探し方は3段。
   *   1. その状態の絵
   *   2. 近い状態の絵（PO_FALLBACK）
   *   3. 丸いプレースホルダー
   * 壊れた画像は絶対に出さない（要件 §5）。
   */
  const [attempt, setAttempt] = useState(0);
  const chain: PoEmotion[] = [emotion];
  const near = PO_FALLBACK[emotion];
  if (near && near !== emotion) chain.push(near);

  // 状態が変わったら最初から試し直す。
  // 1枚だけ欠けている場合に、ずっと代わりの絵のままにしない。
  useEffect(() => setAttempt(0), [emotion]);

  const failed = attempt >= chain.length;

  if (failed) {
    const { tone, mark } = PO_PLACEHOLDER[emotion];
    return (
      <div
        role="img"
        aria-label={PO_ALT}
        data-testid="po-placeholder"
        className={`flex shrink-0 items-center justify-center rounded-full
                    text-sm font-bold ${tone} ${className}`}
      >
        {mark}
      </div>
    );
  }

  return (
    <img
      // key を変えて、次の候補へ移ったときに必ず読み直させる
      key={chain[attempt]}
      src={poAssets[chain[attempt]]}
      alt={PO_ALT}
      data-testid="po-image"
      onError={() => setAttempt((current) => current + 1)}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}

export function PoAvatar({ po, compact = false, isVisible = true }: PoAvatarProps) {
  const blinking = useBlink(po.emotion);
  if (!isVisible) return null;

  const shown: PoEmotion = blinking ? "blink" : po.emotion;
  const size = compact ? "h-12 w-12" : "h-16 w-16 sm:h-20 sm:w-20";

  return (
    <aside
      data-testid="po-avatar"
      data-emotion={po.emotion}
      className="pointer-events-none flex items-end gap-2"
      // 発言が変わったことを読み上げへ届ける（要件 §6.12）
      aria-live="polite"
    >
      <div
        className="min-w-0 flex-1 rounded-2xl bg-surface px-3 py-2 shadow-card
                   sm:px-4 sm:py-3"
      >
        <p
          className={`text-sm leading-6 ${compact ? "max-h-12 overflow-hidden" : ""}`}
        >
          {po.message}
        </p>
      </div>

      <div className="relative">
        {/* 考えている間だけ、アンテナのあたりが淡く光る */}
        {po.emotion === "thinking" && (
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1
                       animate-twinkle rounded-full bg-brand-bright"
          />
        )}
        <PoImage
          emotion={shown}
          className={`transition-opacity duration-200 ${size} ${
            po.emotion === "celebrate" ? "animate-pop-in" : "animate-float"
          }`}
        />
      </div>
    </aside>
  );
}
