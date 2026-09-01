/**
 * 画面のいちばん上。見出しと、その下にポーのひとこと。
 *
 *     大きな見出し（2行）
 *     └ 説明
 *
 *     [ どうだった？ ]◀ ポー
 *
 * ポーを重ねるのをやめた
 * ----------------------
 * 前はポーを絶対配置で右上に置き、見出しの側に幅ぶんの余白を空けて
 * 避けていた。そのぶん吹き出しは下の通常フローへ回るので、
 * **ポーは右上・吹き出しは左下**と画面の対角に離れる（390px で実測、
 * いちばん近い角どうしで 138px）。その距離だと、吹き出しは
 * 「ポーが言っていること」ではなく「別のUI」に見える。
 *
 * いまは重ねない。ポーと吹き出しを1つの部品（`po/PoSpeech.tsx`）に
 * まとめて、見出しの下へ置く。**別々に位置を決められる形にしない**のが
 * 肝心で、離れていたのは離せる形になっていたから。
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

import { PoSpeech } from "../../po/PoSpeech";
import { type PoSize } from "../../po/sizes";
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
  /**
   * ポーの大きさ（`po/sizes.ts`）。既定は `md`。
   *
   * 前は `compact` という真偽値で、しかも `StepShell` が
   * `compact={!eyebrow}` と渡していた——**小さな前置きが有るか無いか
   * という、ポーとは何の関係もない条件で背丈が 104px → 81px に
   * 変わっていた**。同じレッスンを進んでいるだけでポーが縮む。
   *
   * 段は役割で選ぶ。画面の都合で選ばない。
   */
  size?: PoSize;
  /**
   * ポーそのものを出すか。
   *
   * 出さないときは、絵も吹き出しも置かず、**空けてあった右の余白も
   * 返す**。居ないのに場所だけ空いていると、絵が読み込めていないように
   * 見える。誰の画面かは course/poPresence.ts が決める。
   */
  showPo?: boolean;
  /** ポーが出ている理由（course/poPresence.ts）。検査の手がかりに出す。 */
  scene?: string;
}

export function PoHero({
  eyebrow,
  title,
  description,
  message,
  emotion = "neutral",
  meta,
  size = "md",
  showPo = true,
  scene,
}: PoHeroProps) {
  return (
    <section className="pt-2" data-testid="po-hero" data-po-scene={scene}>
      {/*
        見出しの側。ポーとは**重ねない**。

        前はポーを絶対配置で右上に置き、見出しの側に幅ぶんの余白を
        空けて避けていた。そのぶん吹き出しは下の通常フローへ回るので、
        ポーと吹き出しが画面の対角に離れる（実測 138px）。
        重ねるのをやめて、ポーは吹き出しと一緒に下へ置く。
      */}
      <div>
        {eyebrow && <div className="mb-1">{eyebrow}</div>}

        {/*
          折り返しはブラウザ任せにする。

          break-keep を掛けると、句読点の無い日本語は切れる場所を失って
          **折り返さずに画面からはみ出す**（実際に診断の設問で起きた）。
          不自然な切れ方より、読めなくなるほうがずっと悪い。
        */}
        <h1 className="text-xl font-bold leading-[1.5] sm:text-2xl">{title}</h1>

        {description && (
          <p className="mt-2 text-sm leading-7 text-ink-muted">{description}</p>
        )}

        {meta && <div className="mt-3">{meta}</div>}
      </div>

      {/*
        ポーと、ポーの言葉。**ひとかたまり**（`po/PoSpeech.tsx`）。

        ここで別々に位置を決められないようにしてある。離れていたのは、
        別々に置ける形になっていたから。
      */}
      {showPo && (
        <div className="mt-4">
          <PoSpeech
            emotion={emotion}
            message={message}
            size={size}
            scene={scene}
          />
        </div>
      )}
    </section>
  );
}
