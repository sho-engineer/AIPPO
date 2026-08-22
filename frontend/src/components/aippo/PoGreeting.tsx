/**
 * ホームのあいさつ。**横並びの小さい形。**
 *
 * 前は大きな見出し（2行）＋大きなポー＋吹き出しで、画面の上を
 * まるごと使っていた。ホームで最初に知りたいのは「次に何をするか」
 * なのに、そこへ着く前にひと画面ぶんスクロールする必要があった。
 *
 * ポーは案内役であって、扉の絵ではない
 * ------------------------------------
 * 消しはしない。ただし大きさは、隣の1〜2行と釣り合う程度にする。
 * 見出しと吹き出しに同じことを二度書かない（前は「こんにちは！
 * ポーです」と吹き出しの両方があった）。ここでは**ひとことだけ**。
 *
 * 目印はそのまま
 * --------------
 * `po-avatar` と `po-hero-message` は、表情や言葉の変化を見ている
 * 検査が指している。置き場所と大きさは変えても、指し先は変えない。
 */

import { PoFace } from "../../po/PoAvatar";
import type { PoEmotion } from "../../course/types";

export interface PoGreetingProps {
  /** ひとこと。1〜2行に収まる長さで渡す。 */
  message: string;
  emotion?: PoEmotion;
}

export function PoGreeting({ message, emotion = "talking" }: PoGreetingProps) {
  return (
    <section
      className="flex items-center gap-3"
      data-testid="home-greeting"
      aria-label="ポーからのひとこと"
    >
      <p
        className="min-w-0 flex-1 text-base font-bold leading-7"
        data-testid="po-hero-message"
        // 言葉が変わったことを読み上げへ届ける（要件 §6.12）
        aria-live="polite"
      >
        {message}
      </p>

      {/*
        ポーは 72px。1〜2行の文字と並べたときに、
        どちらが主役かが入れ替わらない大きさにしてある。
      */}
      <div
        data-testid="po-avatar"
        data-emotion={emotion}
        className="pointer-events-none w-16 shrink-0 sm:w-20"
      >
        <PoFace emotion={emotion} message={message} className="h-auto w-full" />
      </div>
    </section>
  );
}
