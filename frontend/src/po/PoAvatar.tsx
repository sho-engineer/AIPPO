/**
 * ポーの表示（要件 §5 / §6.7）。
 *
 * 動きの決まり:
 * - ふだんは3〜4秒周期の小さな上下だけ
 * - 状態が変わるときは短いフェード
 * - thinking のときだけアンテナが淡く光る
 * - celebrate は**一度だけ**跳ねる。跳ね続けると鬱陶しい
 * - prefers-reduced-motion では止める（index.css で一括）
 *
 * まばたきと口の動きは持たない
 * ----------------------------
 * 以前は 5〜8 秒ごとに `blink` へ、話しているあいだは 160ms ごとに
 * `talking` と `neutral` へ、**絵そのものを差し替えて**いた。
 * これをやめた。実機の録画を測ると、差し替わる瞬間だけ画面の変化量が
 * ふだんの浮き沈みの 10 倍あり、はっきり点滅として映っていた。
 *
 * 原因は8枚の**描かれ方が揃っていない**こと。台紙（512×512）に対する
 * 絵の大きさが状態ごとに違い（`PO_BOX`）、`poTransform` は背丈だけを
 * 合わせている。背丈が同じでも、体に対する頭の大きさが違うので、
 * 差し替えた瞬間に**別の体格の子**に入れ替わって見える。
 * 実測では blink は neutral より 17% 小さく描かれていて、背丈を
 * 合わせると頭がひとまわり大きくなる。
 *
 * 揃えるには絵を描き直すしかないが、ポーの絵は変えない決まりなので、
 * **動かすほうをやめる**。浮き沈みとフェードは CSS で作っていて、
 * 絵を差し替えないので、この問題を持たない。
 *
 * 画像が無いときは壊れた画像を出さず、丸いプレースホルダーへ倒す。
 *
 * ポー自身は押す対象ではない。画面に重ねる以上、
 * 下のボタンのタップを奪わないよう pointer-events を切る。
 */

import { useEffect, useState } from "react";

import { poFrameStyle, type PoSize } from "./sizes";
import type { PoEmotion, PoMessage } from "../course/types";
import {
  PO_ALT,
  PO_FALLBACK,
  PO_PLACEHOLDER,
  poAssets,
  poTransform,
} from "./assets";

export type PoAvatarProps = {
  po: PoMessage;
  /**
   * 大きさ。**幅は渡せない**（`po/sizes.ts`）。
   *
   * 既定は `sm`。この部品を使うのは一覧の行や画面の下の案内で、
   * どれも文字の隣に寄り添う場所。レッスンの中は `PoSpeech` が持つ。
   */
  size?: PoSize;
  isVisible?: boolean;
};

function PoImage({
  emotion,
  className,
  style,
}: {
  emotion: PoEmotion;
  className: string;
  /** 枠の一辺。`po/sizes.ts` が割り戻した実寸だけを受け取る。 */
  style?: { width: string };
}) {
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
        style={style}
        className={`flex aspect-square shrink-0 items-center justify-center
                    rounded-full text-sm font-bold ${tone} ${className}`}
      >
        {mark}
      </div>
    );
  }

  const shown = chain[attempt];

  return (
    /*
      枠を1枚かませる。

      8枚は台紙（512×512）こそ同じだが、**中の絵の大きさと位置が違う**。
      そのまま出すと、しゃべるたび・まばたきのたびにポーが縮んで跳ねる
      （talking は neutral の4分の3、warning は右へ寄っている）。

      絵は描き直さない。ここで neutral の位置と大きさへ合わせる。
      枠の大きさは呼び出し側が決め、中の絵はいつも同じ場所に立つ。
    */
    /*
      枠は必ず正方形にする。

      中の絵を absolute で敷くので、枠自身に高さの手がかりが無くなる。
      呼び出し側が `w-full` のように幅だけ渡すと、高さが 0 になって
      ポーが消える（実際に消えた）。台紙が 512×512 の正方形なので、
      枠も正方形と決めておけば、幅だけ渡せば形が決まる。
    */
    <span
      style={style}
      className={`relative block aspect-square shrink-0 overflow-hidden ${className}`}
      data-po-frame={shown}
    >
      <img
        /*
          目印は**代わりの絵へ移った回数**にする。表情そのものにしない。

          表情を目印にすると、まばたきや口の動きのたびに
          React がこの `<img>` を捨てて作り直す。作り直した直後の
          `<img>` は**まだ何も描かれていない**ので、絵が一瞬消える。

          ホームのポーは「話している」状態で、口は 160ms ごとに
          入れ替わる。つまり 1.6 秒のあいだに 10 回作り直され、
          そのたびに絵が消えていた——**画面ではチカチカ光って見える**。
          まばたきのほうは 5〜8 秒ごとに、ずっと続く。

          目印を `attempt` にすると、表情が変わっても同じ `<img>` の
          `src` が差し替わるだけになる。ブラウザは次の絵を描けるまで
          前の絵を出したままにするので、途切れない。

          代わりの絵へ移るときは `attempt` が変わるので、
          これまでどおり読み直される（そこが元の狙いだった）。
        */
        key={attempt}
        src={poAssets[shown]}
        alt={PO_ALT}
        data-testid="po-image"
        onError={() => setAttempt((current) => current + 1)}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ transform: poTransform(shown), transformOrigin: "center" }}
      />
    </span>
  );
}

/**
 * ポーの顔だけ。吹き出しは付けない。
 *
 * 画面の上のほうで大きく出すとき（ホーム、レッスンの導入、完了）は、
 * 吹き出しの位置が画面ごとに違う。顔と吹き出しを1つの部品に固めると、
 * 並べ方を変えるたびにこの中を触ることになる。
 *
 * 動きは浮き沈みだけ。**絵は差し替えない**（この画面の冒頭を参照）。
 */
export function PoFace({
  emotion,
  size = "md",
  animate = true,
}: {
  emotion: PoEmotion;
  /**
   * 大きさ。**幅は渡せない**（`po/sizes.ts`）。
   *
   * 前は `className` で幅を渡していたので、画面ごとに違う数が入り、
   * コース一覧の 35px からレッスンの 104px まで3倍の開きがあった。
   * 渡せる口を消すのがいちばん確実な直し方。
   */
  size?: PoSize;
  animate?: boolean;
}) {
  const motion = !animate
    ? ""
    : emotion === "celebrate"
      ? "animate-pop-in"
      : "animate-float";

  return (
    <PoImage
      emotion={emotion}
      style={poFrameStyle(size)}
      className={`transition-opacity duration-200 ${motion}`}
    />
  );
}

export function PoAvatar({ po, size = "sm", isVisible = true }: PoAvatarProps) {
  if (!isVisible) return null;

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
        {/*
          高さは切り詰めない。**短い文しか渡さない**のが決まりなので
          （`poSpeech.ts`）、はみ出したら切るのではなく、文のほうを直す。
        */}
        <p className="text-sm leading-6">{po.message}</p>
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
          emotion={po.emotion}
          style={poFrameStyle(size)}
          className={`transition-opacity duration-200 ${
            po.emotion === "celebrate" ? "animate-pop-in" : "animate-float"
          }`}
        />
      </div>
    </aside>
  );
}
