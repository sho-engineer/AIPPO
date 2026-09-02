/**
 * ポーと、ポーの言葉。**必ずひとかたまりで置く。**
 *
 * 何が起きていたか
 * ----------------
 * `PoHero` は、ポーを絶対配置で右上に、吹き出しを見出しブロックの下の
 * 通常フローに置いていた。構造の上でつながっていないので、390px の
 * 画面で実測すると**いちばん近い角どうしで 138px 離れて**いた。
 * ポーは右上、吹き出しは左下——画面の対角にいる。
 *
 * その距離だと、吹き出しは「ポーが言っていること」ではなく
 * 「画面に置かれた別のUI」に見える。実際そう見えていた。
 *
 * 隣に置くだけでは足りない
 * ------------------------
 * しっぽを付ける。前は `rounded-tr-sm`（角の丸みを1つ小さくしただけ）
 * で代用していたが、あれは**しっぽではない**。誰が言っているのかを
 * 線で示すものが要る。
 *
 * 距離は「見えている体」から測る
 * ------------------------------
 * 絵の台紙には透明の余白が入っている。枠の縁から 12px 空けると、
 * 見えるポーからは 30px 以上空いてしまう。`PO_BOX` が持っている
 * 「絵が実際に写っている範囲」から、余白ぶんを引いて詰める。
 *
 * 目安は 8〜16px。ここでは 12px を狙う。
 *
 * 短い言葉しか渡さない
 * --------------------
 * ポーは先生ではなく、一緒に進む相手。長い説明は画面の本文が持つ。
 * ここに入るのは「どうだった？」「変わった！」くらいの長さ
 * （`course/poSpeech.ts` に文の一覧がある）。
 */

import { PoFace } from "./PoAvatar";
import { poInk, type PoSize } from "./sizes";
import type { PoEmotion } from "../course/types";

/** 見えている体から、しっぽの先までの距離。 */
const GAP = 12;

/**
 * 枠の縁から、見えている体の縁までの余白（px）。
 *
 * 出すのは `po/sizes.ts`。詰め方は Day 完了の画面も同じで、
 * 同じ割り算を2か所に書くと、絵を差し替えた日に片方だけが残る。
 */
function sidePadding(size: PoSize): number {
  return poInk(size).side;
}

/**
 * 枠の上端から、頭のてっぺんまでの余白（px）。
 *
 * 縦も横と同じ考え方で詰める。詰めないと、上の見出しとのあいだに
 * **絵の余白ぶんの空白**（`md` で 33px）が開き、ポーだけが1人で
 * 下がっているように見える。空けているつもりの余白と、実際に
 * 見える余白を一致させる。
 */
function topPadding(size: PoSize): number {
  return poInk(size).top;
}

export interface PoSpeechProps {
  emotion: PoEmotion;
  /** ひとこと。空なら吹き出しごと出さない（顔だけになる）。 */
  message?: string;
  size?: PoSize;
  /**
   * ポーを左右どちらに置くか。しっぽの向きは自動で決まる。
   *
   * 既定は右。日本語は左から読むので、読み終わった先にポーが居るほうが
   * 「言い終わった」感じになる。
   */
  side?: "left" | "right";
  /** 検査の手がかり。ポーが出ている理由（`course/poPresence.ts`）。 */
  scene?: string;
}

export function PoSpeech({
  emotion,
  message,
  size = "md",
  side = "right",
  scene,
}: PoSpeechProps) {
  const pad = sidePadding(size);

  /*
    しっぽ。小さな三角を1つ、吹き出しの角から出す。

    漫画のような大きなしっぽにはしない。線1本ぶんの手がかりで足りる。
    枠線と地色を分けて2枚重ねると縁が残るので、**回した正方形の
    2辺だけに枠線を引く**形にしてある。
  */
  const tail = (
    <span
      aria-hidden="true"
      data-testid="po-tail"
      className={`absolute bottom-3 h-2.5 w-2.5 rotate-45 border-line bg-surface
                  ${
                    side === "right"
                      ? "-right-[5px] border-r border-t"
                      : "-left-[5px] border-b border-l"
                  }`}
    />
  );

  const face = (
    <div
      data-testid="po-avatar"
      data-emotion={emotion}
      data-po-scene={scene}
      /*
        余白ぶんだけ内側へ詰める。

        枠には透明の余白が含まれているので、そのまま並べると
        見えるポーと吹き出しのあいだが余白ぶん開く。負の margin で
        その分を戻すと、**見えている体**が 12px の位置に来る。
      */
      style={side === "right" ? { marginLeft: -pad } : { marginRight: -pad }}
      className="pointer-events-none shrink-0"
    >
      <PoFace emotion={emotion} size={size} />
    </div>
  );

  if (!message) {
    return (
      <div
        style={{ marginTop: -topPadding(size) }}
        className="flex justify-end"
      >
        {face}
      </div>
    );
  }

  return (
    <div
      style={{ gap: GAP, marginTop: -topPadding(size) }}
      className={`flex items-end justify-end ${
        side === "right" ? "" : "flex-row-reverse"
      }`}
      data-testid="po-speech"
    >
      {/*
        吹き出しは**中身のぶんだけ**。幅いっぱいに広げない。

        「どうだった？」の5文字に画面の幅いっぱいの面を与えると、
        短い言葉が長い宣言のように見える。話し言葉は、話した長さの
        ぶんだけ場所を取るのが自然。
      */}
      <div className="relative min-w-0">
        <p
          className="rounded-panel border border-line bg-surface px-4 py-2.5
                     text-sm leading-6 shadow-card"
          data-testid="po-hero-message"
          // 言葉が変わったことを読み上げへ届ける（要件 §6.12）
          aria-live="polite"
        >
          {message}
        </p>
        {tail}
      </div>
      {face}
    </div>
  );
}

/** 検査が距離を測るときに使う。見えている体からしっぽまでの目安（px）。 */
export const PO_SPEECH_GAP = GAP;

/** 枠に含まれる左右の余白。E2E が期待値を出すのに使う。 */
export { sidePadding as poSidePadding };
