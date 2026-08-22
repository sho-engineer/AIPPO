/**
 * 「こんな使い方もできます」。完了画面に置く。
 *
 * レッスンは1つの技術だけを教える。ここでその技術を実際の場面に
 * 結びつけて、「練習した」で終わらせない。
 *
 *   応用例   … 1つの技術を、そのまま仕事の場面で使う
 *   組み合わせ … このレッスンと、もう1つの技術をつなげる
 *
 * どちらも同じカードで出す。並べたときに「これは応用例」
 * 「これは組み合わせ」と分けて考える意味が薄く、見た目を2種類
 * 作ると、その違いを覚える負担のほうが大きくなる。
 *
 * どのカードからも、くわしい説明へ行ける
 * --------------------------------------
 * 以前は、技が全部そろっているカードに押せる場所が無かった
 * （受け止める画面が無く、押しても何も起きないボタンになるため）。
 * いまは `pages/RecipePage.tsx` があるので、手順と例を見に行ける。
 *
 * 出すのはやり方の案内であって、複数レッスンを1つの流れとして自動で
 * 走らせる機能ではない。「実行する」とは言わない（憲章 原則 I）。
 */

import { IconArrow, IconCheckCircle, IconChevronRight } from "../Icons";
import type { AppliedTip } from "../../course/appliedTips";

export interface AppliedTipsProps {
  tips: AppliedTip[];
  /** レッスンの id → 題。まだ終えていない技を学ぶ先を作るのに使う。 */
  lessonTitle: (lessonId: string) => string | null;
  /** 終えたレッスンの id。 */
  completedIds: string[];
  onSelectLesson?: (lessonId: string) => void;
  /** くわしい説明をひらく。渡さなければ、その導線は出さない。 */
  onOpenRecipe?: (tipId: string) => void;
}

export function AppliedTips({
  tips,
  lessonTitle,
  completedIds,
  onSelectLesson,
  onOpenRecipe,
}: AppliedTipsProps) {
  if (tips.length === 0) return null;

  return (
    <section aria-labelledby="applied-tips-heading" data-testid="applied-tips">
      <h2 id="applied-tips-heading" className="text-base font-bold">
        こんな使い方もできます
      </h2>

      <ul className="mt-3 space-y-3" role="list">
        {tips.map((tip) => (
          <AppliedTipCard
            key={tip.id}
            tip={tip}
            lessonTitle={lessonTitle}
            completedIds={completedIds}
            onSelectLesson={onSelectLesson}
            onOpenRecipe={onOpenRecipe}
          />
        ))}
      </ul>
    </section>
  );
}

function AppliedTipCard({
  tip,
  lessonTitle,
  completedIds,
  onSelectLesson,
  onOpenRecipe,
}: {
  tip: AppliedTip;
  lessonTitle: (lessonId: string) => string | null;
  completedIds: string[];
  onSelectLesson?: (lessonId: string) => void;
  onOpenRecipe?: (tipId: string) => void;
}) {
  /*
    足りない技を1つ見つける。

    2つとも足りていない組み合わせもありうるが、一度に案内するのは
    1つにする。2つ同時に「学ぶ」ボタンを出すと、
    どちらを先にすればこのカードが使えるようになるのかが読めない。
    先に並んでいるほう（flow の1つ目に近い側）を優先する。
  */
  const missing = tip.requiredLessonIds.find((id) => !completedIds.includes(id));
  const missingTitle = missing ? lessonTitle(missing) : null;

  return (
    <li
      className="rounded-panel border border-line bg-surface p-4 shadow-card"
      data-testid={`applied-tip-${tip.id}`}
    >
      <h3 className="text-sm font-bold leading-6">{tip.title}</h3>
      <p className="mt-1 text-xs leading-6 text-ink-muted">{tip.description}</p>

      {/* 使う技の並び。2件以上のときだけ矢印でつなぐ */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-hidden="true">
        {tip.flow.map((step, index) => (
          <span key={step} className="flex items-center gap-1.5">
            {index > 0 && <IconArrow className="h-3 w-3 shrink-0 text-ink-muted" />}
            <span className="rounded-badge bg-canvas px-2.5 py-1 text-[0.6875rem] font-bold text-ink-muted">
              {step}
            </span>
          </span>
        ))}
      </div>

      {missing && missingTitle ? (
        <button
          type="button"
          disabled={!onSelectLesson}
          onClick={() => onSelectLesson?.(missing)}
          data-testid={`applied-tip-learn-${tip.id}`}
          className="mt-3 flex w-full items-center justify-between gap-2 rounded-cta
                     bg-brand-soft px-4 py-2.5 text-left text-xs font-bold text-brand-dark
                     transition enabled:hover:bg-brand-line disabled:cursor-not-allowed"
        >
          {missingTitle}を学ぶ
          <IconChevronRight className="h-4 w-4 shrink-0" />
        </button>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-brand-dark">
          <IconCheckCircle className="h-3.5 w-3.5 shrink-0" />
          いまの技で使えます
        </p>
      )}

      {/*
        くわしい説明へ。技がそろっていてもいなくても出す。
        まだのときこそ「何ができるようになるか」を先に見せたい。
      */}
      {onOpenRecipe && (
        <button
          type="button"
          onClick={() => onOpenRecipe(tip.id)}
          data-testid={`applied-tip-open-${tip.id}`}
          className="mt-2 flex w-full items-center justify-between gap-2 text-left
                     text-xs font-bold text-brand-dark underline underline-offset-4"
        >
          やり方をくわしく見る
          <IconChevronRight className="h-4 w-4 shrink-0" />
        </button>
      )}
    </li>
  );
}
