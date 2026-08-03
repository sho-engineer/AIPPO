/**
 * ロゴ。
 *
 * 文字間を空けた「A I P P O」で代用していたが、それはロゴが無い画面の
 * 見た目であって、ブランドの顔ではない。支給されたロゴを使う。
 *
 * `horizontal` … 画面の見出し用（キャラクター＋文字が横並び）
 * `stacked`    … 大きく見せたいとき（キャラクターの下に文字）
 */

export type BrandLogoProps = {
  variant?: "horizontal" | "stacked";
  className?: string;
};

const SOURCES = {
  horizontal: "/brand/logo-horizontal.webp",
  stacked: "/brand/logo-stacked.webp",
} as const;

export function BrandLogo({
  variant = "horizontal",
  className = "h-9",
}: BrandLogoProps) {
  return (
    <img
      src={SOURCES[variant]}
      // ロゴは飾りではなく名前そのものなので、読み上げにも名前を出す
      alt="AIPPO"
      data-testid="brand-logo"
      className={`w-auto ${className}`}
    />
  );
}
