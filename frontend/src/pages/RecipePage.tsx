/**
 * 「こんな使い方もできます」の、くわしい説明。
 *
 * 完了画面のカードから来る。ここで出すのは**やり方**で、
 * 複数レッスンを自動で走らせる機能ではない。手順・使う技・
 * before/after を並べて、自分でAIに頼めるようにするところまで。
 *
 * できないことを、できるように見せない
 * ------------------------------------
 * 「この組み合わせを実行する」ボタンは置かない。押せば1つの流れとして
 * 走り出すように見えるが、そういう仕組みはまだ無い。ここは読んで
 * 分かる案内であって、実行装置ではない（憲章 原則 I）。
 *
 * 足りない技があるとき
 * --------------------
 * 使う技のうち、まだ終えていないものは、そのレッスンへ入れるようにする。
 * 「読んだが、自分にはまだできない」で終わらせない。
 */

import { AppHeader, Card } from "../components/AppShell";
import { IconArrow, IconCheckCircle, IconChevronRight } from "../components/Icons";
import { PoAvatar } from "../po/PoAvatar";
import type { AppliedTip } from "../course/appliedTips";

export interface RecipePageProps {
  tip: AppliedTip;
  /** レッスンの id → 題。使う技の一覧を作るのに要る。 */
  lessonTitle: (lessonId: string) => string | null;
  completedIds: string[];
  onSelectLesson: (lessonId: string) => void;
  onBack: () => void;
}

export function RecipePage({
  tip,
  lessonTitle,
  completedIds,
  onSelectLesson,
  onBack,
}: RecipePageProps) {
  const missing = tip.requiredLessonIds.filter(
    (id) => !completedIds.includes(id),
  );
  const ready = missing.length === 0;

  return (
    <>
      <AppHeader onBack={onBack} centered />

      <main className="page">
        <p className="text-xs font-bold text-ink-muted">こんな使い方もできます</p>
        <h1 className="mt-1 text-xl font-bold leading-8" data-testid="recipe-title">
          {tip.title}
        </h1>
        <p className="mt-2 text-sm leading-7 text-ink-muted">{tip.description}</p>

        <div className="mt-4">
          <PoAvatar
            po={{
              message: ready
                ? "いまの技で作れます。やってみよう。"
                : "あと少し。足りない技をここから学べます。",
              emotion: ready ? "celebrate" : "talking",
              action: "wait",
            }}
          />
        </div>

        {/* 使う技。終えたものには印を、まだのものには入口を置く */}
        <Card className="mt-5">
          <h2 className="text-base font-bold">使う技</h2>
          <ul className="mt-3 space-y-2" role="list" data-testid="recipe-skills">
            {tip.requiredLessonIds.map((lessonId) => {
              const title = lessonTitle(lessonId);
              const done = completedIds.includes(lessonId);

              if (!title) return null;

              return (
                <li key={lessonId}>
                  {done ? (
                    <p
                      className="flex items-center gap-2 rounded-card bg-canvas px-4 py-3
                                 text-sm font-bold text-brand-dark"
                      data-testid={`recipe-skill-done-${lessonId}`}
                    >
                      <IconCheckCircle className="h-4 w-4 shrink-0" />
                      {title}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectLesson(lessonId)}
                      data-testid={`recipe-skill-learn-${lessonId}`}
                      className="flex w-full items-center justify-between gap-2 rounded-card
                                 bg-brand-soft px-4 py-3 text-left text-sm font-bold
                                 text-brand-dark transition hover:bg-brand-line"
                    >
                      {title}を学ぶ
                      <IconChevronRight className="h-4 w-4 shrink-0" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        {/* 手順。無い項目の見出しだけを残さない */}
        {tip.steps && tip.steps.length > 0 && (
          <Card className="mt-4">
            <h2 className="text-base font-bold">やり方</h2>
            <ol className="mt-3 space-y-3" data-testid="recipe-steps">
              {tip.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm leading-7">
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center
                               rounded-full bg-brand-soft text-xs font-bold text-brand-dark"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">{step}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}

        {tip.exampleInput && tip.exampleOutput && (
          <Card className="mt-4">
            <h2 className="text-base font-bold">できあがりの例</h2>
            <div className="mt-3 space-y-3" data-testid="recipe-example">
              <div>
                <p className="text-xs font-bold text-ink-muted">入れるもの</p>
                <pre
                  className="mt-1 whitespace-pre-wrap rounded-card bg-canvas px-4 py-3
                             font-sans text-sm leading-7"
                >
                  {tip.exampleInput}
                </pre>
              </div>
              <div className="flex justify-center" aria-hidden="true">
                <IconArrow className="h-4 w-4 rotate-90 text-ink-muted" />
              </div>
              <div>
                <p className="text-xs font-bold text-ink-muted">出てくるもの</p>
                <pre
                  className="mt-1 whitespace-pre-wrap rounded-card bg-brand-soft px-4 py-3
                             font-sans text-sm leading-7 text-brand-dark"
                >
                  {tip.exampleOutput}
                </pre>
              </div>
            </div>
          </Card>
        )}

        {/*
          ここには「実行する」を置かない。

          押せば1つの流れとして走り出すように見えるが、そういう仕組みは
          まだ無い。読んで分かる案内までにとどめる。
        */}
        <Card className="mt-4">
          <p className="text-sm leading-7 text-ink-muted">
            {ready
              ? "この手順で、ふだん使っているAIにそのまま頼めます。"
              : "足りない技を学ぶと、この手順が最後まで通せるようになります。"}
          </p>
        </Card>

        <button
          type="button"
          className="btn-secondary mt-5 w-full"
          data-testid="recipe-back"
          onClick={onBack}
        >
          もどる
        </button>
      </main>
    </>
  );
}
