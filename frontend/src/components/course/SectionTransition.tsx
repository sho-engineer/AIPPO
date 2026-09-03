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
 *
 * 余白は、絵そのもので埋める
 * ------------------------
 * 絵は縦長（941×1672）で、横長の画面では**高さで頭打ち**になる。
 * 402px 幅の実機で絵に使えるのは 295px しかなく、残りは左右の余白
 * ——白い地の上に絵の四角い縁が浮いて見えていた。
 *
 * 絵を大きくしても消えない（高さを目一杯にしても 347px）。切って
 * 広げる（`object-cover`）と、絵の中の題が切れる。
 *
 * **同じ絵を、ぼかして背面に敷く。**
 *
 * 一度は「絵の端の色を測って、その色で地を塗る」ようにした。上下の
 * 2色から縦グラデーションを作る形で、遠目には合うが**まだ縦の線が
 * 見えた**——絵の地は横にも濃淡があり、行の平均では左右の端と
 * ずれるため。測った色を教材データへ書く形でもあり、絵を差し替える
 * たびに測り直しが要る（忘れれば縁がまた出る）。
 *
 * 同じ絵を敷けば、**どの高さでも必ず合う**。測る値も、覚えておく
 * 値も無い。読み込むのは同じ道筋なので、通信も1回のまま。
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
      /*
        幅は端末1台ぶんに収める（`max-w-cover`）。

        絵は縦長なので、広い画面では余白のほうが絵より大きくなる
        ——1280px では絵が 335px、左右に 472px ずつ空く。そこまで
        離れると、背面をどう伸ばしても横の位置が合わない（実測で
        境目の色が 84 飛んだ）。

        ほかの画面（`max-w-page` ＝ 46rem）より狭いのは、ここだけ
        **絵が画面そのもの**だから。文字を読ませる画面と同じ幅を
        取っても、絵はその幅まで大きくならない。
      */
      className="relative mx-auto flex w-full max-w-cover
                 h-[calc(100dvh-2.75rem-env(safe-area-inset-top))]
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
        /*
          左右に余白を付けない。**絵に使える幅をそのまま渡す。**
          地が絵と同じ色になったので、縁で区切る必要が無くなった。
        */
        className="relative min-h-0 w-full flex-1 cursor-pointer"
      >
        {/*
          余白を埋める1枚。**同じ絵を、横に伸ばして、ぼかす。**

          敷くのは**前面の絵とまったく同じ箱**（このタップ面）。
          前面は `object-contain` で縦いっぱいに入るので、背面も
          同じ箱に広げれば、同じ高さに同じ色が来る。

          一度これを外側（`section`）へ置いていた。あちらは下の
          ボタンの行まで含む箱なので、**縦の対応がずれる**——境目の
          色が上で 62 飛んだ（下の e2e が捕まえた）。

          少しはみ出させる（`scale`）のは、ぼかしの縁が画面の中に
          出ないようにするため。横を大きく伸ばすのは、狭い画面でも
          左右の余白を埋めきるため。

          **境目の色はぴったりには合わない。** 横に伸ばすと、境目の
          位置には絵の 25% あたりの色が来るので、前面の左端（0%）とは
          違う（実測で 28 の差）。合わせようとすると背面を前面と同じ
          大きさにするしかなく、それでは余白が埋まらない。

          ここで消したいのは**硬い縁**のほうで、色の一致ではない。
          ぼかしてあるので縁は無く、余白は絵と地続きに見える。

          読み上げには渡さない（`aria-hidden`）——同じ絵が2回読まれる。
        */}
        {image && (
          <img
            src={image.src}
            alt=""
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 h-full w-full
                        scale-x-150 scale-y-110 blur-2xl
                        transition-opacity duration-300
                        ${shown ? "opacity-100" : "opacity-0"}`}
          />
        )}

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
            className={`relative mx-auto h-full w-auto max-w-full object-contain
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

      <div className="relative mx-auto mt-3 w-full max-w-page shrink-0 px-5">
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
