/**
 * 名前の付いた枠を、それぞれ選んで埋める回。
 *
 * どこで使うか
 * ------------
 * AI活用診断のミニ問題。1つの問いに1つ答える形では、
 * **組み立てられるか**も**対応づけられるか**も測れない。
 *
 *   Q3 … 1つのお願いを3つの枠で組み立てる
 *         （何をしてほしい？ / 誰向け？ / どんな言い方？）
 *   Q4 … 3つの状況に、それぞれ合う使い方を当てる
 *
 * 見た目は違うが、やっていることは同じ——枠が並び、それぞれを
 * 一覧から選ぶ。だから部品は1つにしてある。
 *
 * 正解を出さない
 * --------------
 * 押しても「正解！」「おしい！」は出さない。**採点されている感**が
 * 出た瞬間、診断はテストになる。選んだ札に印が付くだけにする
 * （合っているかどうかは、最後の結果でまとめて返す）。
 *
 * 1画面に収める
 * -------------
 * 枠は3つまでを前提にしている。それ以上並べると、スマホでは
 * 送らないと最後の枠が見えない。教材データの側で3つに抑える。
 *
 * 札は横に流す
 * ------------
 * 枠ごとに選択肢が3〜5つあるので、2列のタイルにすると縦に伸びる。
 * ここは短い言葉しか置かない決まりにして、折り返しながら横に並べる。
 */

import { assembleParts, assembleValue, type LessonStep } from "../../../course/types";

export interface AssembleStepProps {
  step: LessonStep;
  /** 枠ごとの答えを `|` でつないだもの。 */
  value: string;
  onChange: (value: string) => void;
}

export function AssembleStep({ step, value, onChange }: AssembleStepProps) {
  const parts = step.parts ?? [];

  /*
    足りない分は空で埋める。

    値は1つの文字列なので、まだ何も選んでいないときは空文字が1つ
    しか無い。枠の数にそろえておかないと、2つ目の枠を選んだときに
    1つ目が消える。
  */
  const picked = Array.from(
    { length: parts.length },
    (_, index) => assembleParts(value)[index] ?? "",
  );

  const choose = (index: number, next: string) => {
    const updated = [...picked];
    // もう一度押したら取り消す。押し間違いをその場で直せる
    updated[index] = updated[index] === next ? "" : next;
    onChange(assembleValue(updated));
  };

  return (
    /*
      3つの枠を、送らずに全部見せる。

      札を `min-h-[2.75rem]` / `text-sm` / `gap-2` で組んだところ、
      Pixel 5（393×727）で**最後の枠が画面から出た**。枠が3つあり、
      それぞれの札が2行に折り返すので、1行あたり数 px の差が
      3倍になって効く。

          札の高さ 44 → 38px、字 15 → 14px、間 8 → 4px
          枠の名前 15 → 13px、枠どうしの間 10 → 8px

      それでも、いちばん低い持ち方（402×660）では 17px 足りなかった
      ——**ページは伸びないので外からは分からず**、入れ物の中で
      静かに送れる状態になっていた（`e2e/diagnosis.spec.ts` の
      `expectFits` が入れ物の中まで見るようにして見つけた）。

      透明な当たりに頼るのをやめた
      ----------------------------
      指で押す最小（44px）を、38px の札＋上下 3px の透明な縁
      （`before:-inset-y-[3px]`）で満たしていた。**実測すると効いて
      いたのは上だけで、実効 41px だった**——札は `gap-1`（4px）で
      折り返して並ぶので、下へ伸ばした 3px は次の行の札の縁と
      2px 重なり、後に描かれるほうが当たりを取る。

      当たりの点（札の外 2.5px）を 11個すべてで調べて分かった。
      見た目には出ないので、絵を見ても気づけない種類のずれ。

      いまは札そのものを 44px にしてある。上の実測で、この画面には
      160px の余りがあった（枠3つで 6行 ＝ 36px 増）。**当たりと
      見た目を一致させる**ほうが、あとから壊れない。
    */
    <div
      /*
        枠どうしの間も、低い持ち方では詰める。札を 44px にしたぶん
        （6行で 36px 増）を、読めなくならないところから返す。
      */
      className="flex min-h-0 flex-1 flex-col gap-1 [@media(min-height:700px)]:gap-2"
      data-testid="assemble"
    >
      {parts.map((part, index) => (
        <fieldset key={part.key} data-testid="assemble-part" data-part={part.key}>
          {/*
            枠の名前。**問いそのものは見出しが言っている**ので、
            ここは短く、札より小さくする。
          */}
          {/*
            枠の名前。**問いそのものは見出しが言っている**ので、
            ここは短く、札より小さくする。

            埋まった枠には印を付ける。3つの枠を1つずつ埋める回だと
            分かるのは下の一言だけで、**どれがまだかは自分で数えて
            いた**（枠は3つとも同じ見た目で並ぶ）。印があれば、
            残りが目で分かる。
          */}
          <legend
            className={`mb-0 flex items-center gap-1 text-[0.8125rem] font-bold
                        [@media(min-height:700px)]:mb-0.5
                        leading-5 ${picked[index] ? "text-brand-dark" : ""}`}
          >
            <span
              aria-hidden="true"
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center
                          rounded-full text-[0.625rem] ${
                            picked[index]
                              ? "bg-brand text-white"
                              : "border border-line"
                          }`}
            >
              {picked[index] ? "✓" : ""}
            </span>
            {part.label}
          </legend>

          <div className="flex flex-wrap gap-1">
            {part.options.map((option) => {
              const on = picked[index] === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => choose(index, option.value)}
                  aria-pressed={on}
                  data-testid="assemble-choice"
                  /*
                    印は色だけに頼らない（要件 §6.12）。選んだ札は
                    地の色と枠と太さの3つで変わる。
                  */
                  className={`min-h-[2.75rem] rounded-badge border px-3 py-1.5
                              text-[0.875rem] leading-6 transition
                              ${
                                on
                                  ? "border-brand bg-brand-soft font-bold text-brand-dark"
                                  : "border-line bg-surface text-ink hover:border-brand-line"
                              }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
