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
 */

import type { ReactNode } from "react";

export interface PrimaryButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  /** 文字の左に置く印。送る・作るなど、動作を表すものだけ。 */
  icon?: ReactNode;
  /** 文字の右に置く印。「次へ」の矢印など、行き先を表すもの。 */
  trailing?: ReactNode;
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

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={testId}
      className={`flex min-h-[3.5rem] items-center justify-center gap-2 rounded-cta
                  px-6 py-3 text-base font-bold transition
                  enabled:active:scale-[0.98]
                  disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none
                  ${inline ? "" : "w-full"} ${look} ${className}`}
    >
      {icon}
      {/* 折り返さない。ボタンの文字が2行になると、高さが変わって並びが崩れる */}
      <span className="whitespace-nowrap">{children}</span>
      {trailing}
    </button>
  );
}
