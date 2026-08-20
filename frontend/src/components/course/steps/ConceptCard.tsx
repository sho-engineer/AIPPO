/**
 * ミニ解説カード。
 *
 * 手を動かしたあとに、いま起きたことの理屈を短く置く。
 * 先に読ませない——読んでから試すと、読んだことの確認作業になる。
 */

import type { ConceptCard } from "../../../course/types";

// --------------------------------------------------------- ミニ解説カード

/**
 * 1画面1ポイントの解説。
 *
 * 講義スライドにしない。文字を増やすほど読まれなくなるので、
 * 型のほうで長さを縛ってある（types.ts）。
 * 図は5種類だけ。凝ったものは作らない。
 */
export function ConceptCardView({
  card,
  headingShown = false,
}: {
  card: ConceptCard;
  /**
   * 見出しが画面の上にもう出ているか。
   *
   * 解説の見出しはステップの見出しと同じ文字なので、囲いの中でもう一度
   * 書くと、1画面に同じ言葉が2回並ぶ。実際そうなっていた。
   */
  headingShown?: boolean;
}) {
  return (
    /*
      囲いを外して、左の罫だけにする。

      角丸の箱に入れると、それだけで画面の主役になる。ここは教科書の
      「POINT」くらいの重さでよく、主役は直前に見たAIの結果のほう。
    */
    <div data-testid="concept-card" className="border-l-2 border-brand pl-4">
      {!headingShown && (
        <h2 className="text-base font-bold text-brand-dark">{card.title}</h2>
      )}
      <p className={`text-sm leading-7 ${headingShown ? "" : "mt-2"}`}>{card.body}</p>

      {card.visual === "before_after" && card.before && card.after && (
        <div className="mt-4 space-y-2">
          <p className="rounded-card bg-canvas px-4 py-2 text-sm leading-7 text-ink-muted">
            <span aria-hidden="true">− </span>
            {card.before}
          </p>
          <p className="rounded-card bg-brand-soft px-4 py-2 text-sm font-bold leading-7 text-brand-dark">
            <span aria-hidden="true">＋ </span>
            {card.after}
          </p>
        </div>
      )}

      {card.visual === "highlight" && card.highlight && (
        <p className="mt-4 rounded-card bg-brand-soft px-4 py-3 text-center text-base font-bold text-brand-dark">
          {card.highlight}
        </p>
      )}

      {card.visual === "three_points" && card.points && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-3" role="list">
          {card.points.map((point) => (
            <li
              key={point}
              className="rounded-card bg-brand-soft px-3 py-3 text-center text-sm font-bold text-brand-dark"
            >
              {point}
            </li>
          ))}
        </ul>
      )}

      {card.visual === "simple_flow" && card.points && (
        <ol className="mt-4 flex flex-wrap items-center gap-2" role="list">
          {card.points.map((point, index) => (
            <li key={point} className="flex items-center gap-2">
              <span className="rounded-card bg-brand-soft px-3 py-2 text-sm font-bold text-brand-dark">
                {point}
              </span>
              {index < (card.points?.length ?? 0) - 1 && (
                <span aria-hidden="true" className="text-brand-line">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
