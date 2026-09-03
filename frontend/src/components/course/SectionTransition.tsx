/**
 * 章扉。
 *
 * なぜ要るか
 * ----------
 * レッスンは4つの段に分かれている（試す → 相手を決める → 言い方を
 * 変える → 自分で使う）。段が変わったことは、これまで進み具合の細い帯
 * にしか出ていなかった。帯は1本の線なので、**変わったことには気づけても、
 * 何に変わったのかは言っていない**。押した次の瞬間に別の話が始まる
 * ——「気づいたら次の学習画面にいる」状態だった。
 *
 * ここで一度、息を継がせる。出すのは1枚の絵と「つづける」だけ。
 *
 * ほかの画面と作りを変えている
 * ----------------------------
 * 教材の画面は `StepShell`（進み具合・見出し・ポー・下の帯）で揃えて
 * あるが、ここはその枠に入れない。
 *
 *   - **絵が画面そのもの。** 上に教材カードを重ねない。題も副題も
 *     絵の中に焼き込まれているので、外側に文を足すと同じことを2回言う
 *   - 進み具合も見出しも出さない。**まだ何も始まっていない**
 *   - ポーは絵の中にいる。外にもう1匹出すと2匹並ぶ
 *
 * スクロールしない
 * ----------------
 * 1枚を見て次へ行くだけの画面で、送る先が無い。`100dvh` から
 * 上下の安全領域を引いた高さに絵を収め、`object-contain` で
 * 切らずに入れる（絵の中の文字が切れると、章の名前が読めなくなる）。
 */

import { useEffect, useState } from "react";

import { PrimaryButton } from "../aippo/PrimaryButton";

/**
 * 章扉の絵。
 *
 * 教材データ（`catalog.ts` の `sections`）が持っているものを、
 * そのまま受け取る。**画面側から別の表を引きに行かない**——引きに
 * 行く形だと、章扉を足したのに絵の表へ書き忘れた日に、絵の無い
 * 章扉が黙って出る。
 */
export interface SectionImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface SectionTransitionProps {
  /** 章の名前。絵が出ないときの見出しであり、読み上げの見出しでもある。 */
  title: string;
  image: SectionImage | null;
  onContinue: () => void;
  /** 下のボタンの文言。既定は「つづける」。 */
  label?: string;
}

export function SectionTransition({
  title,
  image,
  onContinue,
  label = "つづける",
}: SectionTransitionProps) {
  /*
    絵が届くまで、押しても進めないようにはしない。

    通信が遅い日でも、押したい人は押せるほうがよい。ただし
    **絵が出る前に押せてしまうと、章扉を見ないまま通り過ぎる**ので、
    出るまでは静かに待つ（`opacity`）。届かなければ題が代わりに出る。
  */
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(false), [image?.src]);

  return (
    /*
      画面まるごと1枚。**上の帯と、下の安全領域を避ける。**

      高さは `StepShell` と同じ式にする（`100dvh` から帯 2.75rem と
      上の安全領域を引く）。`100dvh` のままにすると、帯の**下**に
      画面まるごとの高さを置くことになり、中身が何も無くても
      帯のぶんだけ必ずはみ出す（実測でちょうど 44px 送れた）。

      iPhone の Safari は下にホームバーがあるので、そちらは padding で避ける。
    */
    <section
      data-testid="section-transition"
      aria-labelledby="section-transition-title"
      className="flex h-[calc(100dvh-2.75rem-env(safe-area-inset-top))] w-full
                 flex-col overflow-hidden bg-canvas pt-2
                 pb-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      {/*
        画面全体を押しても進める。

        親指はふつう画面の下半分にあり、そこには絵しかない。
        下のボタンまで運ばせずに済む——ボタンは「押せる場所が
        どこか」を示す役目で残す（絵だけだと、押せることが分からない）。

        `button` にしているので、キーボードでも読み上げでも届く。
      */}
      <button
        type="button"
        onClick={onContinue}
        data-testid="section-transition-tap"
        aria-label={`${title}（画面を押してつづける）`}
        className="min-h-0 flex-1 cursor-pointer px-4"
      >
        {image ? (
          <img
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
            onLoad={() => setShown(true)}
            /*
              切らずに収める。`object-cover` にすると、いちばん狭い
              持ち方で上下の帯（題と足元）が切れて、**章の名前が
              読めない**まま通り過ぎることになる。
            */
            className={`mx-auto h-full w-auto max-w-full object-contain
                        transition-opacity duration-300
                        ${shown ? "opacity-100" : "opacity-0"}`}
          />
        ) : null}

        {/*
          絵が出ないときの受け皿。

          読み上げにはいつもここが読まれる（絵の `alt` は絵の説明で、
          章の名前ではない）。見た目には、絵が出ていれば隠れる。
        */}
        <h1
          id="section-transition-title"
          className={
            image && shown
              ? "sr-only"
              : "flex h-full items-center justify-center text-center text-2xl font-bold leading-relaxed"
          }
        >
          {title}
        </h1>
      </button>

      <div className="mx-auto mt-3 w-full max-w-page shrink-0 px-5">
        {/*
          目印は `primary-action`。**ほかの画面と同じ名前にする。**

          この画面だけ `StepShell` の外にあるが、押す先が1つで、
          押せば次へ進むという点はどこも同じ。別の名前を付けると、
          レッスンを頭から通す仕組み（検査・読み上げの手順・
          機械での見回り）が、章扉のところだけ止まる。
        */}
        <PrimaryButton onClick={onContinue} testId="primary-action">
          {label}
        </PrimaryButton>
      </div>
    </section>
  );
}
