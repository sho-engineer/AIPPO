/**
 * 学習マップ——いまどの段に居て、次に何が要るか。
 *
 * **段も要件も、ここには書かない。**
 * -------------------------------
 * 段の数・名前・要る技は、全部サーバーから来る
 * （`backend/apps/rewards/levels.py`）。画面側に写しを置くと、段を1つ
 * 足した日に「地図は6段だが一覧は5段」という状態になる。
 *
 * 判定もサーバー
 * --------------
 * 「上がれるか」を画面で数えない。上がる条件は2つあって
 * （技がそろう・実践問題を通る）、どちらも要る。ここで片方だけ数えると、
 * 画面と記録が食い違う。押せるかどうかは `challenge_open` をそのまま使う。
 */

import { getJson } from "./http";

/** 1つの技の、その人にとっての状態。 */
export interface MapSkill {
  slug: string;
  name: string;
  one_line: string;
  /** earned … 実際に取った / locked … まだ */
  status: "earned" | "locked";
  /** どのレッスンで取れるか。空なら、まだ教材が無い技 */
  lessons: string[];
}

/** 1つの段の、その人にとっての状態。地図の1区画になる。 */
export interface MapLevel {
  number: number;
  name: string;
  description: string;
  /** done … 通り過ぎた / current … いまここ / locked … まだ先 */
  status: "done" | "current" | "locked";
  /**
   * 診断で飛ばした段か。
   *
   * **技を取ったわけではない**ことを、地図で言うために要る。通り過ぎた
   * 印だけ付けて技を習得済みにすると、使えるか分からない技が並ぶ。
   */
  skipped: boolean;
  skills: MapSkill[];
  /** そろっていない技の数。0 なら挑戦できる */
  remaining: number;
  /** 昇段の実践問題があるか。無い段は「準備中」 */
  has_challenge: boolean;
  /** いま挑戦できるか。技がそろい、かつ**すぐ次の段**であること */
  challenge_open: boolean;
}

export interface LevelMap {
  current_level: number;
  /** diagnosis … 診断で決まった / rankup … 実践問題を通って上がった */
  reached_by: string;
  levels: MapLevel[];
  /** 次の段。いちばん上に居れば null（「次は Lv.6」を出さない） */
  next: MapLevel | null;
}

export function fetchLevelMap(signal?: AbortSignal): Promise<LevelMap> {
  return getJson<LevelMap>("/api/v1/rewards/map/", signal);
}
