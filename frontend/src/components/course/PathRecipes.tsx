/**
 * このパスで作れるようになるもの（コースの中身の画面に置く）。
 *
 * レッスンの一覧は「何を練習するか」の並びで、それだけを見ても
 * 「終えると何が作れるようになるのか」は読めない。ここでそれを見せる。
 *
 * 先に見せる
 * ----------
 * 完了画面にも同じレシピは出るが、そこで初めて知るのでは遅い。
 * 始める前に「これができるようになる」が見えているほうが、
 * 1本目に手が伸びやすい。
 *
 * 押せる先があるものだけ出す
 * --------------------------
 * 画面側の教材データ（appliedTips.ts）に無いレシピは出さない。
 * サーバー側にだけあるものを出すと、押しても開けない案内になる
 * （憲章 原則 I）。
 */

import { IconChevronRight } from "../Icons";
import { Card } from "../AppShell";
import { appliedTipById } from "../../course/appliedTips";
import type { LearningPathRecipe } from "../../api/rewards";

export interface PathRecipesProps {
  recipes: LearningPathRecipe[];
  onOpenRecipe: (recipeId: string) => void;
}

export function PathRecipes({ recipes, onOpenRecipe }: PathRecipesProps) {
  // 画面側に説明を持っているものだけ。押せない案内を作らない
  const openable = recipes.filter((recipe) => appliedTipById(recipe.id) !== null);
  if (openable.length === 0) return null;

  return (
    <Card className="mt-6" testId="path-recipes">
      <h2 className="text-base font-bold">このコースで作れるようになるもの</h2>
      <ul className="mt-3 space-y-2" role="list">
        {openable.map((recipe) => (
          <li key={recipe.id}>
            <button
              type="button"
              onClick={() => onOpenRecipe(recipe.id)}
              data-testid={`path-recipe-${recipe.id}`}
              className="flex w-full items-center justify-between gap-3 rounded-card
                         bg-canvas px-4 py-3 text-left transition hover:bg-brand-soft"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold leading-6">
                  {recipe.title}
                </span>
                {recipe.description && (
                  <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
                    {recipe.description}
                  </span>
                )}
              </span>
              <IconChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
