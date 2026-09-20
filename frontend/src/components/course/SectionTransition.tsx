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
 *     上 4.7% / 下 18.2% / 左 3.9% / 右 4.7%   ← 4枚の最小
 *
 * 下が広いのは、**「つづける」を置く場所として絵の側に空けてある**から
 * （前の絵は 5.7% しかなく、ボタンがポーの足に食い込んでいた）。
 *
 * 左右は寄せようがない（切る量は画面の比だけで決まる）。細長い持ち方
 * （402×874）では 7.0% 切るので、**章②は題の端が欠ける**（左 3.9%）。
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
import { isImageReady, preloadImage } from "../../lib/preloadImage";
import { IconChevronRight } from "../Icons";

/**
 * 絵が来ないとき、題を出すまでの待ち。
 *
 * ふつうの回線ではここへ来る前に出るので、題は出ない。出るのは
 * 本当に遅いときだけ——そこで何も言わずに面だけ出していると、
 * 止まっているのか読み込み中なのか分からなくなる。
 */
const SLOW_IMAGE_MS = 600;

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

    絵の側が、下に 18〜29% の雲を空けてくれている。高さ48・下16 だと
    CTA は絵の 89.2%〜96.1%（393×727）に入り、**Po にも主モチーフにも
    かからない**——4枚とも覆う面積は 0.0%。いちばん低い持ち方
    （402×660）でだけ 0.2%（章①）と 0.8%（章③）が残る。

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
  /** 何章目か。絵が無いときだけ、小さく出す。 */
  number?: number;
  /** 章の短い名前（「短くする」など）。絵が無いときだけ出す。 */
  sectionLabel?: string;
}

/**
 * 絵を持たない章扉。
 *
 * なぜ別に書くか
 * --------------
 * 絵のある章扉は「絵が画面そのもの」で、見出しもボタンも絵の上へ
 * 重ねる。その置き方のまま絵だけを外すと、**受け皿の見出しが画面
 * 全面に広がり、下から重ねたボタンと重なる**——Day2 の章扉4枚で
 * 実際にそうなっていた（見出しと「つづける」が 32px 重なる。
 * `e2e/_audit.spec.ts`）。
 *
 * 絵が無いなら、重ねる相手も無い。ふつうに縦へ並べる。
 *
 * 絵を待たない
 * ------------
 * 章扉は**段の変わり目を知らせるだけ**の画面で、絵はそれを助ける
 * もの。無い日に空白を出すより、名前で伝えるほうが速い。
 */
function PlainDoor({
  title,
  number,
  sectionLabel,
  label,
  onContinue,
}: {
  title: string;
  number?: number;
  sectionLabel?: string;
  label: string;
  onContinue: () => void;
}) {
  return (
    <section
      data-testid="section-transition"
      data-door="plain"
      aria-labelledby="section-transition-title"
      className="mx-auto flex h-[calc(100dvh-2.75rem-env(safe-area-inset-top))] w-full
                 max-w-page flex-col px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"
    >
      {/*
        名前だけ。**説明を足さない。**

        ここで言うことは1つ——「次の段に入る」。段の中身は次の画面から
        始まるので、ここで先に説明すると同じことを2回言うことになる。
      */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
        {(number || sectionLabel) && (
          <p
            className="text-xs font-bold leading-5 text-brand"
            data-testid="section-eyebrow"
          >
            {number ? `Section ${number}` : null}
            {number && sectionLabel ? "　" : null}
            {sectionLabel}
          </p>
        )}
        <h1
          id="section-transition-title"
          className="mt-2 text-2xl font-bold leading-relaxed"
        >
          {title}
        </h1>
      </div>

      <div className="shrink-0">
        <button
          type="button"
          onClick={() => {
            playSound("tap");
            onContinue();
          }}
          data-testid="primary-action"
          className={`mx-auto flex items-center justify-center gap-2 px-6
                      text-base font-bold text-white transition active:scale-[0.98]
                      ${CTA.width} ${CTA.height} ${CTA.look}`}
        >
          <span className="whitespace-nowrap">{label}</span>
          <IconChevronRight
            className="h-3.5 w-3.5 shrink-0 opacity-80"
            aria-hidden="true"
          />
        </button>
      </div>
    </section>
  );
}

export function SectionTransition({
  title,
  image,
  onContinue,
  label = "つづける",
  number,
  sectionLabel,
}: SectionTransitionProps) {
  /*
    絵が届くまで、押しても進めないようにはしない。

    通信が遅い日でも、押したい人は押せるほうがよい。ただし
    **絵が出る前に押せてしまうと、章扉を見ないまま通り過ぎる**ので、
    出るまでは静かに待つ（`opacity`）。届かなければ題が代わりに出る。
  */
  /*
    もう画に起こしてある絵なら、**最初の描画から出ている。**

    ここを常に `false` から始めていたころ、2回目に同じ章扉を開いても
    いったん受け皿が出てから絵へ入れ替わっていた。キャッシュには
    載っているので、待つ理由が無い。
  */
  const [shown, setShown] = useState(() => isImageReady(image?.src));
  useEffect(() => setShown(isImageReady(image?.src)), [image?.src]);

  /*
    題を出すのは、**待っても来ないとき**だけ。

    前はここに条件が無く、絵が出るまでずっと題が画面いっぱいに出ていた
    ——実機では「文字の画面 → 絵の画面」と別の画面が一瞬見えたように
    感じる（録画で指摘されたのがこれ）。

    かといって、出さないままにはできない。取れない回線で題が無いと、
    どの章に居るのか分からなくなる。**ふつうの速さでは出ない・
    本当に遅いときだけ出る**の両方を満たすために、少し待ってから出す。
  */
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (isImageReady(image?.src)) return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_IMAGE_MS);
    return () => window.clearTimeout(timer);
  }, [image?.src]);

  /* 次に開いたときのために、画に起こし終わったことを覚えておく */
  useEffect(() => {
    void preloadImage(image?.src);
  }, [image?.src]);

  /* 絵を持たない章は、重ねない置き方にする */
  if (!image) {
    return (
      <PlainDoor
        title={title}
        number={number}
        sectionLabel={sectionLabel}
        label={label}
        onContinue={onContinue}
      />
    );
  }

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
        {/*
          絵が来るまでの受け皿。**文字ではなく、面で待つ。**

          真っ白でも、題の大文字でもない。章扉と同じ大きさの淡い面を
          置いておけば、「この場所に何か出る」ことだけが伝わり、
          出たときに**入れ替わったように見えない**（地の色が近い）。

          新しく「読み込み中」の画面を足したわけではない。ここはもとから
          章扉の居る場所で、絵が入るまでのあいだ同じ枠が空いているだけ。
        */}
        {!shown && (
          <div
            aria-hidden="true"
            data-testid="section-intro-placeholder"
            className="absolute inset-0 bg-brand-soft"
          />
        )}
        {/*
          出るときだけ、短く動かす層。**ここに入れるのは絵だけ。**

          段が変わったことを伝えるための 0.3 秒（`animate-section-intro`
          ——8px 上へ、薄いところから）。絵の中の要素を1つずつ動かす
          ことはしない。ポーも星も音符も絵に焼き込まれているので、
          **1枚をまとめて出す**のがいちばん静かで、いちばん速い。

          押せるものは、この中に入れない
          ------------------------------
          「つづける」と、画面ぜんぶを覆うタップ層は外の兄弟にしてある。
          中へ入れると押せるものが 8px 動きながら出てくることになり、
          出た瞬間に押した指が空振りする。**下のボタンは最初から
          所定の位置**に居て、動かない。

          `absolute inset-0` で敷く。箱の高さは flex が決めているので、
          絵の読み込みで高さは動かない（`transform` を持つので新しい
          基準面になるが、中身は絵と受け皿の見出しだけ）。
        */}
        <div
          className="absolute inset-0 animate-section-intro"
          data-testid="section-intro-content"
        >
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
            絵が出ないときの受け皿。

            読み上げにはいつもここが読まれる（絵の `alt` は絵の説明で、
            章の名前ではない）。見た目には、絵が出ていれば隠れる。
          */}
          <h1
            id="section-transition-title"
            /*
              絵が届くまでの受け皿。**「つづける」の場所は空けておく。**

              `inset-0` で敷いていたころ、絵が来ない回線ではこの見出しが
              画面いっぱいに広がり、下から重ねたボタンと重なっていた。
              下端 6rem ぶんはボタンの場所なので、そこまでで止める。
            */
            className={
              shown || !slow
                ? "sr-only"
                : "pointer-events-none absolute inset-x-0 top-0 bottom-24 flex items-center justify-center px-6 text-center text-2xl font-bold leading-relaxed"
            }
          >
            {title}
          </h1>
        </div>

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
