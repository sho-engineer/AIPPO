/**
 * コースのスタンプラリー。
 *
 * 「n / 9」の数字だけでは、あと何本でどんな節目に届くのかが
 * 一目で分からない。丸を並べて埋めていく形にすると、進み具合そのものが
 * 手応えになる（Duolingo的な小さな達成感）。ただしゲームにはしない
 * ——ランキングも、他人との比較も、失う仕組みも置かない。
 *
 * スタンプはコース専用の絵にする
 * ------------------------------
 * ただの丸ではなく、コースごとに違う絵にする（`courseIcon`）。
 * 「文章のコースのスタンプ」だと分かるほうが、集めている実感が強い。
 *
 * 特典は「予告」だけ
 * ------------------
 * ここで見せる「🎁 1 Credit」は、獲得した報告ではない。使い道
 * （画像生成コースなど）がまだ無いので、実際の残高は持たない。
 * 詳しくは `course/milestones.ts` を参照。
 */

import { IconCheck } from "../Icons";
import { courseIcon } from "../../course/courseVisual";
import { milestonesFor, nextMilestone } from "../../course/milestones";
import type { Course } from "../../course/types";

export interface CourseStampsProps {
  course: Course;
  done: number;
  total: number;
}

/**
 * 丸を並べた行だけ。
 *
 * 埋まった分はコースの絵、そのあとの1つはいまの位置（縁取りの輪）、
 * 残りは薄い輪だけにする——`DayTrack`（ホームの道のり）と同じ
 * 「終わった・いま・まだ」の3状態の考え方をここでも使う。
 */
export function CourseStampRow({ course, done, total }: CourseStampsProps) {
  const Icon = courseIcon(course.id);

  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto py-0.5"
      role="img"
      aria-label={`${total}個中${done}個のスタンプが埋まっています`}
      data-testid="course-stamp-row"
    >
      {Array.from({ length: total }, (_, index) => {
        const filled = index < done;
        const current = index === done;

        return (
          <span
            key={index}
            aria-hidden="true"
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                        transition-colors
                        ${
                          filled
                            ? "bg-brand text-white"
                            : current
                              ? "border-2 border-brand text-transparent"
                              : "border border-line text-transparent"
                        }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        );
      })}
    </div>
  );
}

/**
 * 「あと2レッスンで 🎁 2 Credits」。ホーム用の1行。
 *
 * 「あと◯つ」が見えることそのものが背中を押す。全部の節目を
 * 超えていたら、残るはコース完走だけなので何も出さない
 * （完走はこの1行では祝わない。専用の場所で祝う）。
 */
export function NextMilestoneHint({ course, done }: { course: Course; done: number }) {
  const next = nextMilestone(course, done);
  if (!next) return null;

  const remaining = next.atCount - done;

  return (
    <p className="mt-1.5 text-xs leading-6 text-ink-muted" data-testid="next-milestone-hint">
      あと{remaining}レッスンで{" "}
      <span className="font-bold text-brand-dark">{next.label}</span>
    </p>
  );
}

/**
 * 節目の一覧。完了画面用。「3個達成」「6個達成」「Complete」を
 * 縦に並べ、もう届いているものにはチェックを付ける。
 */
export function MilestoneLegend({ course, done }: { course: Course; done: number }) {
  const { rewards, completeLabel } = milestonesFor(course);

  return (
    <ul className="mt-3 space-y-1.5" role="list" data-testid="milestone-legend">
      {rewards.map((reward) => (
        <MilestoneRow
          key={reward.atCount}
          reached={done >= reward.atCount}
          label={`${reward.atCount}個達成`}
          reward={reward.label}
        />
      ))}
      <MilestoneRow
        reached={false}
        label="コース完走"
        reward={completeLabel}
        /*
          完走そのものは、このコンポーネントの外（Course Complete の
          専用の場所）で祝う。ここでは「まだ先にある」ことだけ示す
          ——完走した回にまでチェックを付けると、この一覧自体が
          「もう見なくてよいもの」に見えてしまう。
        */
      />
    </ul>
  );
}

function MilestoneRow({
  reached,
  label,
  reward,
}: {
  reached: boolean;
  label: string;
  reward: string;
}) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span
        aria-hidden="true"
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full
                    ${reached ? "bg-brand text-white" : "border border-line"}`}
      >
        {reached && <IconCheck className="h-2.5 w-2.5" />}
      </span>
      <span className="text-ink-muted">{label}</span>
      <span className={`font-bold ${reached ? "text-ink-muted" : "text-brand-dark"}`}>
        {reward}
      </span>
    </li>
  );
}
