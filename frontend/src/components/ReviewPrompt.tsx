/**
 * 見返しどきの教材を出す。
 *
 * 人は覚えたことを翌日には半分忘れる。忘れたまま放っておけば、
 * 7日かけて学んだことは残らない。
 *
 * 出し方の決まり
 * --------------
 * **見返しどきが無ければ、何も出さない。** 常に置いておくと、
 * 見返す必要が無い日にも「やり残しがある」ように見える。
 *
 * 点数も、覚えている割合も出さない。相手はAIに不安がある初心者で、
 * 測られると低い点を取った人からいなくなる。
 * 「そろそろもう一度」とだけ言って、手を動かすほうへ戻す。
 */

import { useEffect, useState } from "react";

import { fetchReview, type ReviewItem } from "../api/history";
import { lookupLesson } from "../course/live";
import { isStartable } from "../course/availability";

export interface ReviewPromptProps {
  onSelectLesson: (lessonId: string) => void;
}

export function ReviewPrompt({ onSelectLesson }: ReviewPromptProps) {
  const [due, setDue] = useState<ReviewItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchReview(controller.signal)
      .then((review) => {
        /*
          いま見返しどきのものだけを出す。まだ時期でないものは
          ここに出さない——「まだやらなくていいもの」を毎日見せても、
          できていない感じが増えるだけになる。

          始められない教材（近日公開へ戻された、など）は外す。
          押しても開けないものを勧めない。
        */
        setDue(
          review.items.filter((item) => {
            if (!item.due) return false;
            const lesson = lookupLesson(item.lesson_id);
            return lesson !== null && isStartable(lesson);
          }),
        );
      })
      .catch(() => {
        // 復習は「あると良いもの」。取れなくても画面を壊さない
      });
    return () => controller.abort();
  }, []);

  if (due.length === 0) return null;

  return (
    <section className="mt-7" aria-labelledby="review-heading" data-testid="review-prompt">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="review-heading" className="section-title">
          そろそろもう一度
        </h2>
        <span className="text-xs text-ink-muted">{due.length}本</span>
      </div>

      <p className="mt-1 text-xs leading-6 text-ink-muted">
        一度やったことも、間をあけてもう一度やると身につきます。
      </p>

      <ul className="mt-2" role="list">
        {due.map((item) => {
          const lesson = lookupLesson(item.lesson_id);
          return (
            <li key={item.lesson_id}>
              <button
                type="button"
                onClick={() => onSelectLesson(item.lesson_id)}
                data-testid={`review-${item.lesson_id}`}
                className="row row-tap items-baseline"
              >
                <span className="min-w-0 flex-1 text-sm leading-6">
                  {lesson?.title ?? item.lesson_id}
                </span>
                <span className="shrink-0 self-center text-xs tabular-nums text-ink-muted">
                  {item.times_done}回やりました
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
