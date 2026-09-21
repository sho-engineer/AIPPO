/**
 * 画面でいちばん押してほしいボタン。
 *
 * 支給デザイン6枚とも、下端に幅いっぱいの青いボタンが1つある。
 * 「この画面で次にすること」が、迷う余地なく1つに決まっている形。
 * だからこの部品は**1画面に1つ**だけ置く。2つ並べたら、それはもう
 * 主役ではない（並べたいときは、片方を `secondary` にする）。
 *
 * 色は塗り分けない
 * ----------------
 * グラデーションは使わない（§16）。平らな青のほうが、押せる面としての
 * 輪郭がはっきりする。影は同じ青をうすく敷くだけに留める——
 * 濃い影を付けると、ボタンだけが画面から浮き上がって見える。
 *
 * 押した手応え
 * ------------
 * 押している間だけ 0.98 倍に縮める。指を離す前に「効いた」と分かる。
 * 動きを減らす設定の人には、index.css 側で止まる。
 *
 * 大きさは 56px。指で押す前提なので、最小の 44px より一回り大きくする。
 *
 * 一度「小さくするか」を検討して、**56px のままにすると決めた**。
 * 実機の録画を見て「下のボタンが重い」という話が出たときのこと。
 * 小さくすれば各画面に 8px 返ってくるが、この部品は14か所から
 * 使われていて、変えると**全画面が一斉に変わる**——支給デザインの
 * 形そのものが動く。狭い端末（320×568）で効くのはボタンの 8px では
 * なく中身の詰まり方のほうで、そちらは別に手当てした（診断の
 * 進み具合を1行にまとめ、Q4 の枠の区切りを直した）。
 */

import type { ReactNode } from "react";

import { playSound } from "../../course/sound";

export interface PrimaryButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  /** 文字の左に置く印。送る・作るなど、動作を表すものだけ。 */
  icon?: ReactNode;
  /** 文字の右に置く印。「次へ」の矢印など、行き先を表すもの。 */
  trailing?: ReactNode;
  /**
   * まだ押せる状態ではないが、**押せる**ボタン。
   *
   * `disabled` との違いは、押したときに反応を返せること。
   * 本物の `disabled` は押下そのものを受け取れないので、
   * 「なぜ進めないのか」をその場で言えない。押しても何も起きない
   * ボタンは、理由が分からないまま二度三度と押される。
   *
   * 見た目は押せないときと同じにする。「押せそう」に見せると、
   * 進めると思わせてから断ることになる。
   */
  blocked?: boolean;
  /** 押せない状態で押されたとき。理由を出すのに使う。 */
  onBlockedClick?: () => void;
  /** 白地に青い文字。主役の隣に置く2番目の行き先で使う。 */
  secondary?: boolean;
  /** 幅いっぱいに広げない。 */
  inline?: boolean;
  className?: string;
  testId?: string;
  ariaLabel?: string;
}

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  blocked,
  onBlockedClick,
  icon,
  trailing,
  secondary,
  inline,
  className = "",
  testId,
  ariaLabel,
}: PrimaryButtonProps) {
  const look = secondary
    ? `bg-surface text-brand-dark border border-brand-line shadow-card
       enabled:hover:bg-brand-soft`
    : `bg-brand text-white shadow-cta enabled:hover:brightness-110`;


  /*
    「押せない」を2通りで表す。

      disabled … 本当に受け付けない（送信中など、押されても困るとき）
      blocked  … 見た目は同じだが押せる。押したら理由を出す

    読み上げにはどちらも「押せない」と伝わる（aria-disabled）。
    見た目も同じにする。押した人にだけ、理由が返る。
  */
  const dim = disabled || blocked;

  return (
    <button
      type={blocked ? "button" : type}
      /*
        押した音は**ここだけ**で鳴らす。

        主要なCTAは1画面に1つと決めてあるので、ここに置けば
        「押した」の音が画面あたり1種類に収まる。設定行やタブ、
        戻るボタンにまで付けると、設定画面を触るだけで連打音になる。

        断られた回（blocked）は鳴らさない。進めなかったのに
        進んだときと同じ音が返ると、何が起きたのか分からなくなる。
      */
      onClick={
        blocked
          ? onBlockedClick
          : onClick &&
            (() => {
              playSound("tap");
              onClick();
            })
      }
      disabled={disabled}
      aria-disabled={dim || undefined}
      aria-label={ariaLabel}
      data-testid={testId}
      /*
        `min-w-0` を置く理由。

        完了画面では2つのボタンが横に並ぶ（`StepShell` の
        `secondaryProminent`）。中の文字は折り返さない決まりなので、
        そのままだと**ボタンは文字より細くなれない**——320px の端末で
        「完了する」と「もう一度試す」が並んだとき、右のボタンが
        画面の外へ 36px はみ出していた（実測。Day1・Day2 の両方）。

        `min-w-0` があれば、余地が足りないぶんは中で切り詰められる
        （下の `truncate`）。幅に余裕のある端末では何も変わらない。
      */
      className={`flex min-h-[3.5rem] min-w-0 items-center justify-center gap-2 rounded-cta
                  px-6 py-3 text-base font-bold transition
                  ${dim ? "cursor-not-allowed opacity-50 shadow-none" : "active:scale-[0.98]"}
                  ${inline ? "" : "w-full"} ${look} ${className}`}
    >
      {icon}
      {/*
        折り返さない。ボタンの文字が2行になると、高さが変わって並びが崩れる。

        入り切らないときは**末尾を省く**（`truncate`）。読めない1文字を
        見せるより、画面からはみ出さないほうを取る——押す場所そのものが
        画面の外に出ると、押せない。
      */}
      <span className="min-w-0 truncate">{children}</span>
      {trailing}
    </button>
  );
}
