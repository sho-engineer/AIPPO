/**
 * このコースでできるようになること。
 *
 * **1文。** 必要なら代表例を3つまで。
 *
 * 前はここに、レシピを6枚の長いカードで並べていた。1枚ずつが題と
 * 説明を持ち、押すと別の画面へ飛ぶ。始める前の人が読むには長すぎて、
 * しかも「どれをやればこれができるのか」は結局どこにも書いていない。
 *
 * 6枚を3枚に減らしただけではない。**言うことを変えた。**
 * 主役は1文のほうで、下の代表例は「たとえばこういうもの」の添え物。
 * 1本ずつの詳しい成果は、レッスンを開いた最初の画面と、
 * AI技図鑑・マイ成果物が持っている。
 *
 * 押せる先があるものだけ出す
 * --------------------------
 * 画面側に説明を持っていないレシピは出さない。押しても開けない
 * 案内を作らない（憲章 原則 I）。
 */

import { IconChevronRight } from "../Icons";
import { appliedTipById } from "../../course/appliedTips";
import type { LearningPathRecipe } from "../../api/rewards";

/** 代表例として出す数の上限。並べると、また読み下すことになる。 */
const MAX_EXAMPLES = 3;

export interface CourseOutcomeProps {
  /** コース1つぶんの成果を1文で。無ければこの節ごと出さない。 */
  outcome?: string;
  recipes: LearningPathRecipe[];
  onOpenRecipe?: (recipeId: string) => void;
}

export function CourseOutcome({ outcome, recipes, onOpenRecipe }: CourseOutcomeProps) {
  const examples = onOpenRecipe
    ? recipes.filter((recipe) => appliedTipById(recipe.id) !== null).slice(0, MAX_EXAMPLES)
    : [];

  if (!outcome && examples.length === 0) return null;

  return (
    <section
      className="mt-7 border-l-2 border-brand pl-3"
      aria-labelledby="course-outcome-heading"
      data-testid="course-outcome"
    >
      <h2 id="course-outcome-heading" className="section-title">
        このコースでできるようになること
      </h2>

      {outcome && (
        <p data-testid="course-outcome-line" className="mt-1 text-sm leading-7">
          {outcome}
        </p>
      )}

      {examples.length > 0 && (
        <>
          <p className="mt-3 text-xs text-ink-muted">たとえば、こんなものが作れます</p>
          <ul className="mt-1" role="list" data-testid="course-outcome-examples">
            {examples.map((recipe) => (
              <li key={recipe.id}>
                <button
                  type="button"
                  onClick={() => onOpenRecipe?.(recipe.id)}
                  data-testid={`path-recipe-${recipe.id}`}
                  /*
                    カードにしない。押せることは「＞」で足りる。
                    白い箱で囲むと、上の1文より箱のほうが強くなる。
                  */
                  className="-mx-1 flex w-full items-center gap-2 rounded-card px-1 py-2
                             text-left text-sm leading-6 transition hover:bg-brand-soft/50"
                >
                  <span className="min-w-0 flex-1">{recipe.title}</span>
                  <IconChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
