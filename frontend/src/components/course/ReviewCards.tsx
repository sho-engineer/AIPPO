/**
 * 飛ばした解説を、あとで別の例で見返す。
 *
 * 解説は飛ばせる（それは正しい——手を動かしたいときに読ませない）。
 * ただし飛ばしたまま終わると、そこだけ穴が空く。あとで戻れる場所を
 * 1つ用意しておく。
 *
 * 同じ文をもう一度出さない
 * ------------------------
 * 二度目に同じ文を出しても、それは「さっき飛ばしたもの」でしかない。
 * 読まなかった理由が「その例がぴんと来なかった」ことなら、二度目も同じ。
 * 教材データが持っている**別の例**（reviewExample）に差し替えて見せる。
 *
 * AIは呼ばない。その場で例を作らせると、見返すたびに費用がかかるうえ、
 * 出来がその時々で変わって、教材として確かめられなくなる。
 *
 * 見終えたら控えから外す
 * ----------------------
 * 外さないと、一度見返したものが「見返すもの」に残り続ける。
 * 積み残しの山に見えると、開く気がなくなる。
 */

import { useState } from "react";

import { ConceptCardView } from "./steps/ConceptCard";
import { IconBulb, IconCheck } from "../Icons";
import { PrimaryButton } from "../aippo/PrimaryButton";
import { findStep } from "../../course/engine";
import { forgetForReview, reviewItemsFor } from "../../course/review";
import type { Course, ConceptCard } from "../../course/types";

/** 別の例に差し替えたカード。無ければ元のまま。 */
export function withReviewExample(card: ConceptCard): ConceptCard {
  const alt = card.reviewExample;
  if (!alt) return card;

  return {
    ...card,
    body: alt.body ?? card.body,
    before: alt.before ?? card.before,
    after: alt.after ?? card.after,
    points: alt.points ?? card.points,
  };
}

interface Entry {
  lessonId: string;
  lessonTitle: string;
  stepId: string;
  card: ConceptCard;
}

/**
 * 見返せるものを集める。
 *
 * 控えに残っていても、教材から消えていることがある（管理画面で
 * 差し替えた、近日公開へ戻した）。引けなかったものは黙って落とす。
 */
function collect(course: Course): Entry[] {
  const found: Entry[] = [];

  for (const lesson of course.lessons) {
    for (const item of reviewItemsFor(lesson.id)) {
      if (item.reason !== "concept_skipped") continue;

      const step = findStep(lesson, item.stepId);
      if (!step?.card) continue;

      found.push({
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        stepId: item.stepId,
        card: step.card,
      });
    }
  }
  return found;
}

export function ReviewCards({ course }: { course: Course }) {
  const [entries, setEntries] = useState<Entry[]>(() => collect(course));
  const [openId, setOpenId] = useState<string | null>(null);

  // 見返すものが無い日は、節ごと出さない。空の見出しを残さない
  if (entries.length === 0) return null;

  const done = (entry: Entry) => {
    forgetForReview(entry.lessonId, entry.stepId);
    setEntries((current) =>
      current.filter(
        (item) => !(item.lessonId === entry.lessonId && item.stepId === entry.stepId),
      ),
    );
    setOpenId(null);
  };

  return (
    <section className="mt-7" aria-labelledby="review-heading" data-testid="review-cards">
      <h2 id="review-heading" className="flex items-center gap-2 text-base font-bold">
        <IconBulb className="h-[1.125rem] w-[1.125rem] shrink-0 text-brand" />
        飛ばした解説
      </h2>
      <p className="mt-1 text-xs leading-6 text-ink-muted">
        別の例で、もう一度だけ見られます。
      </p>

      <ul className="mt-3 space-y-3" role="list">
        {entries.map((entry) => {
          const key = `${entry.lessonId}:${entry.stepId}`;
          const open = openId === key;

          return (
            <li
              key={key}
              className="rounded-panel border border-line bg-surface p-4 shadow-card"
            >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : key)}
                aria-expanded={open}
                data-testid={`review-${entry.stepId}`}
                className="flex w-full items-center gap-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold leading-6">
                    {entry.card.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {entry.lessonTitle}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold text-brand">
                  {open ? "閉じる" : "見る"}
                </span>
              </button>

              {open && (
                <div className="mt-4">
                  {/* 別の例に差し替えて見せる */}
                  <ConceptCardView card={withReviewExample(entry.card)} />

                  <div className="mt-4">
                    <PrimaryButton
                      secondary
                      onClick={() => done(entry)}
                      icon={<IconCheck className="h-5 w-5 shrink-0" />}
                      testId={`review-done-${entry.stepId}`}
                    >
                      分かった
                    </PrimaryButton>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
