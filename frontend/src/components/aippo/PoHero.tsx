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
  /**
   * 見出しとポーを、左そろえにするか中央にするか。
   *
   * 既定は左。中央にするのは**祝う画面だけ**で、そこは下に続く
   * 中身（「AI技 GET」「技の名前」「説明」）も中央に並ぶ。
   * 決めるのは `course/poPresence.ts`——ここは受けるだけ。
   */
  align?: "start" | "center";
  /** ポーのまわりに紙とキラキラを散らすか。 */
  burst?: boolean;
  /**
   * 画面が低いとき、ポーを引っ込めるか。
   *
   * 何のためか
   * ----------
   * **ソフトキーボード。** iPhone で入力欄に触れると、見える高さが
   * 216〜302px 減る。320×568 では 352px しか残らず、柱の上（進み具合・
   * 見出し・ポー）で 231px を使っていたので、下の「次へ」が画面から
   * 28px はみ出していた（実測）。入力欄とボタンが同時に見えることは、
   * 書く画面でいちばん大事な条件（要件 §6.11）。
   *
   * 引っ込めるのはポーだけにする。見出しも説明も、そこで何を聞かれて
   * いるかそのものなので消さない。ポーは案内役で、**書いている最中に
   * いちばん要らない**もの。
   *
   * JS では見ない。高さの条件はCSSに任せる——キーボードは出たり入ったり
   * するので、描き直しを挟むと1拍遅れて跳ねる。
   */
  hideWhenShort?: boolean;
  /**
   * 引っ込める高さの境目（px）。既定は 560。
   *
   * 560 は**キーボードが出ている高さ**の目安で、書く画面のための数。
   * 読む画面（診断の結果）では事情が違う——キーボードは出ないが、
   * 中身のほうが多い。そこでは 700 を渡す。
   */
  hideBelow?: 560 | 700;
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
  align = "start",
  burst = false,
  hideWhenShort = false,
  hideBelow = 560,
}: PoHeroProps) {
  const centered = align === "center";

  return (
    <section
      className={`pt-2 ${centered ? "text-center" : ""}`}
      data-testid="po-hero"
      data-po-scene={scene}
      data-po-align={align}
    >
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
        <div
          /*
            クラスは**そのまま書く**。組み立てると Tailwind が拾えず、
            その指定だけが生成されない。
          */
          className={`mt-4 ${
            hideWhenShort
              ? hideBelow === 700
                ? "[@media(max-height:700px)]:hidden"
                : "[@media(max-height:560px)]:hidden"
              : ""
          }`}
          data-po-hide-when-short={hideWhenShort ? "yes" : undefined}
        >
          <PoSpeech
            emotion={emotion}
            message={message}
            size={size}
            scene={scene}
            side={centered ? "center" : "right"}
            burst={burst}
          />
        </div>
      )}
    </section>
  );
}
