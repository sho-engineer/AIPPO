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
 *   - 「つづける」も**絵の中**へ重ねる。下に別の行を作ると
 *     「絵」＋「別ブロックのボタン」に分かれて見える
 *
 * スクロールしない
 * ----------------
 * 1枚を見て次へ行くだけの画面で、送る先が無い。`100dvh` から
 * 上下の安全領域を引いた高さに絵を収め、`object-contain` で
 * 切らずに入れる（絵の中の文字が切れると、章の名前が読めなくなる）。
 *
 * 余白を作らない。はみ出すぶんを切る
 * ----------------------------------
 * 絵は 941×1672（比 0.563）で、画面より**ずっと縦長**。画面の比は
 * 0.46〜0.61 あたりなので、比の差は**切るか、余白か**のどちらかでしか
 * 埋まらない。余白を選ぶと、絵の四角い縁が地から浮いて見える。
 *
 * ここは切るほうを選ぶ（`object-cover`）。章扉は**絵が画面そのもの**で、
 * 端まで届いていないと1枚に見えない。
 *
 * 切ってよい量は、絵が持っている余白まで。4枚を測るとこうなっている。
 *
 *     濃い要素（題・ロゴ・カード）までの余白
 *     上 5.4% / 下 5.7% / 左 5.1% / 右 4.6%   ← 4枚の最小
 *
 * 左右は寄せようがない（切る量は画面の比だけで決まる）。細長い持ち方
 * （402×874）では 7.0% 切るので、**章②と章④は題の端が欠ける**。
 * 端まで敷くことと引き換えになっている——直すなら絵の側に横の余白を
 * 足すしかない。
 *
 * だから**上下の帯も余白も置かない**。置いた分だけ箱が縦に縮み、
 * そのぶん切る量が増える（`pt-2` と下の余白で、いちばん低い持ち方の
 * 切り取りが 3.8% → 6.9% に増えていた）。下の安全領域はボタンの側で避ける。
 *
 * 一度は「同じ絵をぼかして背面に敷き、余白を埋める」形にした。縁は
 * 目立たなくなるが、**余白があること自体は変わらない**。
 */

import { useEffect, useState } from "react";

import { playSound } from "../../course/sound";
import { IconChevronRight } from "../Icons";

/**
 * 「つづける」の大きさと見た目。**4章ぶん、ここだけで決める。**
 *
 * 章ごとに書くと、絵に合わせて少しずつ動かしたくなり、通したときに
 * ボタンが章ごとに跳ねる。決めるのは1か所にする。
 *
 * なぜ `PrimaryButton` を使わないか
 * ---------------------------------
 * あちらは「支給デザインの、下端に幅いっぱいの青いボタン」で、
 * `w-full` / `min-h-3.5rem` / 不透明の `bg-brand` / `shadow-cta` が
 * 骨に入っている。ここで要るのは**そのどれでもない**——絵の上に
 * 小さく、すこし透けて浮くもの。`className` で上書きしようとすると
 * `w-full` と `w-[78%]`、`min-h-[3.5rem]` と `h-12` のように**同じ性質
 * どうしがぶつかり**、どちらが勝つかは生成されたCSSの並び順で決まる。
 * 見た目が並び順に左右される作りにはしない。
 *
 * 押した音と、押したときの縮みは同じものを使う（画面が変わっても
 * 「押した」の手応えは変えない）。
 */
const CTA = {
  /*
    絵の幅の 78%。

    前は 90%（`inset-x-5`）で、端から端まで伸びた青い帯になっていた。
    章扉の主役は絵なので、**ボタンは絵の中の一部品**に見える幅で止める。
  */
  width: "w-[78%]",

  /*
    48px。指で押す最小の 44px より大きく、`PrimaryButton` の 56px より
    小さい。8px 低くしたぶん、上端が絵の 1.1% ぶん下がる。
  */
  height: "h-12",

  /*
    下から 16px（＋安全領域）。

    4枚を測ると、Po の足と主モチーフは**絵の 88〜90% まで下りている**。
    高さ48・下16 にすると CTA は 90.6%〜97.6% に入り、覆うのは
    雲と影だけになる（覆う面積は 9.2/7.4/10.4/10.4% → 5.8/6.3/0.6/8.4%）。
    これ以上は下げない——iPhone のホームバーに近づく。
  */
  bottom: "bottom-[calc(1rem+env(safe-area-inset-bottom))]",

  /*
    すこし透ける青。**絵の上に浮いている**ところまで。

    透かす色に `brand`（#1268E8）を使うと、白地の上で白文字との差が
    4.27 まで落ちる（4.5 を割る）。一段濃い `brand-dark` なら 4.88 で
    残るので、そちらを 90% で敷く。背景でいちばん明るいのは Po の
    白い体なので、白地が最悪の場合。

    後ろは軽くぼかす（8px）。ガラスに見せるためではなく、絵の細かい
    模様がボタンの文字に重なって見えるのを止めるため。影は `raised`
    ——いちばん弱いもの。強い影を付けると、また絵より前に出る。
  */
  look: `rounded-cta border border-white/25 bg-brand-dark/90 shadow-raised
         backdrop-blur-[8px]`,
} as const;

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
        スマホでは画面の幅いっぱい。**絞らない。**

        広い画面（`sm` 以上）だけ、端末1台ぶんに絞る。絞らないと、
        1280px の画面では絵を横に合わせるために縦を大きく切ることに
        なり、題が消える。`max-w-cover`（24rem）は、ふつうの卓上の
        高さでちょうど絵の比になる幅。

        上下に余白を置かない。置いた分だけ箱が縦に縮み、そのぶん
        切る量が増える。下の安全領域はボタンの側で避けている。
      */
      className="relative mx-auto flex h-[calc(100dvh-2.75rem-env(safe-area-inset-top))]
                 w-full flex-col overflow-hidden bg-canvas sm:max-w-cover"
    >
      {/*
        絵と、その上に重なる「つづける」。**1枚の章扉として見せる。**

        絵は箱いっぱいに敷き、はみ出すぶんを切る。上下に帯も余白も
        置かない——置くと箱が縮み、そのぶん切る量が増える。
      */}
      <div className="relative min-h-0 w-full flex-1">
        {image && (
          <img
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
            onLoad={() => setShown(true)}
            /*
              端まで届かせる。`contain` に戻すと切れなくなるが、
              そのかわり左右か上下に余白が出て、絵の四角い縁が見える。

              切る位置を**下寄りにする**（`object-position`）。
              まん中から切ると、いちばん低い持ち方（402×660）で上下を
              6.9% ずつ落とすことになり、**AIPPO のロゴの上が切れた**。

              下は「つづける」が覆っている場所なので、多く切ってよい。
              上下の差を 1:3 にすると、上は 3.5% で止まる——4枚のうち
              いちばん余白の少ない章（上 5.4%）でも題に届かない。
            */
            style={{ objectPosition: "center 25%" }}
            className={`absolute inset-0 h-full w-full object-cover
                        transition-opacity duration-300
                        ${shown ? "opacity-100" : "opacity-0"}`}
          />
        )}

        {/*
          画面のどこを押しても進む。

          親指はふつう画面の下半分にある。ボタンまで運ばせずに済む
          ——ボタンは「押せる場所がどこか」を示す役目で残す
          （絵だけだと、押せることが分からない）。

          **ボタンの親にはしない。** 押せるものを押せるものの中へ
          入れると、読み上げもキーボードも行き先を決められなくなる
          （`nested-interactive`）。同じ面に並べて敷く。
        */}
        <button
          type="button"
          onClick={onContinue}
          data-testid="section-transition-tap"
          aria-label={`${title}（画面を押してつづける）`}
          className="absolute inset-0 h-full w-full cursor-pointer"
        />

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
              : "pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-2xl font-bold leading-relaxed"
          }
        >
          {title}
        </h1>

        {/*
          「つづける」。**絵の下部中央へ、小さく重ねる。**

          下端ぎりぎりには置かない。絵の縁に貼り付くと画面の端から
          生えているように見えるうえ、iPhone のホームバーと近づく
          ——安全領域はここで避ける（外側に余白を置くと、そのぶん
          絵が縮んで切る量が増えるため）。

          目印は `primary-action`——ほかの画面と同じ名前にする。
          この画面だけ `StepShell` の外にあるが、押す先が1つで、
          押せば次へ進む点はどこも同じ。別の名前を付けると、
          レッスンを頭から通す仕組みが章扉のところだけ止まる。
        */}
        <div className={`absolute inset-x-0 flex justify-center ${CTA.bottom}`}>
          <button
            type="button"
            onClick={() => {
              playSound("tap");
              onContinue();
            }}
            data-testid="primary-action"
            className={`flex items-center justify-center gap-2 px-6
                        text-base font-bold text-white transition
                        active:scale-[0.98]
                        ${CTA.width} ${CTA.height} ${CTA.look}`}
          >
            {/* 折り返さない。2行になると高さが変わって、章ごとに跳ねる */}
            <span className="whitespace-nowrap">{label}</span>
            {/*
              右に山を添える。**行き先を表す印**で、押すと先へ進む
              ことを言っている。控えめにする——ここで見せたいのは
              文字のほうで、印はその添え物。読み上げには渡さない
              （文字が「つづける」と、同じことを言っている）。
            */}
            <IconChevronRight
              className="h-3.5 w-3.5 shrink-0 opacity-80"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </section>
  );
}
