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

import { prefersReducedMotion } from "../course/motion";
import { poFrameStyle, type PoSize } from "./sizes";
import type { PoEmotion, PoMessage } from "../course/types";
import {
  PO_ALT,
  PO_FALLBACK,
  PO_PLACEHOLDER,
  poAssets,
  poTransform,
} from "./assets";

/** まばたきの間隔。5〜8秒でばらつかせる（等間隔だと機械に見える）。 */
const BLINK_MIN_MS = 5000;
const BLINK_MAX_MS = 8000;
const BLINK_DURATION_MS = 140;

/** 口の開け閉め。速すぎると点滅に見え、遅いと呼吸のように見える。 */
const MOUTH_MS = 160;

/**
 * 動きに使う絵を、先に読み込んでおく。
 *
 * まばたきも口の動きも、**別のファイルへ差し替える**やり方で作って
 * ある。差し替えた先がまだ読み込まれていないと、そこだけ絵が出るのが
 * 一拍遅れる——動きの途中で1コマ抜けるので、目には瞬きではなく
 * ちらつきとして映る。
 *
 * ふだんの絵（neutral）は最初から画面に出ているので放っておいても
 * 読み込まれる。問題は blink と talking で、**出るのは一瞬だけ**。
 * 出る直前に取りに行く形だと、間に合わない回が必ず残る。
 *
 * 1回だけ。読み込んだ絵はブラウザが持っているので、
 * 2枚目以降のポーは何もしなくてよい。
 */
let warmed = false;
function warmFrames(): void {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  for (const emotion of ["blink", "talking", "neutral"] as PoEmotion[]) {
    const image = new Image();
    image.src = poAssets[emotion];
  }
}

/**
 * しゃべって見せる時間。
 *
 * 話し続けさせない。吹き出しの文は数秒で読み終わるのに、口だけ
 * 動き続けると、まだ何か言っているのかと待たせることになる。
 */
const TALKING_MS = 1600;

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

function useBlink(emotion: PoEmotion): boolean {
  const [blinking, setBlinking] = useState(false);
  const timer = useRef<number>();

  // 動きに使う絵を先に取っておく。最初の1回だけ働く
  useEffect(() => warmFrames(), []);

  useEffect(() => {
    /*
      考えている間・喜んでいる間はまばたきさせない。
      表情の意味が伝わらなくなる。

      動きを減らす設定のときも止める。**CSS では止められない**——
      まばたきは絵そのものを差し替える作りなので、`index.css` の
      一括指定が効かない。口の動き（`useTalking`）は自分で見ている
      のに、こちらだけ見ていなかった。
    */
    if (
      emotion === "thinking" ||
      emotion === "celebrate" ||
      prefersReducedMotion()
    ) {
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

/**
 * しゃべっている口の動き。
 *
 * 「話している」用の絵は1枚しか無いので、ふだんの絵と交互に出して
 * 口が動いているように見せる。2枚の違いはほぼ口だけなので、
 * 速く入れ替えると開け閉めに見える。
 *
 * 動きを減らす設定のときは入れ替えない。文字は吹き出しに出ているので、
 * 口が動かなくても伝わるものは何も減らない。
 */
function useTalking(emotion: PoEmotion, message: string): boolean {
  /*
    返すのは「口を閉じているか」。**開いているか**ではない。

    開いているかを返すと、初期状態が false（＝閉じ）になり、
    最初の1枚が「話している」用の絵ではなくなる。絵の探し直し
    （PO_FALLBACK）はその1枚目を起点にするので、起点がずれると
    別の絵へ寄ってしまう。話し始めは口が開いている、が自然でもある。
  */
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (emotion !== "talking" || prefersReducedMotion()) {
      setClosed(false);
      return;
    }

    let shut = false;
    const timer = window.setInterval(() => {
      shut = !shut;
      setClosed(shut);
    }, MOUTH_MS);

    // 話し終わったら開いた絵に戻す。閉じたまま止めない
    const stop = window.setTimeout(() => {
      window.clearInterval(timer);
      setClosed(false);
    }, TALKING_MS);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
      setClosed(false);
    };
    // 文が変わるたびに、もう一度しゃべる
  }, [emotion, message]);

  return closed;
}

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
 * まばたきと口の動きはここが持つ。置き場所が変わっても、
 * 生きている感じは同じであってほしい。
 */
export function PoFace({
  emotion,
  message,
  size = "md",
  animate = true,
}: {
  emotion: PoEmotion;
  /** しゃべっている風に口を動かす手がかり。変わるたびに動き直す。 */
  message?: string;
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
  const blinking = useBlink(emotion);
  const mouthClosed = useTalking(emotion, message ?? "");

  const shown: PoEmotion = blinking
    ? "blink"
    : emotion === "talking" && mouthClosed
      ? "neutral"
      : emotion;

  const motion = !animate
    ? ""
    : emotion === "celebrate"
      ? "animate-pop-in"
      : "animate-float";

  return (
    <PoImage
      emotion={shown}
      style={poFrameStyle(size)}
      className={`transition-opacity duration-200 ${motion}`}
    />
  );
}

export function PoAvatar({ po, size = "sm", isVisible = true }: PoAvatarProps) {
  const blinking = useBlink(po.emotion);
  const mouthClosed = useTalking(po.emotion, po.message);
  if (!isVisible) return null;

  /*
    出す絵の決め方。まばたきが最優先（一瞬だけ）、次に口の動き。
    しゃべっている間は、ふだんの絵と交互に出して口を動かして見せる。
  */
  const shown: PoEmotion = blinking
    ? "blink"
    : po.emotion === "talking" && mouthClosed
      ? "neutral"
      : po.emotion;

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
          emotion={shown}
          style={poFrameStyle(size)}
          className={`transition-opacity duration-200 ${
            po.emotion === "celebrate" ? "animate-pop-in" : "animate-float"
          }`}
        />
      </div>
    </aside>
  );
}
