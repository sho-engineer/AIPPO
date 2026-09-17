/**
 * 始めた直後に1度だけ出す、診断への案内。
 *
 * ホームの上に浮かべるのをやめた理由
 * ----------------------------------
 * 前はホームの上のポップアップだった。後ろに自分の記録が透けている
 * 状態で「まずは診断を」と言われると、**もう始まっている場所に
 * 引き返しを求められている**ように読める。しかも後ろのホームは
 * 押せないので、見えているのに触れないものが画面の大半を占める。
 *
 * 始める前の1枚として出す。後ろには何も無く、決めることは1つ。
 *
 * 出す・出さないを決めるのはここではない
 * --------------------------------------
 * `app/entry.ts`。この画面は、出されたら描くだけ。
 *
 * 絵を置きすぎない
 * ----------------
 * ポーと4行だけ。判断に要るのは「何の案内か・何が分かるか・どれくらい
 * かかるか・押す先」で、それ以上を足すと低い持ち方（320×568）で下の
 * 「あとで」が画面から出る。
 */

import { useEffect, useRef } from "react";

import { PrimaryButton } from "../components/aippo/PrimaryButton";
import { PO_ALT, poAssets } from "../po/assets";

export interface DiagnosisIntroPageProps {
  /** 「診断をはじめる」。開始説明を飛ばして、1問目へ。 */
  onStart: () => void;
  /** 「あとで」。そのままホームへ。 */
  onSkip: () => void;
  /**
   * この画面を出した、という記録。
   *
   * **出した時点で呼ぶ。** 閉じたときに回すと、読んだまま別の画面へ
   * 行った人や、読み込み直した人にもう一度出る。
   */
  onSeen: () => void;
}

export function DiagnosisIntroPage({
  onStart,
  onSkip,
  onSeen,
}: DiagnosisIntroPageProps) {
  /*
    「見た」を数えるのは1度だけ。

    開発中の作り直し（StrictMode の二度がけ）でも、親が描き直されても
    二度は回さない。`ref` に置いてあるので、同じ画面に居るあいだは残る。
  */
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    onSeen();
  }, [onSeen]);

  /*
    2回押されても、1回しか進まない。

    押すと画面が入れ替わるが、**指の2度目は入れ替わるより早い**ことが
    ある。2回進むと履歴に同じ行き先が2つ積まれ、診断から戻った人が
    もう一度診断に着く。
  */
  const starting = useRef(false);

  return (
    <main
      data-testid="diagnosis-intro-page"
      /*
        薄い水色の地。ホームや教材の白と見分けが付くようにする
        ——**ここはまだ学習の中ではない**ことを、色で言っておく。

        中身は上下左右の中央。下タブは出さない（`App.tsx`）。
      */
      className="mx-auto flex min-h-[100dvh] w-full max-w-page flex-col
                 items-center justify-center bg-brand-soft/40 px-6
                 pb-[max(1.5rem,env(safe-area-inset-bottom))]
                 pt-[max(1.5rem,env(safe-area-inset-top))]"
    >
      <div className="w-full text-center">
        {/*
          ポー。枠を先に決めてから絵を入れる（`aspect-square` ＋ 幅）。
          読み込みを待つあいだに高さが 0 だと、絵が届いた瞬間に下の
          ボタンが押し下げられる。
        */}
        <div
          className="mx-auto aspect-square w-32
                     [@media(min-height:700px)]:w-40
                     [@media(min-height:800px)]:w-48"
        >
          <img
            src={poAssets.question}
            alt={PO_ALT}
            width={512}
            height={512}
            data-testid="diagnosis-intro-po"
            className="h-full w-full object-contain"
          />
        </div>

        <h1 className="mt-4 text-xl font-bold leading-8 [@media(min-height:700px)]:mt-6">
          まずは診断で、
          <br />
          今のあなたを教えてね！
        </h1>

        <p className="mt-3 text-sm leading-6 text-ink-muted">
          5つの質問から、今の得意と
          <br />
          次に伸ばす力が分かるよ。
        </p>

        {/*
          押す前に決める材料。**「正解／不正解なし」をここに置く**のは、
          診断を開く前にいちばん出てくる不安がそれだから。
        */}
        <p
          className="mt-2.5 text-xs leading-5 text-ink-muted"
          data-testid="diagnosis-intro-meta"
        >
          約1分 ・ 全5問 ・ 正解／不正解なし
        </p>

        <PrimaryButton
          testId="diagnosis-intro-start"
          onClick={() => {
            if (starting.current) return;
            starting.current = true;
            onStart();
          }}
          className="mt-6 w-full"
        >
          診断をはじめる
        </PrimaryButton>

        {/*
          降りる道。**進む道のすぐ下に、同じ当たり判定で置く。**
          小さくすると「間違えて押すもの」に見え、任意のはずの診断が
          事実上の必須になる。
        */}
        <button
          type="button"
          onClick={onSkip}
          data-testid="diagnosis-intro-later"
          className="mt-1.5 min-h-[2.75rem] w-full rounded-cta px-4 text-sm
                     font-bold text-brand-dark transition hover:bg-surface"
        >
          あとで
        </button>
      </div>
    </main>
  );
}
