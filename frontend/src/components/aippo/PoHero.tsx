/**
 * 画面のいちばん上。大きな見出しと、ポーと、ひとこと。
 *
 * 支給デザインは6枚とも同じ形をしている。
 *
 *     大きな見出し（2行）      ポー（大きめ・右上）
 *     └ 吹き出し
 *
 * 見出しは左、ポーは右。ポーは見出しの右上に重ねるくらいの位置で、
 * 文字より少し上に出る。「案内役がこの画面を開いてくれた」という
 * 見え方になる。
 *
 * 吹き出しはポーの言葉
 * --------------------
 * 見出しは**この画面が何か**、吹き出しは**次に何をするか**。
 * 役割を分けているので、吹き出しに見出しの言い換えを入れない。
 * 言い換えを入れると、読む場所が2つに増えるだけになる。
 *
 * ポーは飾りではない
 * ------------------
 * 読み上げにも名前が出る（PoImage の alt）。ただし吹き出しの中身は
 * 文字として読めるので、絵そのものに意味は載せない。
 */

import type { ReactNode } from "react";

import { PoFace } from "../../po/PoAvatar";
import type { PoEmotion } from "../../course/types";

export interface PoHeroProps {
  /** 小さな前置き。「Lesson 1」など。 */
  eyebrow?: ReactNode;
  /** 大きな見出し。 */
  title: ReactNode;
  /** 見出しの下の1行。 */
  description?: ReactNode;
  /** ポーのひとこと。渡さなければ吹き出しは出ない。 */
  message?: string;
  emotion?: PoEmotion;
  /** 見出しの下、吹き出しの上に置くもの（所要時間など）。 */
  meta?: ReactNode;
  /** ポーを小さくする。中身が多い画面で使う。 */
  compact?: boolean;
}

export function PoHero({
  eyebrow,
  title,
  description,
  message,
  emotion = "neutral",
  meta,
  compact,
}: PoHeroProps) {
  return (
    <section className="relative pt-2" data-testid="po-hero">
      {/*
        ポーは文字の上に重ねる。回り込みではなく重ねるのは、
        見出しが2行でも3行でも、ポーの位置を動かさないため。
        文字の側には右の余白を取ってあるので、重なって読めなくはならない。
      */}
      {/*
        目印（po-avatar）は変えない。表情の切り替わりを見ている検査が
        これを指している。置き場所を変えても、指し先は動かさない。
      */}
      <div
        data-testid="po-avatar"
        data-emotion={emotion}
        className={`pointer-events-none absolute -top-2 right-0 ${
          compact ? "w-28" : "w-36 sm:w-40"
        }`}
      >
        <PoFace emotion={emotion} message={message} className="h-auto w-full" />
      </div>

      {/* 文字の側は、ポーの幅ぶんだけ空ける。空けないと見出しに重なる */}
      <div className={compact ? "pr-28" : "pr-32 sm:pr-36"}>
        {eyebrow && <div className="mb-1">{eyebrow}</div>}

        {/*
          折り返しはブラウザ任せにする。

          break-keep を掛けると、句読点の無い日本語は切れる場所を失って
          **折り返さずに画面からはみ出す**（実際に診断の設問で起きた）。
          不自然な切れ方より、読めなくなるほうがずっと悪い。
        */}
        <h1 className="text-xl font-bold leading-[1.5] sm:text-2xl">
          {title}
        </h1>

        {description && (
          <p className="mt-2 text-sm leading-7 text-ink-muted">
            {description}
          </p>
        )}
      </div>

      {meta && <div className="mt-3">{meta}</div>}

      {message && (
        /*
          吹き出し。しっぽはポーの側（右上）へ向ける。
          誰が言っているのかを、線1本で示す。
        */
        <div className="relative mt-3 inline-block max-w-[85%]">
          <p
            className="rounded-panel rounded-tr-sm border border-line bg-surface px-4 py-2.5
                       text-sm leading-6 shadow-card"
            data-testid="po-hero-message"
            // 言葉が変わったことを読み上げへ届ける（要件 §6.12）
            aria-live="polite"
          >
            {message}
          </p>
        </div>
      )}
    </section>
  );
}
