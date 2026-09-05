/**
 * 結果の図を切り替える2つ組。
 *
 * なぜ切り替えるのか
 * ------------------
 * 同じ4つの答えでも、知りたいことは人によって違う。
 *
 *     現在地        いまどこまで来たか。次にどこへ行くか
 *     スキルバランス どこが薄いか。偏りの形
 *
 * 両方を同時に出すと縦に伸びるうえ、**どちらを読めばよいのか
 * 決められない**。片方ずつ出して、選べるようにする。
 *
 * 見た目をタブにしない
 * --------------------
 * 別の画面へ移るわけではないので、`tab` の役は持たせる（同じ場所の
 * 中身が入れ替わる、と読み上げに伝わる）が、見た目は画面いっぱいの
 * タブ帯にしない。結果の図の上に乗る小さな切り替えで、押す先が
 * 増えたようには見せない——この画面の主導線は下のボタン1つ。
 */

import type { ReactNode } from "react";

import { IconExpand } from "../../Icons";

export type ChartKind = "stage" | "balance";

const OPTIONS: { value: ChartKind; label: string }[] = [
  { value: "stage", label: "現在地" },
  { value: "balance", label: "スキルバランス" },
];

export interface ChartSwitchProps {
  value: ChartKind;
  onChange: (next: ChartKind) => void;
  /** 図の中身。切り替えた先がここへ入る。 */
  children: ReactNode;
  /**
   * 図を押したときに、大きく開く。
   *
   * 結果の画面に置ける大きさは、いちばん低い持ち方（402×660）で
   * 送らずに収まる上限まで——実物は 92px 角で、**読むには小さい**。
   * 収める都合と、読める大きさは両立しないので、読みたい人には
   * 一枚の中で大きく出す。
   *
   * 渡されなければ押せない見た目にする（`button` を出さない）。
   */
  onExpand?: () => void;
}

export function ChartSwitch({
  value,
  onChange,
  children,
  onExpand,
}: ChartSwitchProps) {
  return (
    <div
      className="rounded-card border border-line bg-surface px-3 pb-2 pt-1.5"
      data-testid="chart-switch"
      data-kind={value}
    >
      <div
        role="tablist"
        aria-label="結果の見せ方"
        className="mx-auto flex w-full gap-0.5 rounded-badge bg-brand-soft p-0.5"
      >
        {OPTIONS.map((option) => {
          const on = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(option.value)}
              data-testid={`chart-tab-${option.value}`}
              /*
                選ばれているほうを、地の色と字の太さの2つで示す。
                色だけだと、色の差が見えにくい人には
                「どちらが出ているのか」が分からない。
              */
              className={`flex-1 rounded-badge py-0.5 text-[0.6875rem] leading-4 transition ${
                on
                  ? "bg-surface font-bold text-brand-dark shadow-card"
                  : "text-ink-muted"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {onExpand ? (
        <button
          type="button"
          onClick={onExpand}
          data-testid="chart-expand"
          aria-label="図を大きく見る"
          /*
            押せることを、隅の印1つで示す。枠や影は足さない——この面は
            もともと札の中にあり、そこへさらに枠を重ねると、押す先が
            2段あるように見える。
          */
          className="relative mt-1.5 block w-full rounded-badge transition
                     hover:bg-brand-soft/40"
        >
          {children}
          <IconExpand
            className="absolute right-0 top-0 h-3.5 w-3.5 text-ink-muted"
            aria-hidden="true"
          />
        </button>
      ) : (
        <div className="mt-1.5">{children}</div>
      )}
    </div>
  );
}
