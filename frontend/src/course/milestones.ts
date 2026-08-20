/**
 * コースのスタンプラリー — 節目の特典。
 *
 * 毎レッスンで配ると、配りすぎて報酬目当てになりやすい。
 * 節目（3個・6個・コース完走）だけにする。
 *
 * いまは「予告」だけ
 * ------------------
 * 特典は AI Credit（画像生成・高性能モデル・Premium Recipe などに
 * 使える想定）だが、**その使い道がまだ1つも無い**。画像コースは
 * レッスンすら実装されていない。
 *
 * 使い道の無いものを「獲得しました」と言うのは、押しても何も起きない
 * ボタンを置くのと同じ嘘になる（憲章 原則 I）。だから、ここで持つのは
 * **予告の文言**だけで、実際の残高やサーバー側の付与は持たない。
 * 「◯個達成」の下に出す文は、獲得の報告ではなく
 * 「ここまで来ると、こんな特典が届く予定です」という道案内にする。
 *
 * 使い道（画像生成コースなど）ができたときに、初めて
 *
 *   - サーバー側の残高（学習記録と同じく端末の外に真実を置く）
 *   - 付与のやり直し防止（同じレッスンを再受講しても二重に配らない）
 *   - 実際に使える場所
 *
 * を作る。ここはその前段の、見た目とやる気の設計だけ。
 */

import { startableLessons } from "./availability";
import type { Course } from "./types";

export interface MilestoneReward {
  /** 何個スタンプが埋まったら。 */
  atCount: number;
  /** 予告の文言。「🎁 1 Credit」など。 */
  label: string;
}

export interface CourseMilestones {
  rewards: MilestoneReward[];
  /** コースを完走したときの特典。 */
  completeLabel: string;
  /** コースを完走した証。「AIの最初の一歩 Complete」など。 */
  badgeTitle: string;
}

/**
 * コースごとの節目。数はここに置く（「あとで変数にすればいい」の変数）。
 *
 * 決まった型が無いコース（近日公開のものなど）は、下の
 * `defaultMilestones` に自動で倒れる。1コースずつ手で書かなくても、
 * 増えたコースにも節目が付く。
 */
const BY_COURSE: Record<string, CourseMilestones> = {
  first_step_7days: {
    rewards: [
      { atCount: 3, label: "🎁 1 Credit" },
      { atCount: 6, label: "🎁 2 Credits" },
    ],
    completeLabel: "🎁 5 Credits",
    badgeTitle: "AIの最初の一歩 Complete",
  },
};

/** 型の無いコース向けの既定値。全体を3分割した位置に節目を置く。 */
function defaultMilestones(course: Course): CourseMilestones {
  const total = startableLessons(course.lessons).length;
  const first = Math.max(1, Math.round(total / 3));
  const second = Math.max(first + 1, Math.round((total * 2) / 3));

  return {
    rewards: [
      { atCount: first, label: "🎁 1 Credit" },
      { atCount: second, label: "🎁 2 Credits" },
    ],
    completeLabel: "🎁 5 Credits",
    badgeTitle: `${course.title} Complete`,
  };
}

export function milestonesFor(course: Course): CourseMilestones {
  return BY_COURSE[course.id] ?? defaultMilestones(course);
}

/**
 * ここまで来た数（done）に対する、次の節目。
 *
 * 全部の節目を超えていたら null（あとはコース完走だけが残っている）。
 */
export function nextMilestone(
  course: Course,
  done: number,
): MilestoneReward | null {
  const { rewards } = milestonesFor(course);
  return rewards.find((reward) => reward.atCount > done) ?? null;
}

/**
 * このレッスンを終えたことで、新しく超えた節目。
 *
 * `before` と `after` の間にある節目だけを返す——1本ごとに全部を
 * 見返すと、途中の教材を並べ直しただけで前に超えた節目まで
 * 「新しく超えた」ことになりかねない。数だけで比べるのが安全。
 */
export function milestonesCrossed(
  course: Course,
  before: number,
  after: number,
): MilestoneReward[] {
  if (after <= before) return [];
  const { rewards } = milestonesFor(course);
  return rewards.filter((reward) => reward.atCount > before && reward.atCount <= after);
}
