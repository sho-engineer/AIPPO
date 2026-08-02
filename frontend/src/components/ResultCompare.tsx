/**
 * 改善前後の比較（AIPPO 開発概要 §11 必須機能）。
 *
 * 1回目の出力と、2回目以降の出力を並べて表示する。
 * ユーザーに確認させる観点（§10 Step 5）も一緒に出す。
 */

import type { AiRunResult } from "../lesson/reducer";

export type ResultCompareProps = {
  originalText: string;
  runs: readonly AiRunResult[];
  /** 確認の観点を出すか。REVIEW_RESULT でのみ true。 */
  showChecklist?: boolean;
};

const CHECKLIST = [
  "分かりやすくなったか",
  "長さは適切か",
  "相手に合った表現か",
  "元の意味が変わっていないか",
] as const;

export function ResultCompare({
  originalText,
  runs,
  showChecklist = false,
}: ResultCompareProps) {
  return (
    <div data-testid="result-compare">
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <h3 className="text-xs font-bold text-neutral-500">もとの文章</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
            {originalText}
          </p>
        </section>

        {runs.map((run) => (
          <section
            key={run.sequence}
            data-testid={`run-${run.sequence}`}
            className="rounded-xl border border-neutral-900 bg-white p-4"
          >
            <h3 className="text-xs font-bold text-neutral-900">
              {run.sequence}回目：{run.label}
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
              {run.outputText}
            </p>
          </section>
        ))}
      </div>

      {showChecklist ? (
        <div className="mt-6 rounded-xl bg-neutral-50 p-4">
          <h3 className="text-sm font-bold">見てみましょう</h3>
          <ul className="mt-2 grid gap-1" role="list">
            {CHECKLIST.map((item) => (
              <li key={item} className="text-sm text-neutral-700">
                ・{item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
