/**
 * AI技図鑑と、学んだ量（XP）。
 *
 * 出るのは自分のことだけ。順位も、他の人の数も、平均も返ってこない
 * （サーバー側でそもそも作っていない）。集めた数を人と比べさせない。
 *
 * 取れなかったときは、画面ごと止めずに「まだ読めていない」として扱う。
 * 図鑑は学習の本筋ではないので、ここで行き止まりを作らない。
 */

import { getJson } from "./http";

export interface SkillLesson {
  slug: string;
  title: string;
  course_slug: string;
}

export interface Skill {
  slug: string;
  name: string;
  one_line: string;
  description: string;
  example: string;
  acquired: boolean;
  acquired_at: string | null;
  /** どのレッスンで習得できるか。空の技はサーバーが返さない */
  lessons: SkillLesson[];
}

export interface SkillCombo {
  skills: string[];
  name: string;
  one_line: string;
  complete: boolean;
}

export interface XpState {
  total: number;
  level: string;
  next_level: string | null;
  /** 次の呼び名まで、あといくつ。最後まで来ていれば null */
  to_next: number | null;
}

export interface SkillDex {
  skills: Skill[];
  acquired_count: number;
  total_count: number;
  combos: SkillCombo[];
  xp: XpState;
}

export function fetchSkillDex(signal?: AbortSignal): Promise<SkillDex> {
  return getJson<SkillDex>("/api/v1/rewards/skills/", signal);
}
