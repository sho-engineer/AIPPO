/**
 * 選ぶための札。
 *
 * 診断の選択肢、条件のタイル、入力方法の切り替え——「並んだ中から選ぶ」
 * 場面で共通に使う。同じ操作の見た目が画面ごとに違うと、
 * 選べることに気づくまでに毎回ひと呼吸かかる。
 *
 * 選ばれていることを、色だけで表さない
 * ------------------------------------
 * 選ぶと、枠が青くなり・地がうすい青になり・右にチェックが出る。
 * 3つとも変える。色の差が見えない人には、チェックの有無だけが手がかりになる。
 *
 * チェックの場所は、選ぶ前から空けておく
 * --------------------------------------
 * 以前はチェックの `<span>` を選択時にしか描画していなかった。
 * すると選んだ瞬間に隣のテキスト列の実効幅が縮み、折り返し位置が
 * 動いていた（「自分がやることを知る」のような2行の札で特に目立つ）。
 * 選ぶ前と後でテキストの位置・幅・行数・カードの高さが変わらないように、
 * チェックの場所は常に描画し、見えるかどうかだけを切り替える。
 *
 * ラジオボタンではなく、押しボタンにする
 * --------------------------------------
 * 「1つ選ぶ」は radio のほうが素直に見えるが、このアプリの選択肢は
 * どこも `button` + `aria-pressed` で揃っている。1画面の中で片方だけ
 * 作りが変わると、キーボードの動き（矢印で移動するのか Tab で移動するのか）
 * が場所によって変わる。読み上げにも `aria-pressed` で選択状態は届く。
 */

import type { ReactNode } from "react";

import { IconCheck } from "../Icons";

export interface ChoiceButtonProps {
  label: string;
  /** 選択肢の説明。無ければ題だけ。 */
  description?: string;
  selected: boolean;
  onSelect: () => void;
  /** 左に置く印。 */
  icon?: ReactNode;
  disabled?: boolean;
  /**
   * 背の高い札にするか。
   *
   * 診断のように、2列に並べて絵と2〜3行の文が入る場面で使う。
   * 高さを決め打ちにしておかないと、3行になった札だけが伸びて
   * 列がガタつく（§18）。
   */
  tall?: boolean;
  testId?: string;
}

export function ChoiceButton({
  label,
  description,
  selected,
  onSelect,
  icon,
  disabled,
  tall,
  testId,
}: ChoiceButtonProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      data-testid={testId}
      /*
        背の高い札（2列に並ぶもの）は**縦積み**にする。

        横並びのままだと、375px の2列で文字に残る幅が 61px しかなく、
        「もっと短く」（5字）でも2行、「自分で条件を追加」（8字）は
        3行になっていた（実測）。**文字を短くしても直らない**種類の
        折り返しで、原因は札の幅の配り方のほう。

        縦に積むと文字は札の幅いっぱい（375px で約 138px）を使えるので、
        8〜9字までは1行に収まる。列は2つのまま——1列にすると
        6つで画面1枚ぶんの高さになり、選ぶ前にスクロールが要る。
      */
      className={`relative flex h-full w-full rounded-card border
                  ${
                    tall
                      ? "min-h-[6.5rem] flex-col items-start gap-2"
                      : "min-h-[3.5rem] items-center gap-3"
                  }
                  px-3.5 py-3 text-left transition
                  enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55
                  ${
                    selected
                      ? "border-brand bg-brand-soft/70"
                      : "border-line bg-surface shadow-card enabled:hover:border-brand-line"
                  }`}
    >
      {icon && <span className="shrink-0">{icon}</span>}

      {/* 縦積みのときは、文字が札の幅いっぱいを使う */}
      <span className={tall ? "w-full min-w-0" : "min-w-0 flex-1"}>
        <span
          className={`block text-sm leading-6 ${selected ? "font-bold text-brand-dark" : ""}`}
        >
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block text-xs leading-5 text-ink-muted">
            {description}
          </span>
        )}
      </span>

      {/*
        選ばれた印。色が見えなくても、これで分かる。

        横並びのときは場所を先に確保する（`opacity-0`）。無いところに
        急に 20px の場所ができると、隣の文字列の折り返しが選択のたびに
        動いてしまう。

        縦積みのときは右上へ**浮かせる**（absolute）。流れから外れるので、
        場所を取らず、文字の幅にも影響しない——確保するまでもなく
        ずれようがない。印は絵と同じ高さに座り、文字は絵の**下**から
        始まるので、右の余白を空ける必要も無い。
      */}
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full
                    bg-brand text-white transition-opacity
                    ${tall ? "absolute right-2.5 top-2.5" : ""}
                    ${selected ? "opacity-100" : "opacity-0"}`}
      >
        <IconCheck className="h-3 w-3" />
      </span>
    </button>
  );
}
