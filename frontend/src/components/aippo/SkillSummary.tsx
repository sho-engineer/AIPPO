/**
 * ホームに置く、AI技への入口。
 *
 * 終えた本数（`HomeStats` の「n / m レッスン完了」）とは別のことを言う。
 * あちらは**どれだけやったか**、こちらは**何ができるようになったか**。
 * 本数だけを積み上げても、できることが増えた実感にはならない。
 *
 * 出さないもの
 * ------------
 * 順位も、他の人の数も、平均も出さない。「n人中m位」は続ける理由を
 * 他人に預けることになる。出すのは自分の数だけ。
 *
 * まだ何も無いときは、この節ごと出さない。
 * 「0こ」を置いても、できることが増えていないと言われるだけになる。
 * 図鑑そのものは学習記録から開けるので、行き止まりにはならない。
 */

import { IconChevronRight, IconSparkle } from "../Icons";
import type { XpSummary } from "../../course/progress";

export interface SkillSummaryProps {
  xp: XpSummary;
  /** 覚えた技の数。 */
  skills: number;
  onOpen: () => void;
}

export function SkillSummary({ xp, skills, onOpen }: SkillSummaryProps) {
  if (skills === 0) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="skill-summary"
      className="flex w-full items-center gap-3 rounded-card border border-line
                 bg-surface px-4 py-3 text-left transition hover:bg-canvas"
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card
                   bg-brand-soft text-brand"
      >
        <IconSparkle className="h-[1.125rem] w-[1.125rem]" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold leading-6">
          AI技を{skills}こ 覚えました
        </span>
        <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
          {xp.level}
          {xp.next_level !== null && xp.to_next !== null
            ? ` ・ あと${xp.to_next}で「${xp.next_level}」`
            : ""}
        </span>
      </span>

      <IconChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
    </button>
  );
}
