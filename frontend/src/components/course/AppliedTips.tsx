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
 * 押せるのは「まだ終えていない技を学ぶ」ときだけ
 * ------------------------------------------------
 * すでに全部の技を終えている組み合わせに「試す」ボタンを置きたい
 * ところだが、複数レッスンを1つの流れとして実行する画面がまだ無い。
 * 無い機能への導線は、押しても何も起きないボタンになる
 * （憲章 原則 I）。いまは「使えます」の印だけにする。
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
}

export function AppliedTips({
  tips,
  lessonTitle,
  completedIds,
  onSelectLesson,
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
}: {
  tip: AppliedTip;
  lessonTitle: (lessonId: string) => string | null;
  completedIds: string[];
  onSelectLesson?: (lessonId: string) => void;
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
        /*
          全部の技をすでに終えている。押せる先が無いので、
          ボタンにはせず印だけにする（無い機能への導線を作らない）。
        */
        <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-brand-dark">
          <IconCheckCircle className="h-3.5 w-3.5 shrink-0" />
          いまの技で使えます
        </p>
      )}
    </li>
  );
}
