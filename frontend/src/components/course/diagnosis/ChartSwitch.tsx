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

/*
  名前は「何が見えるか」で言う。

  前は「現在地」「スキルバランス」だった。前者は画面の見出しとも
  重なり、後者は**押すまで何が出るのか分からない**（初見で
  「バランス」が何のバランスなのか手がかりが無い）。
*/
const OPTIONS: { value: ChartKind; label: string }[] = [
  { value: "stage", label: "いまの段階" },
  { value: "balance", label: "使い方のバランス" },
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
  /**
   * 余った高さを、図に渡すか。
   *
   * 結果の画面はこちら（`true`）。中身の高さを決め打ちにすると、
   * **いちばん低い持ち方に合わせた小ささが、縦の長い端末にもそのまま
   * 出る**——92px 角の図が 844px の画面の真ん中にぽつんと乗り、下に
   * 200px の余白が残っていた。余りは図に渡す。
   *
   * 開いた一枚の中は決め打ち（`false`）。あちらは送ってよい場所なので、
   * 高さに合わせる理由が無い。
   */
  grow?: boolean;
  /**
   * 図の下に添える行。
   *
   * 「くわしく見る」をここへ入れる。独立した1行にしていたころは
   * **何の詳細なのかが分からなかった**——現在地の話なのか、
   * おすすめの話なのかが、置き場からは読めない。図と同じ札の中に
   * あれば、図の続きだと分かる。
   */
  footer?: ReactNode;
}

export function ChartSwitch({
  value,
  onChange,
  children,
  onExpand,
  grow = false,
  footer,
}: ChartSwitchProps) {
  return (
    <div
      /*
        伸びるのは**図が使える分まで**（`max-h`）。

        上限を付けないと、縦の長い端末で余りがぜんぶこの札に入る。
        ひし形はいっぱいまで大きくなるからよいが、道は横に伸びる図で
        高さを使わないので、**空の白い箱の真ん中に細い線が1本**という
        姿になっていた（390×844 で実測）。
      */
      className={`rounded-card border border-line bg-surface px-3 pb-2 pt-1.5 ${
        grow
          ? /*
              伸び縮みするが、**下限を持つ**。

              `min-h-0` のままだと、低い持ち方で札が中身より低く
              つぶれた。中の点は道の上下へはみ出して座るぶん、
              つぶれると上の切り替えに乗り上げる——402×660 で
              「いまの段階」の札の上に丸が重なって出ていた。

              縮まない形（`basis-auto`）にすると今度は高さが定まらず、
              中のひし形（`h-full`）が上限まで伸びてあふれた。
              **高さは決まったまま、下限だけ置く**のが要る。下限は
              「道＋段階の名前」が入る高さ（9rem）。ここを下回ると
              点が切り替えに乗り上げ、**切り替え自体が押せなくなる**
              （393×727 で、点が押下を横取りしていた）。
            */
            "flex min-h-[9rem] flex-1 flex-col max-h-[17rem]"
          : "shrink-0"
      }`}
      data-testid="chart-switch"
      data-kind={value}
    >
      <div
        role="tablist"
        aria-label="結果の見せ方"
        className="mx-auto flex w-full shrink-0 gap-0.5 rounded-badge bg-brand-soft p-0.5"
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
          className={`relative mt-1.5 w-full rounded-badge transition
                      hover:bg-brand-soft/40 ${
                        grow ? "flex min-h-0 flex-1 flex-col justify-center" : "block"
                      }`}
        >
          {children}
          <IconExpand
            className="absolute right-0 top-0 h-3.5 w-3.5 text-ink-muted"
            aria-hidden="true"
          />
        </button>
      ) : (
        <div className={`mt-1.5 ${grow ? "flex min-h-0 flex-1 flex-col" : ""}`}>
          {children}
        </div>
      )}

      {footer && <div className="mt-1 flex shrink-0 justify-end">{footer}</div>}
    </div>
  );
}
